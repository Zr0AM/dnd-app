// The shared tactical AI: one decision-maker every build under test uses, so
// comparisons are fair (plan decision 8 — a bad per-build AI would make a good
// build look bad). It is a utility-based action chooser: score candidate targets,
// pick the best, move into range with the build's best weapon, and attack with
// every attack the turn allows.
//
// Behaviour is tuned by a small weight vector so roles can bias target selection
// and positioning later; the defaults are a sensible generalist. This is the v1
// AI for martial builds; casters and support actions extend it in later phases.

import { meanDice } from '../dice/dice';
import { distanceFt, stepDistance, type Cell } from '../grid/grid';
import type { AttackProfile } from '../combat/attack';
import type { Combatant } from '../combat/actor';
import type { TurnApi, TurnPolicy } from '../combat/encounter';
import { raysAt, type Spell } from '../combat/spell';

// Rough constants the AI uses to estimate action value without a target's exact AC.
const ASSUMED_HIT = 0.6;
const ASSUMED_SAVE_FAIL = 0.5;
/** Expected-damage penalty per slot level, so cantrips/weapons win when close. */
const SLOT_PENALTY = 1.5;
/** Rounds a control effect is assumed to keep a target locked, for valuation. */
const ROUNDS_DENIED = 2;

/** Tunable weights for the tactical AI (defaults = generalist). */
export interface TacticsWeights {
  /** Preference for already-wounded targets (focus fire). */
  readonly woundedPreference: number;
  /** Preference for removing high-damage threats. */
  readonly threatPreference: number;
  /** Penalty per 5 ft of distance to a target (prefer closer, less movement). */
  readonly distancePenalty: number;
  /** Bonus when this turn's expected damage can drop the target (secure the kill). */
  readonly finishBonus: number;
  /** Nominal hit chance used to estimate this turn's damage. */
  readonly assumedHitChance: number;
}

export const DEFAULT_WEIGHTS: TacticsWeights = {
  woundedPreference: 2,
  threatPreference: 1,
  distancePenalty: 0.1,
  finishBonus: 5,
  assumedHitChance: 0.6,
};

/** Average damage of one hit with a weapon, counting its extra-damage riders. */
export function weaponAverageDamage(weapon: AttackProfile): number {
  let avg = meanDice(weapon.damage);
  for (const e of weapon.extraDamage ?? []) avg += meanDice(e.damage);
  return avg;
}

/** The build's best weapon by average damage (its primary). */
export function primaryWeapon(c: Combatant): AttackProfile | null {
  if (c.attacks.length === 0) return null;
  return c.attacks.reduce((best, w) =>
    weaponAverageDamage(w) > weaponAverageDamage(best) ? w : best,
  );
}

/** A crude estimate of a creature's damage output per turn, to gauge threat. */
export function threatOf(c: Combatant): number {
  const w = primaryWeapon(c);
  if (!w) return 0;
  return weaponAverageDamage(w) * (1 + c.extraAttacks);
}

/** The attacker's expected damage this turn with its primary weapon. */
function expectedTurnDamage(self: Combatant, weights: TacticsWeights): number {
  const w = primaryWeapon(self);
  if (!w) return 0;
  return weaponAverageDamage(w) * (1 + self.extraAttacks) * weights.assumedHitChance;
}

/** Score a target for selection; higher is more attractive. */
export function scoreTarget(self: Combatant, target: Combatant, weights: TacticsWeights): number {
  const hpFrac = target.hp / target.maxHp;
  let score = weights.woundedPreference * (1 - hpFrac);
  score += weights.threatPreference * normalizeThreat(threatOf(target));
  score -= weights.distancePenalty * (distanceFt(self.position, target.position) / 5);
  if (expectedTurnDamage(self, weights) >= target.hp) score += weights.finishBonus;
  return score;
}

/** Map a raw threat number into roughly [0, 3] so it is comparable to the other terms. */
function normalizeThreat(threat: number): number {
  return Math.min(3, threat / 10);
}

/** Move `steps` cells from `from` toward `target` along the grid line. */
function stepTowardBy(from: Cell, target: Cell, steps: number): Cell {
  let { x, y } = from;
  for (let i = 0; i < steps; i++) {
    x += Math.sign(target.x - x);
    y += Math.sign(target.y - y);
  }
  return { x, y };
}

/** The reach/range of a weapon in feet for positioning. */
function weaponRangeFt(weapon: AttackProfile): number {
  if (weapon.kind === 'melee') return weapon.reachFt ?? 5;
  return weapon.rangeFt ?? 5;
}

/** A spell the AI has chosen to cast, with the slot and estimated value. */
interface SpellChoice {
  readonly spell: Spell;
  readonly slotLevel: number;
  readonly ev: number;
  readonly rangeFt: number;
  readonly target: Combatant;
}

/**
 * Expected useful damage of casting `spell` at `slotLevel`, capped at each
 * target's remaining HP so overkill does not make a big nuke look good against a
 * weak single target (which keeps the AI from wasting slots).
 */
function spellExpectedDamage(
  self: Combatant,
  spell: Spell,
  slotLevel: number,
  target: Combatant,
  enemies: readonly Combatant[],
): number {
  const kind = spell.kind;
  if (kind.type === 'attack-damage') {
    const rays = kind.beams
      ? kind.beams(self.level)
      : raysAt(kind, slotLevel, Math.max(1, spell.level));
    const bonus = kind.addSpellMod && self.spellAbility ? self.abilityMod(self.spellAbility) : 0;
    const dmg = rays * (meanDice(kind.damage(slotLevel, self.level)) + bonus) * ASSUMED_HIT;
    return Math.min(dmg, target.hp);
  }
  if (kind.type === 'control') {
    // Value control as damage prevented: a locked enemy denies ~its own output
    // for the rounds it stays locked, weighted by the chance it fails the save.
    const perTarget = (t: Combatant) => threatOf(t) * ROUNDS_DENIED * ASSUMED_SAVE_FAIL;
    if (kind.aoeRadiusFt == null) return perTarget(target);
    const radius = kind.aoeRadiusFt;
    const caught = enemies.filter((e) => distanceFt(target.position, e.position) <= radius);
    return (caught.length ? caught : [target]).reduce((s, e) => s + perTarget(e), 0);
  }
  if (kind.type !== 'save-damage') return 0; // heal and other non-damage kinds
  // save-damage: expected damage per target after the save, capped per target's HP.
  const perTarget =
    meanDice(kind.damage(slotLevel, self.level)) *
    (ASSUMED_SAVE_FAIL + (1 - ASSUMED_SAVE_FAIL) * (kind.onSuccess === 'half' ? 0.5 : 0));
  if (kind.aoeRadiusFt == null) return Math.min(perTarget, target.hp);
  const radius = kind.aoeRadiusFt;
  const origin = kind.selfOrigin ? self.position : target.position;
  const caught = enemies.filter((e) => distanceFt(origin, e.position) <= radius);
  return (caught.length ? caught : [target]).reduce((sum, e) => sum + Math.min(perTarget, e.hp), 0);
}

/**
 * The best offensive spell to cast, or null. Damage spells are valued against
 * `damageTarget` (the wounded/best kill target); control spells against
 * `controlTarget` (the most dangerous enemy, which is who you want to lock down).
 */
function bestSpell(
  self: Combatant,
  damageTarget: Combatant,
  controlTarget: Combatant,
  enemies: readonly Combatant[],
): SpellChoice | null {
  let best: SpellChoice | null = null;
  const consider = (spell: Spell, slotLevel: number) => {
    const target = spell.kind.type === 'control' ? controlTarget : damageTarget;
    const ev =
      spellExpectedDamage(self, spell, slotLevel, target, enemies) - slotLevel * SLOT_PENALTY;
    if (!best || ev > best.ev) best = { spell, slotLevel, ev, rangeFt: spell.rangeFt, target };
  };
  for (const cantrip of self.cantrips) consider(cantrip, 0);
  for (const spell of self.spells) {
    // Healing and buffs are handled by their own steps (tryHeal / tryBuff).
    if (spell.kind.type === 'heal' || spell.kind.type === 'buff') continue;
    const slot = self.availableSlotLevels().find((l) => l >= spell.level);
    if (slot !== undefined) consider(spell, slot);
  }
  return best;
}

/** Move toward `target` until within `rangeFt`, as far as this turn allows. */
function approach(api: TurnApi, target: Combatant, rangeFt: number): void {
  const distCells = stepDistance(api.self.position, target.position);
  const rangeCells = Math.max(1, Math.floor(rangeFt / 5));
  const needed = Math.max(0, distCells - rangeCells);
  if (needed <= 0) return;
  const canMove = Math.floor(api.resources.movementFt / 5);
  const steps = Math.min(needed, canMove);
  if (steps > 0) api.moveTo(stepTowardBy(api.self.position, target.position, steps));
}

/** An ally worth healing this turn: a downed ally first, else a badly wounded one. */
function pickHealTarget(api: TurnApi): Combatant | null {
  const allies = api.allAllies();
  const downed = allies.filter((a) => a.isDying);
  if (downed.length > 0) return downed[0];
  const hurt = allies
    .filter((a) => a.isConscious && a.hp / a.maxHp < 0.4)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  return hurt[0] ?? null;
}

/**
 * If the caster has a heal spell and an ally needs it, heal them. Prefers a
 * bonus-action heal (Healing Word) for a downed ally so the caster can still act;
 * returns true if the whole turn's action was spent healing.
 */
function tryHeal(api: TurnApi): boolean {
  const healSpells = api.self.spells.filter((s) => s.kind.type === 'heal');
  if (healSpells.length === 0) return false;
  const target = pickHealTarget(api);
  if (!target) return false;

  const slot = api.self.availableSlotLevels().find((l) => l >= 1);
  if (slot === undefined) return false;

  // Prefer a bonus-action heal to revive while keeping the action for offense.
  const bonusHeal = healSpells.find((s) => s.action === 'bonus');
  const actionHeal = healSpells.find((s) => s.action === 'action');
  if (target.isDying && bonusHeal && api.resources.bonus) {
    api.castSpell(bonusHeal, target, slot);
    return false; // action still free
  }
  const spell = actionHeal ?? bonusHeal!;
  api.castSpell(spell, target, slot);
  return spell.action === 'action';
}

/**
 * Estimated value of casting `spell` (a buff) now, with the allies it would cover.
 * Allies are ranked by threat and capped at the spell's target count; the per-ally
 * benefit credits an extra attack (Haste), a to-hit rider (Bless, ~+12% hit) and a
 * small survivability bump for +AC. Used only to choose among buffs and vs. attacking.
 */
function buffValue(
  spell: Spell,
  alliesInRange: readonly Combatant[],
): { value: number; targets: Combatant[] } {
  const kind = spell.kind;
  if (kind.type !== 'buff') return { value: 0, targets: [] };
  const ranked = [...alliesInRange]
    .sort((a, b) => threatOf(b) - threatOf(a))
    .slice(0, kind.maxTargets);
  let value = 0;
  for (const a of ranked) {
    if (kind.extraAttackAction) value += 0.5 * threatOf(a); // roughly one extra attack
    if (kind.attackBonusDice) value += 0.12 * threatOf(a); // +~2.5 to hit ≈ +12% of output
    if (kind.acBonus) value += 0.5 * kind.acBonus;
  }
  return { value, targets: ranked };
}

/**
 * If the caster has a buff spell, isn't already concentrating, and has allies worth
 * buffing in range, cast the most valuable buff. Buffs are concentration, so this
 * fires once and then the buffer acts normally while the effect holds. Returns true
 * if the turn's action was spent casting.
 */
function tryBuff(api: TurnApi): boolean {
  const self = api.self;
  if (self.concentratingOn !== null || !api.resources.action) return false;
  const buffSpells = self.spells.filter((s) => s.kind.type === 'buff');
  if (buffSpells.length === 0) return false;

  // Allies that actually attack are worth buffing.
  const combatants = api.allies().filter((a) => threatOf(a) > 0);
  if (combatants.length === 0) return false;

  // Rank affordable buffs by value against the allies currently in range, else by
  // value against the strongest ally we could approach.
  const affordable = buffSpells.filter(
    (s) => self.availableSlotLevels().find((l) => l >= s.level) !== undefined,
  );
  if (affordable.length === 0) return false;

  const inRangeOf = (s: Spell) =>
    combatants.filter((a) => distanceFt(self.position, a.position) <= s.rangeFt);

  let chosenSpell: Spell | null = null;
  let chosenTarget: Combatant | null = null;
  let bestValue = 0;
  for (const s of affordable) {
    const near = inRangeOf(s);
    const { value, targets } = buffValue(s, near);
    if (targets.length > 0 && value > bestValue) {
      bestValue = value;
      chosenSpell = s;
      chosenTarget = targets[0];
    }
  }

  // Nobody in range: approach the strongest ally for the best affordable buff, then retry.
  if (!chosenSpell) {
    const strongest = [...combatants].sort((a, b) => threatOf(b) - threatOf(a))[0];
    const spell = affordable.reduce((a, b) => (b.level > a.level ? b : a));
    approach(api, strongest, spell.rangeFt);
    const near = inRangeOf(spell);
    const { targets } = buffValue(spell, near);
    if (targets.length === 0) return false;
    chosenSpell = spell;
    chosenTarget = targets[0];
  }

  const slot = self.availableSlotLevels().find((l) => l >= chosenSpell!.level)!;
  const r = api.castSpell(chosenSpell!, chosenTarget!, slot);
  return r !== null && chosenSpell!.action === 'action';
}

/** Sorcery Points a Quickened Spell costs (mirrors the engine's QUICKEN_COST). */
const QUICKEN_COST = 2;

/**
 * Metamagic (Sorcerer): after the main action, spend Sorcery Points to cast a
 * damage cantrip as a Bonus Action — a second spell in the turn. Fires when the
 * caster has a 'sorcery' pool, a free bonus action, a damage cantrip, and an enemy
 * in range of it. Returns true if a quickened cantrip was cast.
 */
function tryQuickenedCantrip(api: TurnApi, damageTarget: Combatant): boolean {
  const self = api.self;
  if (!api.resources.bonus || self.resourceCount('sorcery') < QUICKEN_COST) return false;
  const cantrip = self.cantrips.find(
    (c) => c.kind.type === 'attack-damage' || c.kind.type === 'save-damage',
  );
  if (!cantrip) return false;
  if (distanceFt(self.position, damageTarget.position) > cantrip.rangeFt) return false;
  return api.castSpell(cantrip, damageTarget, 0, true) !== null;
}

/** Build the shared tactical policy with the given weights. */
export function makeTacticalPolicy(weights: TacticsWeights = DEFAULT_WEIGHTS): TurnPolicy {
  return (api: TurnApi) => {
    // Healing takes priority when an ally is down or badly hurt.
    if (tryHeal(api)) return;
    // Then establish a buff (Bless/Haste) if we have one and aren't concentrating.
    if (tryBuff(api)) return;

    const enemies = api.enemies();
    if (enemies.length === 0) return;

    // The damage target (best to kill) and the control target (most dangerous).
    const damageTarget = enemies.reduce((best, e) =>
      scoreTarget(api.self, e, weights) > scoreTarget(api.self, best, weights) ? e : best,
    );
    const controlTarget = enemies.reduce((best, e) => (threatOf(e) > threatOf(best) ? e : best));

    const weapon = primaryWeapon(api.self);
    const weaponEv = weapon
      ? weaponAverageDamage(weapon) * (1 + api.self.extraAttacks) * weights.assumedHitChance
      : -1;
    const spell = bestSpell(api.self, damageTarget, controlTarget, enemies);

    // Cast if a spell beats the weapon; otherwise make weapon attacks.
    if (spell && spell.ev > weaponEv) {
      approach(api, spell.target, spell.rangeFt);
      if (distanceFt(api.self.position, spell.target.position) <= spell.rangeFt) {
        api.castSpell(spell.spell, spell.target, spell.slotLevel);
      }
    } else if (weapon) {
      const rangeFt = weaponRangeFt(weapon);
      approach(api, damageTarget, rangeFt);
      if (distanceFt(api.self.position, damageTarget.position) <= rangeFt) {
        // Drain the Attack action, its Extra Attacks, then any buff-granted extra
        // attack action (Haste), so a hasted striker actually uses the extra swing.
        let dmg = api.attack(damageTarget, weapon);
        while (
          dmg !== null &&
          damageTarget.isConscious &&
          (api.resources.attacksRemaining > 0 || api.resources.extraAttackActions > 0)
        ) {
          dmg = api.attack(damageTarget, weapon);
        }
      }
    }

    // Sorcerer Metamagic: a quickened cantrip as a bonus action, after the action.
    tryQuickenedCantrip(api, damageTarget);
  };
}

/** The default shared policy. */
export const tacticalPolicy: TurnPolicy = makeTacticalPolicy();
