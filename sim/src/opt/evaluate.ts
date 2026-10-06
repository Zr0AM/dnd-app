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
import { Encounter, type CombatEvent } from '../combat/encounter';
import { spawnMonster } from '../content/monster';
import { tacticalPolicy } from '../ai/policy';
import { buildFromGenome, type MartialGenome } from './genome';
import type { MartialCatalog } from './catalog';

export interface EvalResult {
  readonly fitness: number;
  readonly winRate: number;
  readonly avgHpFracOnWin: number;
  /** Mean HP fraction retained across all runs (0 when downed) — survivability. */
  readonly avgHpFracRetained: number;
  /** Mean damage the hero dealt per fight — offense. */
  readonly avgDamageDealt: number;
  readonly avgRounds: number;
  /**
   * Mean rounds for the efficiency objective: a win counts its rounds, a loss
   * counts the round cap. This stops "die fast" from reading as "efficient" — a
   * gap NSGA-II exploited when efficiency was raw rounds.
   */
  readonly avgRoundsEffective: number;
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

  const roundCap = 50;
  let wins = 0;
  let hpFracOnWinSum = 0;
  let hpFracRetainedSum = 0;
  let damageSum = 0;
  let roundsSum = 0;
  let roundsEffectiveSum = 0;

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
    const res = e.run(roundCap);
    roundsSum += res.rounds;
    damageSum += heroDamageDealt(res.log, 'hero');
    const retained = hero.isConscious ? hero.hp / hero.maxHp : 0;
    hpFracRetainedSum += retained;
    const won = res.winner === 'party' && hero.isConscious;
    roundsEffectiveSum += won ? res.rounds : roundCap;
    if (won) {
      wins++;
      hpFracOnWinSum += retained;
    }
  }

  const winRate = wins / runs;
  const avgHpFracOnWin = wins > 0 ? hpFracOnWinSum / wins : 0;
  const avgHpFracRetained = hpFracRetainedSum / runs;
  const avgDamageDealt = damageSum / runs;
  const avgRounds = roundsSum / runs;
  const avgRoundsEffective = roundsEffectiveSum / runs;
  // Win rate dominates; surviving HP breaks ties; faster is a small bonus.
  const fitness = winRate * 100 + avgHpFracOnWin * 10 - avgRounds * 0.1;

  return {
    fitness,
    winRate,
    avgHpFracOnWin,
    avgHpFracRetained,
    avgDamageDealt,
    avgRounds,
    avgRoundsEffective,
    runs,
  };
}

/** Total damage a combatant dealt in one fight, from the event log. */
function heroDamageDealt(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) {
    if (ev.kind === 'attack' && ev.attacker === id) total += ev.damage;
    else if (ev.kind === 'opportunity' && ev.attacker === id) total += ev.damage;
  }
  return total;
}

/**
 * The multi-objective vector for NSGA-II, all oriented so higher is better:
 * reliability (win rate), offense (damage), survival (HP retained), efficiency
 * (negative rounds — fewer is better). A pragmatic subset of the metrics spec's
 * six axes, enough for a meaningful Pareto front at the martial tier.
 */
export const OBJECTIVE_NAMES = ['reliability', 'offense', 'survival', 'efficiency'] as const;

export function objectivesOf(r: EvalResult): number[] {
  return [r.winRate, r.avgDamageDealt, r.avgHpFracRetained, -r.avgRoundsEffective];
}
