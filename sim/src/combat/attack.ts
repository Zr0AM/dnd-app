// Attack-roll and saving-throw resolution (SRD "Attack Rolls", "Saving Throws").
//
// Attack rolls: a natural 20 always hits and is a Critical Hit; a natural 1 always
// misses. Otherwise the attack hits if d20 + bonus >= target AC. The crit range
// can be widened (Champion's Improved/Superior Critical: 19-20, then 18-20); any
// die face in the crit range is a hit and a crit.
//
// Saving throws: d20 + bonus >= DC. The SRD gives saves no natural-20/1 auto
// success or failure (unlike attacks and death saves), so none is applied here.

import { rollD20, chanceToHit, type Advantage, type Dice } from '../dice/dice';
import type { Rng } from '../rng/rng';
import type { DamageType } from '../core/types';

/** A weapon or natural attack a creature can make. */
export interface AttackProfile {
  readonly name: string;
  readonly kind: 'melee' | 'ranged';
  /** Reach in feet for a melee attack (default 5). */
  readonly reachFt?: number;
  /** Normal range in feet for a ranged attack. */
  readonly rangeFt?: number;
  /** Long range in feet (attacks beyond `rangeFt` up to this have disadvantage). */
  readonly rangeLongFt?: number;
  readonly attackBonus: number;
  readonly damage: Dice;
  readonly damageType: DamageType;
  /** Lowest die face that crits (default 20). */
  readonly critRange?: number;
}

export interface AttackParams {
  readonly attackBonus: number;
  readonly targetAc: number;
  readonly advantage?: Advantage;
  /** Lowest die face that is a Critical Hit (20 normally, 19 or 18 for Champion). */
  readonly critRange?: number;
}

export interface AttackResult {
  readonly d20: number;
  readonly total: number;
  readonly hit: boolean;
  readonly crit: boolean;
}

export function resolveAttack(rng: Rng, params: AttackParams): AttackResult {
  const adv = params.advantage ?? 'normal';
  const critRange = params.critRange ?? 20;
  const d20 = rollD20(rng, adv);
  const total = d20 + params.attackBonus;

  if (d20 === 1) return { d20, total, hit: false, crit: false };
  if (d20 >= critRange) return { d20, total, hit: true, crit: true };
  return { d20, total, hit: total >= params.targetAc, crit: false };
}

/**
 * Probability an attack hits (any hit, crit included), for validating simulated
 * hit rates. Accounts for the natural-1 auto-miss and natural-20 auto-hit.
 */
export function chanceAttackHits(params: AttackParams): number {
  const adv = params.advantage ?? 'normal';
  // Face needed to hit by the numbers, clamped so a natural 1 can never hit and a
  // natural 20 always can.
  const needed = Math.min(20, Math.max(2, params.targetAc - params.attackBonus));
  return chanceToHit(needed, adv);
}

/**
 * Probability an attack is a Critical Hit, for validation. A crit needs a die
 * face in the crit range; under advantage/disadvantage the usual square formulas
 * apply to the face probability.
 */
export function chanceAttackCrits(params: AttackParams): number {
  const adv = params.advantage ?? 'normal';
  const critRange = params.critRange ?? 20;
  return chanceToHit(critRange, adv);
}

export interface SaveParams {
  readonly saveBonus: number;
  readonly dc: number;
  readonly advantage?: Advantage;
}

export interface SaveResult {
  readonly d20: number;
  readonly total: number;
  readonly success: boolean;
}

export function resolveSave(rng: Rng, params: SaveParams): SaveResult {
  const adv = params.advantage ?? 'normal';
  const d20 = rollD20(rng, adv);
  const total = d20 + params.saveBonus;
  return { d20, total, success: total >= params.dc };
}

/** Probability a saving throw succeeds, for validation. */
export function chanceSaveSucceeds(params: SaveParams): number {
  const adv = params.advantage ?? 'normal';
  const needed = Math.min(21, Math.max(1, params.dc - params.saveBonus));
  return chanceToHit(needed, adv);
}
