// Dice rolling on top of the labeled RNG streams.
//
// Every roll is drawn from a named stream (e.g. "hero:fireball:damage"), so the
// common-random-numbers guarantee from rng.ts carries through: the same roll in
// the same scenario is identical across builds. Alongside the rollers, each
// routine has a closed-form expected value, which the metrics spec uses to check
// simulated means against hand-computed expectations.

import type { Rng } from '../rng/rng';

/** How a d20 roll is modified by (dis)advantage. */
export type Advantage = 'normal' | 'advantage' | 'disadvantage';

/** A dice term: `count`d`sides` plus a flat `bonus`. */
export interface Dice {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}

/** Build a Dice term, defaulting the flat bonus to 0. */
export function dice(count: number, sides: number, bonus = 0): Dice {
  return { count, sides, bonus };
}

/** Roll one die of `sides` faces: an integer in [1, sides]. */
export function rollDie(rng: Rng, sides: number): number {
  if (sides < 1 || !Number.isInteger(sides)) {
    throw new RangeError(`sides must be a positive integer, got ${sides}`);
  }
  return 1 + Math.floor(rng() * sides);
}

/** Roll `count`d`sides` and sum them (no bonus). */
export function rollDice(rng: Rng, count: number, sides: number): number {
  if (count < 0 || !Number.isInteger(count)) {
    throw new RangeError(`count must be a non-negative integer, got ${count}`);
  }
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(rng, sides);
  return total;
}

/** Roll a Dice term (count d sides + bonus). */
export function roll(rng: Rng, d: Dice): number {
  return rollDice(rng, d.count, d.sides) + d.bonus;
}

/** Expected value of a single die of `sides` faces: (sides + 1) / 2. */
export function meanDie(sides: number): number {
  return (sides + 1) / 2;
}

/** Expected value of a Dice term. */
export function meanDice(d: Dice): number {
  return d.count * meanDie(d.sides) + d.bonus;
}

/**
 * Roll a d20 under (dis)advantage. Advantage keeps the higher of two rolls,
 * disadvantage the lower; normal rolls once. The raw d20 face is returned (crit
 * and modifier handling belong to the attack resolver, not here).
 */
export function rollD20(rng: Rng, adv: Advantage = 'normal'): number {
  const a = rollDie(rng, 20);
  if (adv === 'normal') return a;
  const b = rollDie(rng, 20);
  return adv === 'advantage' ? Math.max(a, b) : Math.min(a, b);
}

/** Expected value of a d20 face under (dis)advantage. */
export function meanD20(adv: Advantage = 'normal'): number {
  // E[max] = sum_{k=1..20} k*(2k-1)/400 = 13.825; E[min] = 7.175 by symmetry.
  switch (adv) {
    case 'advantage':
      return 13.825;
    case 'disadvantage':
      return 7.175;
    default:
      return 10.5;
  }
}

/**
 * Probability that a d20 roll meets or beats `target` (the number needed on the
 * die face), under (dis)advantage, clamped to [0, 1]. A natural 1 always misses
 * and a natural 20 always hits for attacks, but this is the raw face probability;
 * the attack resolver layers the nat-1/nat-20 rules on top.
 */
export function chanceToHit(target: number, adv: Advantage = 'normal'): number {
  // p = P(single d20 >= target) for face values 1..20.
  const need = Math.min(21, Math.max(1, target));
  const p = (21 - need) / 20;
  switch (adv) {
    case 'advantage':
      return 1 - (1 - p) ** 2;
    case 'disadvantage':
      return p ** 2;
    default:
      return p;
  }
}
