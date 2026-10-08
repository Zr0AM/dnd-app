// The initiative order and turn loop — the engine that drives a fight round by
// round (SRD "The Order of Combat"). It handles initiative, per-turn resources
// (action / bonus action / movement), movement with Opportunity Attacks, basic
// weapon attacks wired to condition-derived advantage, death saves at the start
// of a dying creature's turn, and detecting when one side has won.
//
// What to *do* on a turn is delegated to an injected policy, so the loop is
// testable without the full AI (which arrives in a later phase). The policy acts
// through a restricted TurnApi that enforces the action economy.

import { rollD20, roll as rollDiceTerm, meanDice, type Advantage } from '../dice/dice';
import { Random } from '../rng/rng';
import { Grid, distanceFt, stepDistance, type Cell } from '../grid/grid';
import { applyResponse } from './damage';
import { resolveAttack, resolveSave, type AttackProfile } from './attack';
import { raysAt, type Spell } from './spell';
import {
  attackAdvantage,
  canAct,
  canReact,
  effectiveSpeedFt,
  isAutoCritTarget,
} from './conditions';
import type { Combatant, Side } from './actor';

/** A single logged combat event, for replay and metrics. */
export type CombatEvent =
  | { kind: 'initiative'; order: { id: string; total: number }[] }
  | { kind: 'round'; round: number }
  | { kind: 'turn'; id: string; round: number }
  | { kind: 'move'; id: string; from: Cell; to: Cell; costFt: number }
  | {
      kind: 'attack';
      attacker: string;
      target: string;
      weapon: string;
      d20: number;
      hit: boolean;
      crit: boolean;
      damage: number;
    }
  | { kind: 'opportunity'; attacker: string; target: string; hit: boolean; damage: number }
  | {
      kind: 'spell';
      caster: string;
      spell: string;
      slotLevel: number;
      targets: number;
      damage: number;
      healing: number;
    }
  | { kind: 'down'; id: string }
  | { kind: 'death'; id: string }
  | { kind: 'deathSave'; id: string; d20: number; success: boolean }
  | { kind: 'controlDenied'; victim: string; source: string }
  | { kind: 'concentrationBroken'; id: string }
  /** Non-spell healing (Paladin Lay on Hands) from `source` to `target`. */
  | { kind: 'heal'; source: string; target: string; amount: number }
  /** The Ranger placed Hunter's Mark on a target. */
  | { kind: 'marked'; source: string; target: string }
  /** A legendary action: a boss attacked between other creatures' turns. */
  | { kind: 'legendary'; source: string; target: string; damage: number }
  /** A buff was placed on an ally. `source` is the caster, `target` the recipient. */
  | { kind: 'buffApplied'; source: string; buff: string; target: string }
  /** A buff materially helped the recipient (boosted roll / extra attack). */
  | { kind: 'buffBoost'; source: string; buff: string; beneficiary: string; amount: number }
  | { kind: 'end'; round: number; winner: Side | null };

/** Per-turn resource budget. */
export interface TurnResources {
  action: boolean;
  bonus: boolean;
  movementFt: number;
  /** Remaining attacks in the current Attack action (set when the action is spent). */
  attacksRemaining: number;
  /** Extra single-attack actions from a buff (Haste), each good for one weapon attack. */
  extraAttackActions: number;
}

/** The restricted interface a policy uses to act on its turn. */
export interface TurnApi {
  readonly self: Combatant;
  readonly resources: TurnResources;
  enemies(): Combatant[];
  allies(): Combatant[];
  /** Allies including downed-but-alive ones (for healing), excluding self. */
  allAllies(): Combatant[];
  /** Straight-line move to `dest`, spending movement and provoking OAs. Returns success. */
  moveTo(dest: Cell): boolean;
  /** Make a weapon attack with an action. Returns the damage dealt, or null if illegal. */
  attack(target: Combatant, profile: AttackProfile): number | null;
  /**
   * Cast a spell at a target (or, for a point/area spell, aimed at `target`'s
   * cell). Spends the action and a slot (cantrips are free). Returns the total
   * damage dealt, or null if illegal (no slot, out of range, wrong action).
   */
  castSpell(
    spell: Spell,
    target: Combatant,
    slotLevel?: number,
    quickened?: boolean,
  ): number | null;
  /** Heal an ally from a pool as a Bonus Action (Paladin Lay on Hands). Returns HP restored, or null. */
  layOnHands(target: Combatant): number | null;
  /** Place Hunter's Mark on an enemy as a Bonus Action (Ranger). Returns success. */
  markTarget(target: Combatant): boolean;
}

/** A policy decides what one creature does on its turn by calling the TurnApi. */
export type TurnPolicy = (api: TurnApi) => void;

/** Sorcery Points a Quickened Spell costs (Metamagic). */
const QUICKEN_COST = 2;

/** A policy that ends the turn immediately (the default). */
export const idlePolicy: TurnPolicy = () => {};

export interface EncounterOptions {
  readonly grid: Grid;
  readonly combatants: readonly Combatant[];
  readonly rng: Random;
  /** Returns the policy for a given combatant. Defaults to idle. */
  readonly policyFor?: (c: Combatant) => TurnPolicy;
}

export interface RunResult {
  readonly rounds: number;
  readonly winner: Side | null;
  readonly log: readonly CombatEvent[];
}

export class Encounter {
  readonly grid: Grid;
  readonly combatants: Combatant[];
  readonly rng: Random;
  private readonly policyFor: (c: Combatant) => TurnPolicy;
  round = 0;
  private order: Combatant[] = [];
  private readonly log: CombatEvent[] = [];
  /** Monotonic counter so each concentration save draws a distinct stream value. */
  private concSeq = 0;

  constructor(opts: EncounterOptions) {
    this.grid = opts.grid;
    this.combatants = [...opts.combatants];
    this.rng = opts.rng;
    this.policyFor = opts.policyFor ?? (() => idlePolicy);
  }

  get events(): readonly CombatEvent[] {
    return this.log;
  }

  private conscious(side: Side): Combatant[] {
    return this.combatants.filter((c) => c.side === side && c.isConscious);
  }

  /** The fight is over when at most one side still has a conscious combatant. */
  isOver(): boolean {
    return this.conscious('party').length === 0 || this.conscious('enemy').length === 0;
  }

  winner(): Side | null {
    const party = this.conscious('party').length > 0;
    const enemy = this.conscious('enemy').length > 0;
    if (party === enemy) return null; // both or neither
    return party ? 'party' : 'enemy';
  }

  /**
   * Roll initiative: d20 + Dex modifier, advantage if Invisible, disadvantage if
   * Incapacitated when rolling (the surprise rule). Ordered high to low; ties
   * break by Dex modifier, then party before enemy, then id — deterministic.
   */
  rollInitiative(): Combatant[] {
    const scored = this.combatants.map((c) => {
      let adv: Advantage = 'normal';
      if (c.hasCondition('invisible')) adv = 'advantage';
      if (c.hasCondition('incapacitated')) adv = 'disadvantage';
      const total = rollD20(this.rng.stream(`initiative:${c.id}`), adv) + c.abilityMod('dex');
      return { c, total };
    });
    scored.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const dm = b.c.abilityMod('dex') - a.c.abilityMod('dex');
      if (dm !== 0) return dm;
      if (a.c.side !== b.c.side) return a.c.side === 'party' ? -1 : 1;
      return a.c.id < b.c.id ? -1 : 1;
    });
    this.order = scored.map((s) => s.c);
    this.log.push({
      kind: 'initiative',
      order: scored.map((s) => ({ id: s.c.id, total: s.total })),
    });
    return this.order;
  }

  /** Run one round: every combatant acts in initiative order. */
  runRound(): void {
    if (this.order.length === 0) this.rollInitiative();
    this.round += 1;
    this.log.push({ kind: 'round', round: this.round });

    for (const c of this.order) {
      if (this.isOver()) break;
      if (c.dead) continue;

      // A boss refreshes its legendary actions at the start of its own turn.
      if (c.legendaryMax > 0) c.refreshLegendary();

      // Start of turn: a dying creature rolls a death save and does nothing else.
      if (c.isDying) {
        if (!c.stable) {
          const out = c.rollDeathSave(this.rng.stream(`death:${c.id}`));
          this.log.push({ kind: 'deathSave', id: c.id, d20: out.d20, success: out.success });
          if (out.died) this.log.push({ kind: 'death', id: c.id });
        }
        this.takeLegendaryActions(c);
        continue;
      }

      if (!canAct(c)) {
        // The creature's turn is denied; attribute it to whoever controls it.
        for (const source of new Set(c.controlSources())) {
          this.log.push({ kind: 'controlDenied', victim: c.id, source });
        }
        this.endOfTurn(c);
        this.takeLegendaryActions(c);
        continue;
      }

      // Start-of-turn feature hooks (reset per-turn state, auto-activate Rage, ...).
      for (const f of c.features) f.onTurnStart?.(c);

      this.log.push({ kind: 'turn', id: c.id, round: this.round });
      let extraAttackActions = c.hasExtraAttackAction() ? 1 : 0;
      for (const f of c.features) extraAttackActions += f.bonusAttackActions?.(c) ?? 0;
      const resources: TurnResources = {
        action: true,
        bonus: true,
        movementFt: effectiveSpeedFt(c),
        attacksRemaining: 0,
        extraAttackActions,
      };
      this.policyFor(c)(this.makeApi(c, resources));
      this.endOfTurn(c);
      this.takeLegendaryActions(c);
    }
  }

  /** End-of-turn upkeep: tick timed conditions (repeat saves, durations) and buffs. */
  private endOfTurn(c: Combatant): void {
    c.tickTimedConditions(this.rng.stream(`tick:${c.id}:${this.round}`));
    c.tickBuffs();
  }

  /**
   * At the end of `justActed`'s turn, each other conscious boss may spend one
   * legendary action to attack its nearest reachable opponent (a single attack with
   * its strongest weapon). Spread across the round, this is the extra action economy
   * a legendary boss brings. Legendary options beyond a simple attack (wing buffets,
   * moves, saves) are a documented simplification left out.
   */
  private takeLegendaryActions(justActed: Combatant): void {
    for (const boss of this.combatants) {
      if (boss === justActed || !boss.isConscious || boss.legendaryRemaining <= 0) continue;
      const weapon = bestAttack(boss);
      if (!weapon) continue;
      const reach =
        weapon.kind === 'melee'
          ? (weapon.reachFt ?? 5)
          : (weapon.rangeLongFt ?? weapon.rangeFt ?? 5);
      const target = this.combatants
        .filter((t) => t.side !== boss.side && t.isConscious)
        .sort(
          (a, b) =>
            distanceFt(boss.position, a.position, this.grid.cellFt) -
            distanceFt(boss.position, b.position, this.grid.cellFt),
        )[0];
      if (!target) continue;
      if (distanceFt(boss.position, target.position, this.grid.cellFt) > reach) continue;
      if (!boss.spendLegendary()) continue;
      const dmg = this.resolveWeaponAttack(boss, target, weapon, 'opportunity') ?? 0;
      this.log.push({ kind: 'legendary', source: boss.id, target: target.id, damage: dmg });
    }
  }

  /** Run the fight to a conclusion (or the round cap). */
  run(maxRounds = 100): RunResult {
    if (this.order.length === 0) this.rollInitiative();
    while (!this.isOver() && this.round < maxRounds) {
      this.runRound();
    }
    const winner = this.winner();
    this.log.push({ kind: 'end', round: this.round, winner });
    return { rounds: this.round, winner, log: this.log };
  }

  private makeApi(self: Combatant, resources: TurnResources): TurnApi {
    return {
      self,
      resources,
      enemies: () => this.combatants.filter((c) => c.side !== self.side && c.isConscious),
      allies: () =>
        this.combatants.filter((c) => c.side === self.side && c.isConscious && c !== self),
      allAllies: () =>
        this.combatants.filter((c) => c.side === self.side && c.isAlive && c !== self),
      moveTo: (dest) => this.moveTo(self, dest, resources),
      attack: (target, profile) => this.attack(self, target, profile, resources),
      castSpell: (spell, target, slotLevel, quickened) =>
        this.castSpell(self, spell, target, slotLevel, resources, quickened),
      layOnHands: (target) => this.layOnHands(self, target, resources),
      markTarget: (target) => this.markTarget(self, target, resources),
    };
  }

  /**
   * Place Hunter's Mark (Ranger): a Bonus Action that marks an enemy and starts
   * concentration, spending one of the ranger's free uses (Favored Enemy). The
   * Hunter's Mark feature then adds its damage to hits on the marked target.
   */
  private markTarget(self: Combatant, target: Combatant, resources: TurnResources): boolean {
    if (!resources.bonus || target.side === self.side) return false;
    if (self.resourceCount('hunters-mark') <= 0) return false;
    self.spendResource('hunters-mark', 1);
    self.markedTarget = target.id;
    self.concentratingOn = 'hunters-mark';
    resources.bonus = false;
    this.log.push({ kind: 'marked', source: self.id, target: target.id });
    return true;
  }

  /** Lay on Hands: a Bonus Action that heals `target` from the 'lay-on-hands' pool. */
  private layOnHands(self: Combatant, target: Combatant, resources: TurnResources): number | null {
    if (!resources.bonus) return null;
    const pool = self.resourceCount('lay-on-hands');
    if (pool <= 0 || !target.isAlive) return null;
    const missing = Math.max(1, target.maxHp - target.hp);
    const draw = Math.min(pool, missing);
    const healed = target.heal(draw);
    self.spendResource('lay-on-hands', draw);
    resources.bonus = false;
    this.log.push({ kind: 'heal', source: self.id, target: target.id, amount: healed });
    return healed;
  }

  /**
   * Resolve a spell cast. Cantrips cost the action only; leveled spells also spend
   * a slot of `slotLevel` (default the spell's own level). An attack-damage spell
   * makes a spell attack per ray; a save-damage spell makes the target (and, for an
   * area spell, every enemy in radius of its cell) roll a save. Returns total
   * damage, or null if the cast is illegal.
   */
  private castSpell(
    self: Combatant,
    spell: Spell,
    target: Combatant,
    slotLevelArg: number | undefined,
    resources: TurnResources,
    quickened = false,
  ): number | null {
    // Action economy: a spell normally uses the action (bonus-action spells use the
    // bonus). Quickened Spell (Sorcerer Metamagic) casts it as a Bonus Action for 2
    // Sorcery Points instead, enabling a second spell in the turn.
    if (quickened) {
      if (!resources.bonus || self.resourceCount('sorcery') < QUICKEN_COST) return null;
    } else if (spell.action === 'bonus') {
      if (!resources.bonus) return null;
    } else if (!resources.action) {
      return null;
    }

    const slotLevel = spell.level === 0 ? 0 : (slotLevelArg ?? spell.level);
    if (spell.level > 0 && slotLevel < spell.level) return null;
    if (spell.level > 0 && self.slotCount(slotLevel) <= 0) return null;

    // Range check against the primary target's cell.
    const dist = distanceFt(self.position, target.position, this.grid.cellFt);
    if (dist > spell.rangeFt) return null;

    const dmgStream = this.rng.stream(`${self.id}:${spell.id}:dmg`);
    let totalDamage = 0;
    let totalHealing = 0;
    let targetsHit = 0;

    if (spell.kind.type === 'heal') {
      // Target is an ally; restore HP (reviving if at 0).
      const mod = self.spellAbility ? self.abilityMod(self.spellAbility) : 0;
      const amount =
        rollDiceTerm(dmgStream, spell.kind.dice(slotLevel, self.level)) +
        (spell.kind.addSpellMod ? mod : 0);
      totalHealing = target.heal(amount);
      targetsHit = 1;
    } else if (spell.kind.type === 'attack-damage') {
      const kind = spell.kind;
      // Beam count: level-based (Eldritch Blast) or the upcast-ray path.
      const rays = kind.beams
        ? kind.beams(self.level)
        : raysAt(kind, slotLevel, Math.max(1, spell.level));
      const damage = kind.damage(slotLevel, self.level);
      // Agonizing Blast adds the caster's spell modifier to each beam's damage.
      const perBeamBonus =
        kind.addSpellMod && self.spellAbility ? self.abilityMod(self.spellAbility) : 0;
      for (let r = 0; r < rays; r++) {
        if (!target.isConscious) break;
        const buffToHit = this.rollBuffAttackBonus(self, `${spell.id}:${target.id}:${r}`);
        const atkStream = this.rng.stream(`${self.id}:${spell.id}:${target.id}:atk:${r}`);
        const result = resolveAttack(atkStream, {
          attackBonus: self.spellAttackBonus() + buffToHit,
          targetAc: target.effectiveAc(),
          advantage: attackAdvantage(self, target, dist <= 5),
        });
        if (result.hit) {
          let raw = rollDiceTerm(dmgStream, damage);
          if (result.crit) raw += rollDiceTerm(dmgStream, { ...damage, bonus: 0 });
          raw += perBeamBonus;
          const dealt = applyResponse(raw, target.damageResponseFor(kind.damageType));
          totalDamage += this.applySpellDamage(self, target, dealt);
        }
      }
      if (totalDamage > 0) targetsHit = 1;
    } else if (spell.kind.type === 'control') {
      // save-or-condition: each target saves; on a failure the condition is applied
      // for a duration, repeating the save each turn to shake it off.
      const kind = spell.kind;
      const victims =
        kind.aoeRadiusFt != null
          ? this.combatants.filter(
              (c) =>
                c.side !== self.side &&
                c.isConscious &&
                distanceFt(target.position, c.position, this.grid.cellFt) <= kind.aoeRadiusFt!,
            )
          : [target];
      const dc = self.spellSaveDc();
      for (const v of victims) {
        const save = resolveSave(this.rng.stream(`${self.id}:${spell.id}:${v.id}:save`), {
          saveBonus:
            v.saveBonus(kind.save) +
            this.rollBuffSaveBonus(v, `${spell.id}:${self.id}`) +
            this.auraSaveBonus(v),
          dc,
        });
        if (!save.success) {
          v.applyTimedCondition({
            condition: kind.condition,
            source: self.id,
            rounds: kind.rounds,
            repeatSave: kind.repeatSaveEndsEffect
              ? { ability: kind.save, dc, endsOnSuccess: true }
              : undefined,
            concentrationOwner: spell.concentration ? self.id : undefined,
          });
          targetsHit++;
        }
      }
    } else if (spell.kind.type === 'buff') {
      // Place a beneficial effect on up to maxTargets allies (the chosen target
      // first, then any others in range), refreshing rather than stacking.
      const kind = spell.kind;
      const eligible = (c: Combatant): boolean =>
        c.side === self.side &&
        c !== self &&
        c.isConscious &&
        distanceFt(self.position, c.position, this.grid.cellFt) <= spell.rangeFt;
      const others = this.combatants.filter((c) => c !== target && eligible(c));
      const chosen = (eligible(target) ? [target, ...others] : others).slice(0, kind.maxTargets);
      for (const ally of chosen) {
        ally.applyBuff({
          id: kind.buffId,
          source: self.id,
          rounds: kind.rounds,
          attackBonusDice: kind.attackBonusDice,
          saveBonusDice: kind.saveBonusDice,
          acBonus: kind.acBonus,
          extraAttackAction: kind.extraAttackAction,
          concentrationOwner: spell.concentration ? self.id : undefined,
        });
        this.log.push({ kind: 'buffApplied', source: self.id, buff: kind.buffId, target: ally.id });
        targetsHit++;
      }
      // A buff with no valid recipient should not consume the slot/action.
      if (chosen.length === 0) return null;
    } else {
      // save-damage: gather targets (area or single).
      const kind = spell.kind;
      const victims =
        kind.aoeRadiusFt != null
          ? this.combatants.filter(
              (c) =>
                c.side !== self.side &&
                c.isConscious &&
                distanceFt(
                  kind.selfOrigin ? self.position : target.position,
                  c.position,
                  this.grid.cellFt,
                ) <= kind.aoeRadiusFt!,
            )
          : [target];
      const damage = kind.damage(slotLevel, self.level);
      const dc = self.spellSaveDc();
      // Area damage is rolled once and shared (2024 rule).
      const rolled = rollDiceTerm(dmgStream, damage);
      for (const v of victims) {
        const save = resolveSave(this.rng.stream(`${self.id}:${spell.id}:${v.id}:save`), {
          saveBonus:
            v.saveBonus(kind.save) +
            this.rollBuffSaveBonus(v, `${spell.id}:${self.id}`) +
            this.auraSaveBonus(v),
          dc,
        });
        let amount = rolled;
        if (save.success) amount = kind.onSuccess === 'half' ? Math.floor(rolled / 2) : 0;
        const dealt = applyResponse(amount, v.damageResponseFor(kind.damageType));
        if (dealt > 0) {
          totalDamage += this.applySpellDamage(self, v, dealt);
          targetsHit++;
        }
      }
    }

    // Spend resources.
    if (quickened) {
      resources.bonus = false;
      self.spendResource('sorcery', QUICKEN_COST);
    } else if (spell.action === 'bonus') {
      resources.bonus = false;
    } else {
      resources.action = false;
    }
    if (spell.level > 0) self.spendSlot(slotLevel);
    if (spell.concentration) self.concentratingOn = spell.id;

    this.log.push({
      kind: 'spell',
      caster: self.id,
      spell: spell.name,
      slotLevel,
      targets: targetsHit,
      damage: totalDamage,
      healing: totalHealing,
    });
    return totalDamage;
  }

  /** Apply spell damage to a target and log any down/death. */
  private applySpellDamage(source: Combatant, target: Combatant, dealt: number): number {
    const before = target.isConscious;
    const outcome = target.takeDamage(dealt);
    if (before && outcome.dropped) {
      this.log.push({ kind: 'down', id: target.id });
      this.fireOnKill(source, target);
    }
    if (outcome.died) this.log.push({ kind: 'death', id: target.id });
    this.checkConcentration(target, dealt);
    return dealt;
  }

  /** Notify the killer's features that it dropped `victim` (Warlock Dark One's Blessing). */
  private fireOnKill(killer: Combatant, victim: Combatant): void {
    for (const f of killer.features) f.onKill?.(killer, victim);
  }

  /**
   * A creature that takes damage while concentrating makes a Constitution save
   * (DC 10 or half the damage, whichever is higher). On a failure its
   * concentration ends and every effect it was sustaining is removed.
   */
  private checkConcentration(target: Combatant, dealt: number): void {
    if (dealt <= 0 || target.concentratingOn === null || !target.isConscious) return;
    const dc = Math.max(10, Math.floor(dealt / 2));
    const save = resolveSave(this.rng.stream(`${target.id}:conc:${this.concSeq++}`), {
      saveBonus:
        target.saveBonus('con') +
        this.rollBuffSaveBonus(target, `conc:${this.concSeq}`) +
        this.auraSaveBonus(target),
      dc,
    });
    if (!save.success) {
      target.concentratingOn = null;
      target.markedTarget = null; // Hunter's Mark drops with concentration
      for (const c of this.combatants) {
        c.endConcentrationConditions(target.id);
        c.endConcentrationBuffs(target.id);
      }
      this.log.push({ kind: 'concentrationBroken', id: target.id });
    }
  }

  /**
   * Straight-line move to `dest`. Cost is 5 ft per step, doubled for entering
   * difficult terrain. Fails if any cell on the path is impassable or the cost
   * exceeds remaining movement. Opportunity Attacks are resolved for enemies the
   * mover leaves the reach of (start-vs-end reach; a known simplification that
   * ignores foes merely passed through mid-path).
   */
  private moveTo(self: Combatant, dest: Cell, resources: TurnResources): boolean {
    if (!this.grid.isPassable(dest)) return false;
    const path = linePath(self.position, dest);
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      if (!this.grid.isPassable(step)) return false;
      cost += this.grid.cellFt * (this.grid.isDifficult(step) ? 2 : 1);
    }
    if (cost > resources.movementFt) return false;

    // Enemies who had the mover within reach before the move may take an OA.
    const provoked = this.combatants.filter(
      (e) =>
        e.side !== self.side &&
        e.isConscious &&
        canReact(e) &&
        this.hasMeleeReach(e, self.position) &&
        !this.hasMeleeReach(e, dest),
    );

    const from = self.position;
    self.position = dest;
    resources.movementFt -= cost;
    this.log.push({ kind: 'move', id: self.id, from, to: dest, costFt: cost });

    for (const e of provoked) this.opportunityAttack(e, self);
    return true;
  }

  /** An ally of `attacker` (not itself, not incapacitated) is within 5 ft of `target`. */
  private hasAllyAdjacentTo(attacker: Combatant, target: Combatant): boolean {
    return this.combatants.some(
      (c) =>
        c !== attacker &&
        c.side === attacker.side &&
        c.isConscious &&
        !c.hasCondition('incapacitated') &&
        distanceFt(c.position, target.position, this.grid.cellFt) <= 5,
    );
  }

  private hasMeleeReach(attacker: Combatant, targetCell: Cell): boolean {
    const reach = attacker.attacks.find((a) => a.kind === 'melee')?.reachFt ?? 5;
    const d = distanceFt(attacker.position, targetCell, this.grid.cellFt);
    return d > 0 && d <= reach;
  }

  private opportunityAttack(attacker: Combatant, target: Combatant): void {
    const profile = attacker.attacks.find((a) => a.kind === 'melee');
    if (!profile) return;
    const dmg = this.resolveWeaponAttack(attacker, target, profile, 'opportunity');
    this.log.push({
      kind: 'opportunity',
      attacker: attacker.id,
      target: target.id,
      hit: dmg !== null && dmg > 0,
      damage: dmg ?? 0,
    });
  }

  private attack(
    self: Combatant,
    target: Combatant,
    profile: AttackProfile,
    resources: TurnResources,
  ): number | null {
    if (!target.isConscious) return null;
    // The first attack spends the Attack action and grants the Extra Attack(s);
    // further attacks in the same action draw from attacksRemaining. Once both are
    // spent, a Haste-style extra action can fund one more single weapon attack.
    const usingAction = resources.action;
    const usingExtra =
      !usingAction && resources.attacksRemaining <= 0 && resources.extraAttackActions > 0;
    if (!usingAction && resources.attacksRemaining <= 0 && !usingExtra) return null;

    const dmg = this.resolveWeaponAttack(self, target, profile, 'action');
    if (dmg === null) return null;

    if (usingAction) {
      resources.action = false;
      resources.attacksRemaining = self.extraAttacks;
    } else if (usingExtra) {
      resources.extraAttackActions -= 1; // one attack only, no Extra Attack chain
      const source = self.buffSourceFor('haste');
      if (source) {
        this.log.push({
          kind: 'buffBoost',
          source,
          buff: 'haste',
          beneficiary: self.id,
          amount: 1,
        });
      }
    } else {
      resources.attacksRemaining -= 1;
    }
    return dmg;
  }

  /**
   * Roll the attacker's buff bonus to an attack roll (Bless's +1d4), logging the
   * assist against the buff's caster. `tag` keeps the stream distinct per attack.
   */
  private rollBuffAttackBonus(self: Combatant, tag: string): number {
    let bonus = 0;
    for (const b of self.buffAttackBonuses()) {
      const rolled = rollDiceTerm(this.rng.stream(`${self.id}:buff-atk:${b.id}:${tag}`), b.dice);
      bonus += rolled;
      this.log.push({
        kind: 'buffBoost',
        source: b.source,
        buff: b.id,
        beneficiary: self.id,
        amount: rolled,
      });
    }
    return bonus;
  }

  /** Roll the defender's buff bonus to a saving throw (Bless's +1d4). */
  private rollBuffSaveBonus(self: Combatant, tag: string): number {
    let bonus = 0;
    for (const b of self.buffSaveBonuses()) {
      bonus += rollDiceTerm(this.rng.stream(`${self.id}:buff-save:${b.id}:${tag}`), b.dice);
    }
    return bonus;
  }

  /**
   * Paladin Aura of Protection: a saving creature within 10 ft of a conscious
   * allied paladin that has the aura adds that paladin's Charisma modifier to the
   * save. Auras do not stack, so the best nearby aura applies.
   */
  private auraSaveBonus(target: Combatant): number {
    return auraSaveBonus(this.combatants, target, this.grid.cellFt);
  }

  /**
   * Resolve one weapon attack: range/reach check, condition-derived advantage,
   * the roll, auto-crit vs. inert targets, damage (dice doubled on a crit),
   * mitigation and application. Returns damage dealt, or null if out of range.
   * `source` only affects whether the event is logged by the caller.
   */
  private resolveWeaponAttack(
    self: Combatant,
    target: Combatant,
    profile: AttackProfile,
    source: 'action' | 'opportunity',
  ): number | null {
    const dist = distanceFt(self.position, target.position, this.grid.cellFt);
    let rangePenalty: Advantage = 'normal';
    if (profile.kind === 'melee') {
      if (dist > (profile.reachFt ?? 5) || dist === 0) return null;
    } else {
      const normal = profile.rangeFt ?? 0;
      const long = profile.rangeLongFt ?? normal;
      if (dist > long) return null;
      if (dist > normal) rangePenalty = 'disadvantage';
    }

    const within5 = dist <= 5;
    const condAdv = attackAdvantage(self, target, within5);

    // Feature-driven modifiers: the attacker's own features (Reckless Attack),
    // the target's features that expose it (Reckless grants attackers advantage),
    // and any flat to-hit bonus.
    let featAdv = false;
    let featDis = false;
    let toHitBonus = 0;
    for (const f of self.features) {
      const mods = f.outgoingAttack?.(self, target, profile);
      if (mods?.advantage) featAdv = true;
      if (mods?.disadvantage) featDis = true;
      if (mods?.toHit) toHitBonus += mods.toHit;
    }
    for (const f of target.features) {
      if (f.grantsAttackersAdvantage?.(target)) featAdv = true;
    }
    const featureAdv = combineAdvantage(
      featAdv ? 'advantage' : 'normal',
      featDis ? 'disadvantage' : 'normal',
    );
    const adv = combineAdvantage(combineAdvantage(condAdv, rangePenalty), featureAdv);

    const buffToHit = this.rollBuffAttackBonus(self, `${profile.name}:${target.id}`);
    const stream = this.rng.stream(`${self.id}:${profile.name}:${target.id}`);
    const result = resolveAttack(stream, {
      attackBonus: profile.attackBonus + toHitBonus + buffToHit,
      targetAc: target.effectiveAc(),
      advantage: adv,
      critRange: profile.critRange,
    });

    if (!result.hit) {
      if (source === 'action') {
        this.log.push({
          kind: 'attack',
          attacker: self.id,
          target: target.id,
          weapon: profile.name,
          d20: result.d20,
          hit: false,
          crit: false,
          damage: 0,
        });
      }
      return 0;
    }

    const crit = result.crit || isAutoCritTarget(target, within5);
    const dmgStream = this.rng.stream(`${self.id}:${profile.name}:${target.id}:dmg`);

    // Primary damage, then each extra rider, each mitigated by its own type. A
    // crit doubles the dice of every component but never the flat bonuses.
    const components = [...(profile.extraDamage ?? [])];
    // Feature damage riders (Rage bonus, Sneak Attack dice) on a hit.
    const onHitCtx = {
      self,
      target,
      weapon: profile,
      crit,
      rollAdvantage: adv,
      allyAdjacentToTarget: this.hasAllyAdjacentTo(self, target),
    };
    for (const f of self.features) {
      for (const extra of f.onHit?.(onHitCtx) ?? []) components.push(extra);
    }

    let raw = rollDiceTerm(dmgStream, profile.damage);
    if (crit) raw += rollDiceTerm(dmgStream, { ...profile.damage, bonus: 0 });
    let dealt = applyResponse(raw, target.damageResponseFor(profile.damageType));
    for (const extra of components) {
      let r = rollDiceTerm(dmgStream, extra.damage);
      if (crit) r += rollDiceTerm(dmgStream, { ...extra.damage, bonus: 0 });
      dealt += applyResponse(r, target.damageResponseFor(extra.type));
    }

    const before = target.isConscious;
    const outcome = target.takeDamage(dealt, { critical: crit });

    if (source === 'action') {
      this.log.push({
        kind: 'attack',
        attacker: self.id,
        target: target.id,
        weapon: profile.name,
        d20: result.d20,
        hit: true,
        crit,
        damage: dealt,
      });
    }
    if (before && outcome.dropped) {
      this.log.push({ kind: 'down', id: target.id });
      this.fireOnKill(self, target);
    }
    if (outcome.died) this.log.push({ kind: 'death', id: target.id });
    this.checkConcentration(target, dealt);

    // Save-or-condition riders on a hit (Monk Stunning Strike): each feature that
    // triggers makes the target save; on a failure the condition is applied and
    // attributed to the attacker (feeding the control metric via controlDenied).
    if (target.isConscious) {
      for (const f of self.features) {
        const effect = f.onHitEffect?.({
          self,
          target,
          weapon: profile,
          crit,
          rollAdvantage: adv,
          allyAdjacentToTarget: this.hasAllyAdjacentTo(self, target),
        });
        if (!effect) continue;
        const save = resolveSave(this.rng.stream(`${self.id}:${f.id}:${target.id}:save`), {
          saveBonus:
            target.saveBonus(effect.save) +
            this.rollBuffSaveBonus(target, `${f.id}`) +
            this.auraSaveBonus(target),
          dc: effect.dc,
        });
        if (!save.success) {
          target.applyTimedCondition({
            condition: effect.condition,
            source: self.id,
            rounds: effect.rounds,
          });
        }
      }
    }
    return dealt;
  }
}

/**
 * Paladin Aura of Protection: the bonus a saving creature gets from nearby allied
 * paladins' auras — the best (non-stacking) Charisma modifier among conscious
 * aura-bearing allies within 10 ft of `target`. Pure, so it is unit-testable.
 */
export function auraSaveBonus(
  combatants: readonly Combatant[],
  target: Combatant,
  cellFt: number,
): number {
  let best = 0;
  for (const p of combatants) {
    if (p.side !== target.side || !p.isConscious) continue;
    if (!p.features.some((f) => f.id === 'aura-of-protection')) continue;
    if (distanceFt(p.position, target.position, cellFt) > 10) continue;
    best = Math.max(best, p.abilityMod('cha'));
  }
  return best;
}

/** A combatant's strongest attack by average damage (for legendary actions), or null. */
function bestAttack(c: Combatant): AttackProfile | null {
  const attacks = c.activeAttacks();
  if (attacks.length === 0) return null;
  return attacks.reduce((best, w) => (meanDice(w.damage) > meanDice(best.damage) ? w : best));
}

/** Combine two advantage sources under the no-stacking rule. */
function combineAdvantage(a: Advantage, b: Advantage): Advantage {
  const adv = a === 'advantage' || b === 'advantage';
  const dis = a === 'disadvantage' || b === 'disadvantage';
  if (adv === dis) return 'normal';
  return adv ? 'advantage' : 'disadvantage';
}

/**
 * A grid path from `a` to `b` as a sequence of cells (inclusive of both),
 * stepping one cell at a time toward the destination (diagonals allowed). Length
 * equals the Chebyshev distance plus one.
 */
export function linePath(a: Cell, b: Cell): Cell[] {
  const path: Cell[] = [a];
  let { x, y } = a;
  const steps = stepDistance(a, b);
  for (let i = 0; i < steps; i++) {
    x += Math.sign(b.x - x);
    y += Math.sign(b.y - y);
    path.push({ x, y });
  }
  return path;
}
