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

/** Build the shared tactical policy with the given weights. */
export function makeTacticalPolicy(weights: TacticsWeights = DEFAULT_WEIGHTS): TurnPolicy {
  return (api: TurnApi) => {
    const weapon = primaryWeapon(api.self);
    if (!weapon) return;

    // Pick the best target.
    const enemies = api.enemies();
    if (enemies.length === 0) return;
    const target = enemies.reduce((best, e) =>
      scoreTarget(api.self, e, weights) > scoreTarget(api.self, best, weights) ? e : best,
    );

    // Move into range if needed (partial approach if we cannot reach this turn).
    const rangeFt = weaponRangeFt(weapon);
    const distCells = stepDistance(api.self.position, target.position);
    const rangeCells = Math.max(1, Math.floor(rangeFt / 5));
    const needed = Math.max(0, distCells - rangeCells);
    if (needed > 0) {
      const canMove = Math.floor(api.resources.movementFt / 5);
      const steps = Math.min(needed, canMove);
      if (steps > 0) api.moveTo(stepTowardBy(api.self.position, target.position, steps));
    }

    // Attack with every attack the turn allows, while the target lives.
    if (distanceFt(api.self.position, target.position) <= rangeFt) {
      let dmg = api.attack(target, weapon);
      while (dmg !== null && target.isConscious && api.resources.attacksRemaining > 0) {
        dmg = api.attack(target, weapon);
      }
    }
  };
}

/** The default shared policy. */
export const tacticalPolicy: TurnPolicy = makeTacticalPolicy();
