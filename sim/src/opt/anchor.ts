// Reference-anchor normalization (metrics spec, section 5): scale a build's
// objectives against a frozen benchmark build's performance in the same
// scenarios, so 1.0 means "as good as the benchmark" and > 1 beats it. This is
// the ratio-to-frozen-anchor the metrics spec prefers over population min-max,
// because the anchor does not move as the GA evolves.
//
// The full spec anchors against the reference *party* fillers with the hero in a
// role slot; that needs a party (and caster fillers), which arrive with Phase 4.
// Until then the anchor is a single frozen benchmark martial — the same math,
// minus the party context.

import type { Random } from '../rng/rng';
import { evaluate, objectivesOf, OBJECTIVE_NAMES, type EvalOptions } from './evaluate';
import type { MartialCatalog } from './catalog';
import type { MartialGenome } from './genome';

/**
 * Per-objective floors (the value a build contributing nothing scores), used in
 * the normalization (value - floor) / (anchor - floor). Efficiency is negative
 * rounds, so its floor is the negated round cap: a build that always times out
 * scores 0 on efficiency.
 */
export const OBJECTIVE_FLOORS: Readonly<Record<(typeof OBJECTIVE_NAMES)[number], number>> = {
  reliability: 0,
  offense: 0,
  survival: 0,
  efficiency: -50,
  control: 0,
  support: 0,
};

/** The frozen benchmark: a sword-and-board Champion fighter (a modest baseline). */
export const BENCHMARK_GENOME: MartialGenome = {
  classSlug: 'fighter',
  abilityAssignment: [0, 3, 1, 4, 5, 2], // Str 15, Con 13
  weaponName: 'Longsword',
  armorName: 'Chain Mail',
  shield: true,
  twoHanded: false,
  fightingStyle: 'defense',
};

/** The benchmark's objective vector across the scenario library. */
export function computeAnchor(
  catalog: MartialCatalog,
  _random?: Random,
  opts?: EvalOptions,
): number[] {
  return objectivesOf(evaluate(BENCHMARK_GENOME, catalog, opts));
}

/**
 * Normalize an objective vector against the anchor: 1.0 = as good as the
 * benchmark on that axis, > 1 better. When the anchor sits at the floor on an
 * axis (no signal to scale against), a build at or above it scores 1, else 0.
 */
export function normalizeAgainstAnchor(
  objectives: readonly number[],
  anchor: readonly number[],
): number[] {
  return objectives.map((v, i) => {
    const floor = OBJECTIVE_FLOORS[OBJECTIVE_NAMES[i]];
    const denom = anchor[i] - floor;
    if (denom === 0) return v >= anchor[i] ? 1 : 0;
    return (v - floor) / denom;
  });
}
