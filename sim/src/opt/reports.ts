// Run reports: turn an NSGA-II result into a serializable object the display-only
// UI (and later D1) will read. It carries the Pareto front and the full ranked
// leaderboard with each build's raw metrics, its objective vector, and a weighted
// scalar score.
//
// Weighting is a post-hoc summary over the stored objectives (plan + metrics
// spec): the report includes each objective's min/max bounds, so the UI can
// reweight and re-rank client-side without re-running the simulation. The default
// weights are equal.
//
// Note: normalization here is min-max across the population — a stand-in for the
// metrics spec's ratio-to-reference-party normalization, which arrives with the
// full metric catalog. The weighting-agnostic storage is the part that matters for
// the UI contract and it is already in place.

import { seedFrom } from '../rng/rng';
import { abilitiesFrom, genomeKey, type MartialGenome } from './genome';
import { OBJECTIVE_NAMES } from './evaluate';
import type { Individual, Nsga2Result } from './nsga2';

/** Report format version, bumped when the shape changes. */
export const REPORT_VERSION = 1;

export type ObjectiveWeights = Partial<Record<(typeof OBJECTIVE_NAMES)[number], number>>;

export interface BuildReportEntry {
  readonly key: string;
  readonly rank: number;
  readonly genome: MartialGenome;
  readonly description: string;
  readonly metrics: {
    readonly winRate: number;
    readonly avgDamageDealt: number;
    readonly avgHpFracRetained: number;
    readonly avgRounds: number;
    readonly runs: number;
  };
  readonly objectives: Record<string, number>;
  readonly weightedScore: number;
}

export interface RunReport {
  readonly version: number;
  readonly runKey: string;
  readonly config: Record<string, unknown>;
  readonly objectiveNames: readonly string[];
  /** Per-objective [min, max] over the population, for client-side reweighting. */
  readonly objectiveBounds: Record<string, [number, number]>;
  readonly weights: Record<string, number>;
  readonly paretoFront: readonly BuildReportEntry[];
  readonly leaderboard: readonly BuildReportEntry[];
}

/** A short, human-readable summary of a martial build. */
export function describeGenome(g: MartialGenome): string {
  const ab = abilitiesFrom(g.abilityAssignment);
  const top = (Object.entries(ab) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${k.toUpperCase()} ${v}`)
    .join(', ');
  const gear = [
    g.twoHanded ? `${g.weaponName} (2H)` : g.weaponName,
    g.shield ? 'shield' : null,
    g.armorName ?? 'unarmored',
    g.fightingStyle,
  ]
    .filter(Boolean)
    .join(', ');
  return `L? ${g.classSlug} — ${gear} — ${top}`;
}

function normalize(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : 0.5;
}

/** The equal-weight default over the objectives. */
export function equalWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const name of OBJECTIVE_NAMES) w[name] = 1;
  return w;
}

/**
 * Score one objective vector against the population bounds under weights.
 * Each objective is min-max normalized then weighted; the sum is divided by the
 * total weight so the score stays in [0, 1].
 */
export function weightedScore(
  objectives: readonly number[],
  bounds: Record<string, [number, number]>,
  weights: Record<string, number>,
): number {
  let sum = 0;
  let total = 0;
  OBJECTIVE_NAMES.forEach((name, i) => {
    const w = weights[name] ?? 0;
    if (w === 0) return;
    const [min, max] = bounds[name];
    sum += w * normalize(objectives[i], min, max);
    total += w;
  });
  return total > 0 ? sum / total : 0;
}

/** Build the serializable report from an NSGA-II result. */
export function buildReport(
  result: Nsga2Result,
  config: Record<string, unknown>,
  weights: Record<string, number> = equalWeights(),
  leaderboardSize = 20,
): RunReport {
  const pop = result.population;

  // Per-objective bounds over the whole population.
  const bounds: Record<string, [number, number]> = {};
  OBJECTIVE_NAMES.forEach((name, i) => {
    let min = Infinity;
    let max = -Infinity;
    for (const ind of pop) {
      min = Math.min(min, ind.objectives[i]);
      max = Math.max(max, ind.objectives[i]);
    }
    bounds[name] = [min, max];
  });

  const toEntry = (ind: Individual): BuildReportEntry => {
    const objectives: Record<string, number> = {};
    OBJECTIVE_NAMES.forEach((name, i) => (objectives[name] = ind.objectives[i]));
    return {
      key: genomeKey(ind.genome),
      rank: ind.rank,
      genome: ind.genome,
      description: describeGenome(ind.genome),
      metrics: {
        winRate: ind.result.winRate,
        avgDamageDealt: ind.result.avgDamageDealt,
        avgHpFracRetained: ind.result.avgHpFracRetained,
        avgRounds: ind.result.avgRounds,
        runs: ind.result.runs,
      },
      objectives,
      weightedScore: weightedScore(ind.objectives, bounds, weights),
    };
  };

  const byScore = (a: BuildReportEntry, b: BuildReportEntry) => b.weightedScore - a.weightedScore;

  // De-duplicate by genome key for the leaderboard (the population can repeat elites).
  const seen = new Set<string>();
  const leaderboard = pop
    .map(toEntry)
    .filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)))
    .sort(byScore)
    .slice(0, leaderboardSize);

  const paretoFront = result.front.map(toEntry).sort(byScore);

  return {
    version: REPORT_VERSION,
    runKey: runKey(config),
    config,
    objectiveNames: [...OBJECTIVE_NAMES],
    objectiveBounds: bounds,
    weights,
    paretoFront,
    leaderboard,
  };
}

/** A short stable key for a run config (engine/content hashing comes later). */
export function runKey(config: Record<string, unknown>): string {
  return seedFrom('run', JSON.stringify(config)).toString(16).padStart(8, '0');
}

/**
 * Re-rank an existing report under new weights without re-simulating — the
 * property the UI relies on. Returns a new report with recomputed scores and order.
 */
export function rescore(report: RunReport, weights: Record<string, number>): RunReport {
  const rescoreEntry = (e: BuildReportEntry): BuildReportEntry => {
    const vec = report.objectiveNames.map((n) => e.objectives[n]);
    return { ...e, weightedScore: weightedScore(vec, report.objectiveBounds, weights) };
  };
  const byScore = (a: BuildReportEntry, b: BuildReportEntry) => b.weightedScore - a.weightedScore;
  return {
    ...report,
    weights,
    paretoFront: report.paretoFront.map(rescoreEntry).sort(byScore),
    leaderboard: report.leaderboard.map(rescoreEntry).sort(byScore),
  };
}
