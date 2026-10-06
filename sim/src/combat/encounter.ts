// The initiative order and turn loop — the engine that drives a fight round by
// round (SRD "The Order of Combat"). It handles initiative, per-turn resources
// (action / bonus action / movement), movement with Opportunity Attacks, basic
// weapon attacks wired to condition-derived advantage, death saves at the start
// of a dying creature's turn, and detecting when one side has won.
//
// What to *do* on a turn is delegated to an injected policy, so the loop is
// testable without the full AI (which arrives in a later phase). The policy acts
// through a restricted TurnApi that enforces the action economy.

import { rollD20, roll as rollDiceTerm, type Advantage } from '../dice/dice';
import { Random } from '../rng/rng';
import { Grid, distanceFt, stepDistance, type Cell } from '../grid/grid';
import { mitigate } from './damage';
import { resolveAttack, type AttackProfile } from './attack';
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
  | { kind: 'down'; id: string }
  | { kind: 'death'; id: string }
  | { kind: 'deathSave'; id: string; d20: number; success: boolean }
  | { kind: 'end'; round: number; winner: Side | null };

/** Per-turn resource budget. */
export interface TurnResources {
  action: boolean;
  bonus: boolean;
  movementFt: number;
}

/** The restricted interface a policy uses to act on its turn. */
export interface TurnApi {
  readonly self: Combatant;
  readonly resources: TurnResources;
  enemies(): Combatant[];
  allies(): Combatant[];
  /** Straight-line move to `dest`, spending movement and provoking OAs. Returns success. */
  moveTo(dest: Cell): boolean;
  /** Make a weapon attack with an action. Returns the damage dealt, or null if illegal. */
  attack(target: Combatant, profile: AttackProfile): number | null;
}

/** A policy decides what one creature does on its turn by calling the TurnApi. */
export type TurnPolicy = (api: TurnApi) => void;

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

      // Start of turn: a dying creature rolls a death save and does nothing else.
      if (c.isDying) {
        if (!c.stable) {
          const out = c.rollDeathSave(this.rng.stream(`death:${c.id}`));
          this.log.push({ kind: 'deathSave', id: c.id, d20: out.d20, success: out.success });
          if (out.died) this.log.push({ kind: 'death', id: c.id });
        }
        continue;
      }

      if (!canAct(c)) continue;

      this.log.push({ kind: 'turn', id: c.id, round: this.round });
      const resources: TurnResources = {
        action: true,
        bonus: true,
        movementFt: effectiveSpeedFt(c),
      };
      this.policyFor(c)(this.makeApi(c, resources));
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
      moveTo: (dest) => this.moveTo(self, dest, resources),
      attack: (target, profile) => this.attack(self, target, profile, resources),
    };
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
    if (!resources.action) return null;
    if (!target.isConscious) return null;
    const dmg = this.resolveWeaponAttack(self, target, profile, 'action');
    if (dmg === null) return null;
    resources.action = false;
    return dmg;
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
    const adv = combineAdvantage(condAdv, rangePenalty);

    const stream = this.rng.stream(`${self.id}:${profile.name}:${target.id}`);
    const result = resolveAttack(stream, {
      attackBonus: profile.attackBonus,
      targetAc: target.ac,
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
    let raw = rollDiceTerm(dmgStream, profile.damage);
    if (crit) raw += rollDiceTerm(dmgStream, { ...profile.damage, bonus: 0 }); // double the dice, not the bonus
    const dealt = mitigate(raw, profile.damageType, target.damageResponses);
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
    if (before && outcome.dropped) this.log.push({ kind: 'down', id: target.id });
    if (outcome.died) this.log.push({ kind: 'death', id: target.id });
    return dealt;
  }
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
