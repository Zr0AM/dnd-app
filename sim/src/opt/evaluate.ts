// Evaluate a martial genome by simulating it across the scenario library, several
// times per scenario under common random numbers, and reducing the outcomes to a
// multi-objective vector and a scalar fitness, each with a confidence interval.
// The CRN seeds depend only on (scenario, runIndex), not on the genome, so every
// build faces identical enemy rolls and initiative — the paired comparison the
// metrics spec calls for. Running across the whole library (single foe, pack,
// swarm, mixed) stops a build from overfitting one encounter.

import { Random, seedFrom } from '../rng/rng';
import { Encounter, type CombatEvent } from '../combat/encounter';
import { tacticalPolicy } from '../ai/policy';
import { buildFromGenome, type MartialGenome } from './genome';
import type { MartialCatalog } from './catalog';
import { meanInterval, wilsonInterval, type Interval } from './stats';

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
  /** Mean enemy actions the hero denied via control conditions — control. */
  readonly avgActionsDenied: number;
  /** Total runs across all scenarios. */
  readonly runs: number;
  /** Confidence intervals (95%) for the headline metrics. */
  readonly ci: {
    readonly winRate: Interval;
    readonly damage: Interval;
    readonly hpRetained: Interval;
  };
}

export interface EvalOptions {
  /** Runs per scenario (total runs = this x scenario count). */
  readonly runs?: number;
}

/** Simulate one genome and return its fitness and the metrics behind it. */
export function evaluate(
  genome: MartialGenome,
  catalog: MartialCatalog,
  opts: EvalOptions = {},
): EvalResult {
  const runsPer = opts.runs ?? 16;
  const scenarios = catalog.scenarios;
  const roundCap = 50;

  // Per-run samples, pooled across the whole scenario library.
  const winSamples: number[] = [];
  const hpOnWinSamples: number[] = [];
  const hpRetainedSamples: number[] = [];
  const damageSamples: number[] = [];
  const roundSamples: number[] = [];
  const roundEffectiveSamples: number[] = [];
  const deniedSamples: number[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < runsPer; i++) {
      // CRN: the seed depends only on the scenario id and run index.
      const rng = new Random(seedFrom(scenario.id, i));
      const hero = buildFromGenome(genome, catalog, 'hero');
      hero.position = scenario.heroStart;
      const enemies = scenario.spawnEnemies();
      const e = new Encounter({
        grid: scenario.grid,
        combatants: [hero, ...enemies],
        rng,
        policyFor: () => tacticalPolicy,
      });
      const res = e.run(roundCap);
      const retained = hero.isConscious ? hero.hp / hero.maxHp : 0;
      const won = res.winner === 'party' && hero.isConscious;
      winSamples.push(won ? 1 : 0);
      hpRetainedSamples.push(retained);
      damageSamples.push(heroDamageDealt(res.log, 'hero'));
      roundSamples.push(res.rounds);
      roundEffectiveSamples.push(won ? res.rounds : roundCap);
      deniedSamples.push(actionsDenied(res.log, 'hero'));
      if (won) hpOnWinSamples.push(retained);
    }
  }

  const runs = winSamples.length;
  const wins = winSamples.reduce((a, b) => a + b, 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const winRate = runs > 0 ? wins / runs : 0;
  const avgHpFracOnWin = avg(hpOnWinSamples);
  const avgHpFracRetained = avg(hpRetainedSamples);
  const avgDamageDealt = avg(damageSamples);
  const avgRounds = avg(roundSamples);
  const avgRoundsEffective = avg(roundEffectiveSamples);
  const avgActionsDenied = avg(deniedSamples);
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
    avgActionsDenied,
    runs,
    ci: {
      winRate: wilsonInterval(wins, runs),
      damage: meanInterval(damageSamples),
      hpRetained: meanInterval(hpRetainedSamples),
    },
  };
}

/** Total damage a combatant dealt in one fight, from the event log. */
function heroDamageDealt(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) {
    if (ev.kind === 'attack' && ev.attacker === id) total += ev.damage;
    else if (ev.kind === 'opportunity' && ev.attacker === id) total += ev.damage;
    else if (ev.kind === 'spell' && ev.caster === id) total += ev.damage;
  }
  return total;
}

/** Enemy actions the combatant denied via control conditions (controlDenied events). */
function actionsDenied(log: readonly CombatEvent[], id: string): number {
  let total = 0;
  for (const ev of log) if (ev.kind === 'controlDenied' && ev.source === id) total += 1;
  return total;
}

/**
 * The multi-objective vector for NSGA-II, all oriented so higher is better:
 * reliability (win rate), offense (damage), survival (HP retained), efficiency
 * (negative rounds — fewer is better), control (enemy actions denied), and support
 * (healing + buffs the hero gives allies). The six axes of the metrics spec.
 *
 * Support has no solo signal — a lone hero has no allies to heal or buff — so solo
 * `evaluate` always scores 0 on it (martials correctly read 0 support). The axis
 * carries real values only in the party harness (`party-evaluate.ts`), the same
 * place control's party attribution lives.
 */
export const OBJECTIVE_NAMES = [
  'reliability',
  'offense',
  'survival',
  'efficiency',
  'control',
  'support',
] as const;

export function objectivesOf(r: EvalResult): number[] {
  return [
    r.winRate,
    r.avgDamageDealt,
    r.avgHpFracRetained,
    -r.avgRoundsEffective,
    r.avgActionsDenied,
    0, // support: no allies in a solo evaluation
  ];
}
