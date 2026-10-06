// NSGA-II: multi-objective optimization returning a Pareto front, as the plan
// calls for. Objectives are all maximized (the evaluator orients them that way).
// The two algorithmic cores — fast non-dominated sort and crowding distance — are
// pure functions over objective vectors, tested on synthetic points; the optimizer
// wraps them around the martial genome and the simulator.
//
// Why NSGA-II over the scalar GA: the metrics are genuinely multi-objective (a
// glass cannon and a tank are both optimal in different trades), so a single
// weighted score hides the trade-off. NSGA-II returns the whole front; the
// weighted score (reports.ts) is then a configurable summary over it, so
// reweighting never needs a re-run — exactly the property the metrics spec wants.

import { Random } from '../rng/rng';
import { crossover, genomeKey, mutate, randomGenome, type MartialGenome } from './genome';
import { evaluate, objectivesOf, type EvalOptions, type EvalResult } from './evaluate';
import type { MartialCatalog } from './catalog';

/** Does objective vector `a` dominate `b`? (>= in all, > in at least one.) */
export function dominates(a: readonly number[], b: readonly number[]): boolean {
  let strictlyBetter = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return false;
    if (a[i] > b[i]) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * Fast non-dominated sort: partition points into Pareto fronts, best first.
 * Returns an array of fronts, each a list of indices into `points`.
 */
export function fastNonDominatedSort(points: readonly (readonly number[])[]): number[][] {
  const n = points.length;
  const dominatedBy: number[][] = Array.from({ length: n }, () => []); // who each point dominates
  const dominationCount = new Array(n).fill(0); // how many dominate each point
  const fronts: number[][] = [[]];

  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      if (p === q) continue;
      if (dominates(points[p], points[q])) dominatedBy[p].push(q);
      else if (dominates(points[q], points[p])) dominationCount[p]++;
    }
    if (dominationCount[p] === 0) fronts[0].push(p);
  }

  let i = 0;
  while (fronts[i].length > 0) {
    const next: number[] = [];
    for (const p of fronts[i]) {
      for (const q of dominatedBy[p]) {
        dominationCount[q]--;
        if (dominationCount[q] === 0) next.push(q);
      }
    }
    i++;
    fronts.push(next);
  }
  fronts.pop(); // last one is empty
  return fronts;
}

/**
 * Crowding distance for the points in one front, aligned to `frontIndices`.
 * Boundary points get Infinity so the extremes are preserved.
 */
export function crowdingDistances(
  points: readonly (readonly number[])[],
  frontIndices: readonly number[],
): number[] {
  const m = frontIndices.length;
  const distance = new Array(m).fill(0);
  if (m === 0) return distance;
  const numObjectives = points[frontIndices[0]].length;

  for (let obj = 0; obj < numObjectives; obj++) {
    const order = [...Array(m).keys()].sort(
      (a, b) => points[frontIndices[a]][obj] - points[frontIndices[b]][obj],
    );
    distance[order[0]] = Infinity;
    distance[order[m - 1]] = Infinity;
    const min = points[frontIndices[order[0]]][obj];
    const max = points[frontIndices[order[m - 1]]][obj];
    const span = max - min;
    if (span === 0) continue;
    for (let k = 1; k < m - 1; k++) {
      const prev = points[frontIndices[order[k - 1]]][obj];
      const nextV = points[frontIndices[order[k + 1]]][obj];
      distance[order[k]] += (nextV - prev) / span;
    }
  }
  return distance;
}

export interface Individual {
  readonly genome: MartialGenome;
  readonly result: EvalResult;
  readonly objectives: number[];
  rank: number;
  crowding: number;
}

export interface Nsga2Options {
  readonly populationSize?: number;
  readonly generations?: number;
  readonly mutationRate?: number;
  readonly eval?: EvalOptions;
}

export interface Nsga2Result {
  /** The final Pareto front (rank-0), sorted by crowding distance descending. */
  readonly front: readonly Individual[];
  readonly population: readonly Individual[];
  readonly generations: number;
}

/** Assign rank (front index) and crowding distance to every individual in place. */
function assignRanksAndCrowding(pop: Individual[]): number[][] {
  const points = pop.map((ind) => ind.objectives);
  const fronts = fastNonDominatedSort(points);
  fronts.forEach((front, rank) => {
    const dists = crowdingDistances(points, front);
    front.forEach((idx, k) => {
      pop[idx].rank = rank;
      pop[idx].crowding = dists[k];
    });
  });
  return fronts;
}

/** The crowded-comparison operator: lower rank wins; tie broken by higher crowding. */
function crowdedBetter(a: Individual, b: Individual): boolean {
  if (a.rank !== b.rank) return a.rank < b.rank;
  return a.crowding > b.crowding;
}

function tournament(pop: readonly Individual[], rng: () => number): Individual {
  const a = pop[Math.floor(rng() * pop.length)];
  const b = pop[Math.floor(rng() * pop.length)];
  return crowdedBetter(a, b) ? a : b;
}

/** Run NSGA-II over the martial genome and return the Pareto front. */
export function runNsga2(
  catalog: MartialCatalog,
  random: Random,
  opts: Nsga2Options = {},
): Nsga2Result {
  const populationSize = opts.populationSize ?? 24;
  const generations = opts.generations ?? 12;
  const mutationRate = opts.mutationRate ?? 0.3;

  const cache = new Map<string, EvalResult>();
  const assess = (genome: MartialGenome): Individual => {
    const key = genomeKey(genome);
    let result = cache.get(key);
    if (!result) {
      result = evaluate(genome, catalog, opts.eval);
      cache.set(key, result);
    }
    return { genome, result, objectives: objectivesOf(result), rank: 0, crowding: 0 };
  };

  let population: Individual[] = Array.from({ length: populationSize }, (_, i) =>
    assess(randomGenome(catalog, random, `init:${i}`)),
  );
  assignRanksAndCrowding(population);

  for (let gen = 0; gen < generations; gen++) {
    const genRng = random.stream(`gen:${gen}`);
    // Offspring via crowded tournament selection + crossover + mutation.
    const offspring: Individual[] = [];
    for (let c = 0; c < populationSize; c++) {
      const a = tournament(population, genRng);
      const b = tournament(population, genRng);
      let child = crossover(a.genome, b.genome, catalog, random, `gen:${gen}:x:${c}`);
      if (genRng() < mutationRate) child = mutate(child, catalog, random, `gen:${gen}:m:${c}`);
      offspring.push(assess(child));
    }

    // Combine parents and offspring, re-rank, and fill the next generation by
    // front, breaking the overflowing front by crowding distance.
    const combined = [...population, ...offspring];
    const fronts = assignRanksAndCrowding(combined);
    const next: Individual[] = [];
    for (const front of fronts) {
      if (next.length + front.length <= populationSize) {
        for (const idx of front) next.push(combined[idx]);
      } else {
        const remaining = populationSize - next.length;
        const sorted = [...front].sort((x, y) => combined[y].crowding - combined[x].crowding);
        for (let k = 0; k < remaining; k++) next.push(combined[sorted[k]]);
        break;
      }
    }
    population = next;
    assignRanksAndCrowding(population);
  }

  const front = population.filter((ind) => ind.rank === 0).sort((a, b) => b.crowding - a.crowding);
  return { front, population, generations };
}
