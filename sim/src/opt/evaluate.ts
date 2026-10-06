// Evaluate a martial genome by simulating it against a fixed seeded encounter,
// several times under common random numbers, and reducing the outcomes to a
// scalar fitness. The CRN seeds depend only on (scenario, runIndex), not on the
// genome, so every build faces identical enemy rolls and initiative — the paired
// comparison the metrics spec calls for.
//
// This is the Phase 3 single-objective fitness. The full metric catalog and the
// NSGA-II multi-objective front arrive in later phases; the scalar here is just
// win rate, then surviving HP, then speed.

import { Random, seedFrom } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { Encounter } from '../combat/encounter';
import { spawnMonster } from '../content/monster';
import { tacticalPolicy } from '../ai/policy';
import { buildFromGenome, type MartialGenome } from './genome';
import type { MartialCatalog } from './catalog';

export interface EvalResult {
  readonly fitness: number;
  readonly winRate: number;
  readonly avgHpFracOnWin: number;
  readonly avgRounds: number;
  readonly runs: number;
}

export interface EvalOptions {
  readonly runs?: number;
  readonly scenarioId?: string;
  readonly goblinCount?: number;
}

/** Simulate one genome and return its fitness and the metrics behind it. */
export function evaluate(
  genome: MartialGenome,
  catalog: MartialCatalog,
  opts: EvalOptions = {},
): EvalResult {
  const runs = opts.runs ?? 24;
  const scenarioId = opts.scenarioId ?? 'l3-goblins';
  const goblinCount = opts.goblinCount ?? 2;

  let wins = 0;
  let hpFracSum = 0;
  let roundsSum = 0;

  for (let i = 0; i < runs; i++) {
    // CRN: the seed depends only on the scenario and run index.
    const rng = new Random(seedFrom(scenarioId, i));
    const hero = buildFromGenome(genome, catalog, 'hero');
    hero.position = cell(0, 5);
    const goblins = Array.from({ length: goblinCount }, (_, g) =>
      spawnMonster(catalog.goblin, {
        id: `goblin-${g}`,
        side: 'enemy',
        position: cell(8, 4 + g * 2),
      }),
    );
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [hero, ...goblins],
      rng,
      policyFor: () => tacticalPolicy,
    });
    const res = e.run(50);
    roundsSum += res.rounds;
    if (res.winner === 'party' && hero.isConscious) {
      wins++;
      hpFracSum += hero.hp / hero.maxHp;
    }
  }

  const winRate = wins / runs;
  const avgHpFracOnWin = wins > 0 ? hpFracSum / wins : 0;
  const avgRounds = roundsSum / runs;
  // Win rate dominates; surviving HP breaks ties; faster is a small bonus.
  const fitness = winRate * 100 + avgHpFracOnWin * 10 - avgRounds * 0.1;

  return { fitness, winRate, avgHpFracOnWin, avgRounds, runs };
}
