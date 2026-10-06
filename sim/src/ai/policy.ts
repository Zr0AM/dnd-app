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
    const rays = raysAt(kind, slotLevel, Math.max(1, spell.level));
    const dmg = rays * meanDice(kind.damage(slotLevel, self.level)) * ASSUMED_HIT;
    return Math.min(dmg, target.hp);
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

/** The best spell to cast this turn, or null if the caster has none worth casting. */
function bestSpell(
  self: Combatant,
  target: Combatant,
  enemies: readonly Combatant[],
): SpellChoice | null {
  let best: SpellChoice | null = null;
  const consider = (spell: Spell, slotLevel: number) => {
    const ev =
      spellExpectedDamage(self, spell, slotLevel, target, enemies) - slotLevel * SLOT_PENALTY;
    if (!best || ev > best.ev) best = { spell, slotLevel, ev, rangeFt: spell.rangeFt };
  };
  for (const cantrip of self.cantrips) consider(cantrip, 0);
  for (const spell of self.spells) {
    if (spell.kind.type === 'heal') continue; // healing is handled separately
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

/** Build the shared tactical policy with the given weights. */
export function makeTacticalPolicy(weights: TacticsWeights = DEFAULT_WEIGHTS): TurnPolicy {
  return (api: TurnApi) => {
    // Healing takes priority when an ally is down or badly hurt.
    if (tryHeal(api)) return;

    const enemies = api.enemies();
    if (enemies.length === 0) return;

    // Pick the best target.
    const target = enemies.reduce((best, e) =>
      scoreTarget(api.self, e, weights) > scoreTarget(api.self, best, weights) ? e : best,
    );

    const weapon = primaryWeapon(api.self);
    const weaponEv = weapon
      ? weaponAverageDamage(weapon) * (1 + api.self.extraAttacks) * weights.assumedHitChance
      : -1;
    const spell = bestSpell(api.self, target, enemies);

    // Cast if a spell beats the weapon; otherwise make weapon attacks.
    if (spell && spell.ev > weaponEv) {
      approach(api, target, spell.rangeFt);
      if (distanceFt(api.self.position, target.position) <= spell.rangeFt) {
        api.castSpell(spell.spell, target, spell.slotLevel);
      }
    } else if (weapon) {
      const rangeFt = weaponRangeFt(weapon);
      approach(api, target, rangeFt);
      if (distanceFt(api.self.position, target.position) <= rangeFt) {
        let dmg = api.attack(target, weapon);
        while (dmg !== null && target.isConscious && api.resources.attacksRemaining > 0) {
          dmg = api.attack(target, weapon);
        }
      }
    }
  };
}

/** The default shared policy. */
export const tacticalPolicy: TurnPolicy = makeTacticalPolicy();
