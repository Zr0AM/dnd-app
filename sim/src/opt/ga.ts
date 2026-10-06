// A minimal single-objective genetic algorithm that closes the Phase 3 loop:
// evolve a level-3 martial build for the seeded encounter. Elitism keeps the best
// builds, tournament selection picks parents, and crossover + mutation produce the
// rest. Deterministic under a seed.
//
// This is intentionally simple (one scalar fitness). The plan's NSGA-II Pareto
// optimizer, racing and confidence-interval stopping arrive in a later phase; the
// genome and evaluation here are the pieces it will reuse.

import { Random } from '../rng/rng';
import { crossover, genomeKey, mutate, randomGenome, type MartialGenome } from './genome';
import { evaluate, type EvalOptions, type EvalResult } from './evaluate';
import type { MartialCatalog } from './catalog';

export interface GaOptions {
  readonly populationSize?: number;
  readonly generations?: number;
  readonly eliteCount?: number;
  readonly tournamentSize?: number;
  readonly mutationRate?: number;
  readonly eval?: EvalOptions;
}

export interface Individual {
  readonly genome: MartialGenome;
  readonly result: EvalResult;
}

export interface GaResult {
  readonly best: Individual;
  readonly finalPopulation: readonly Individual[];
  /** Best fitness at the end of each generation. */
  readonly history: readonly number[];
}

function tournament(pop: readonly Individual[], size: number, rng: () => number): Individual {
  let best = pop[Math.floor(rng() * pop.length)];
  for (let i = 1; i < size; i++) {
    const c = pop[Math.floor(rng() * pop.length)];
    if (c.result.fitness > best.result.fitness) best = c;
  }
  return best;
}

/** Run the GA and return the best build found, the final population, and history. */
export function runGa(catalog: MartialCatalog, random: Random, opts: GaOptions = {}): GaResult {
  const populationSize = opts.populationSize ?? 24;
  const generations = opts.generations ?? 12;
  const eliteCount = opts.eliteCount ?? 3;
  const tournamentSize = opts.tournamentSize ?? 3;
  const mutationRate = opts.mutationRate ?? 0.3;

  // A cache so identical genomes are not re-evaluated (evaluation is pure in the
  // genome under CRN).
  const cache = new Map<string, EvalResult>();
  const assess = (genome: MartialGenome): Individual => {
    const key = genomeKey(genome);
    let result = cache.get(key);
    if (!result) {
      result = evaluate(genome, catalog, opts.eval);
      cache.set(key, result);
    }
    return { genome, result };
  };

  // Initial population.
  let population: Individual[] = Array.from({ length: populationSize }, (_, i) =>
    assess(randomGenome(catalog, random, `init:${i}`)),
  );
  population.sort((a, b) => b.result.fitness - a.result.fitness);

  const history: number[] = [population[0].result.fitness];

  for (let gen = 0; gen < generations; gen++) {
    const genRng = random.stream(`gen:${gen}`);
    const next: Individual[] = population.slice(0, eliteCount); // elitism

    let childIdx = 0;
    while (next.length < populationSize) {
      const a = tournament(population, tournamentSize, genRng);
      const b = tournament(population, tournamentSize, genRng);
      let child = crossover(a.genome, b.genome, catalog, random, `gen:${gen}:x:${childIdx}`);
      if (genRng() < mutationRate) {
        child = mutate(child, catalog, random, `gen:${gen}:m:${childIdx}`);
      }
      next.push(assess(child));
      childIdx++;
    }

    next.sort((a, b) => b.result.fitness - a.result.fitness);
    population = next;
    history.push(population[0].result.fitness);
  }

  return { best: population[0], finalPopulation: population, history };
}
