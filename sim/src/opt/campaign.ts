// Campaign-path scoring: the adventuring day. Where the solo and party evaluators
// score a single encounter (the one-shot / nova view), this runs a *sequence* of
// encounters on one hero without a long rest — only short rests between — so
// long-rest resources (spell slots, Rage, Sorcery Points) deplete across the day
// while short-rest resources (Warlock Pact slots, Monk Focus) and at-will options
// (cantrips, weapon attacks) carry the build. That is the lever that separates a
// nova build (aces fight one, runs dry by fight three) from a sustained build, and
// answers the plan's "one-shot vs multi-year campaign" question.

import { Random, seedFrom } from '../rng/rng';
import { Encounter } from '../combat/encounter';
import { tacticalPolicy } from '../ai/policy';
import { buildFromGenome, type MartialGenome } from './genome';
import type { MartialCatalog } from './catalog';
import type { BuildReportEntry, RunReport } from './reports';
import { mean, wilsonInterval, type Interval } from './stats';

export interface CampaignResult {
  /** Fraction of days the hero cleared every encounter and survived. */
  readonly dayWinRate: number;
  /** Mean encounters cleared before the hero fell (out of the day's length). */
  readonly avgEncountersCleared: number;
  /** Encounters in a day. */
  readonly encountersPerDay: number;
  readonly days: number;
  readonly ci: { readonly dayWinRate: Interval };
}

export interface CampaignOptions {
  /** Simulated days (each a fresh hero running the sequence). */
  readonly days?: number;
  /** Fraction of max HP recovered on each short rest (hit-dice abstraction). */
  readonly shortRestHealFrac?: number;
}

/** Reset the transient between-fight state the hero should not carry over. */
function freshEncounterState(hero: ReturnType<typeof buildFromGenome>): void {
  hero.concentratingOn = null;
  hero.markedTarget = null;
  hero.activeForm = null;
}

/**
 * Run an adventuring day: the catalog's scenario set, in order, on one persisted
 * hero with a short rest between encounters (no long rest). Long-rest resources
 * carry their depletion; short-rest resources refresh; HP partly recovers.
 */
export function evaluateAdventuringDay(
  genome: MartialGenome,
  catalog: MartialCatalog,
  opts: CampaignOptions = {},
): CampaignResult {
  const days = opts.days ?? 16;
  const healFrac = opts.shortRestHealFrac ?? 0.5;
  const scenarios = catalog.scenarios;
  const perDay = scenarios.length;

  const dayWinSamples: number[] = [];
  const clearedSamples: number[] = [];

  for (let day = 0; day < days; day++) {
    const hero = buildFromGenome(genome, catalog, 'hero');
    let cleared = 0;
    for (let i = 0; i < perDay; i++) {
      if (i > 0) {
        // Short rest between encounters: refresh short-rest resources and heal a
        // slice of HP (a hit-dice abstraction); long-rest resources stay depleted.
        hero.shortRest();
        hero.heal(Math.floor(hero.maxHp * healFrac));
      }
      freshEncounterState(hero);
      const scenario = scenarios[i];
      hero.position = scenario.heroStart;
      const rng = new Random(seedFrom('day', day, i));
      const e = new Encounter({
        grid: scenario.grid,
        combatants: [hero, ...scenario.spawnEnemies()],
        rng,
        policyFor: () => tacticalPolicy,
      });
      const res = e.run(50);
      if (res.winner === 'party' && hero.isConscious) cleared++;
      else break; // the day ends when the hero falls or fails to clear a fight
    }
    clearedSamples.push(cleared);
    dayWinSamples.push(cleared === perDay ? 1 : 0);
  }

  const wins = dayWinSamples.reduce((a, b) => a + b, 0);
  return {
    dayWinRate: days ? wins / days : 0,
    avgEncountersCleared: mean(clearedSamples),
    encountersPerDay: perDay,
    days,
    ci: { dayWinRate: wilsonInterval(wins, days) },
  };
}

/**
 * Annotate a one-shot run report with each build's adventuring-day win rate, so the
 * one-shot ranking can be read against campaign viability (the project's
 * one-shot-vs-multi-year question). Only the reported builds (front + leaderboard)
 * are re-simulated, keyed by genome so a build appearing in both is run once.
 */
export function annotateCampaignViability(
  report: RunReport,
  catalog: MartialCatalog,
  opts: CampaignOptions = {},
): RunReport {
  const cache = new Map<string, number>();
  const dayWinRate = (entry: BuildReportEntry): number => {
    const cached = cache.get(entry.key);
    if (cached !== undefined) return cached;
    const rate = evaluateAdventuringDay(entry.genome, catalog, opts).dayWinRate;
    cache.set(entry.key, rate);
    return rate;
  };
  const annotate = (entry: BuildReportEntry): BuildReportEntry => ({
    ...entry,
    campaignDayWinRate: dayWinRate(entry),
  });
  return {
    ...report,
    paretoFront: report.paretoFront.map(annotate),
    leaderboard: report.leaderboard.map(annotate),
  };
}
