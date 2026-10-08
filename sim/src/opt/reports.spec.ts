import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { runNsga2, type Nsga2Result } from './nsga2';
import {
  buildReport,
  describeGenome,
  equalWeights,
  REPORT_VERSION,
  rescore,
  runKey,
  weightedScore,
} from './reports';

describe('weightedScore', () => {
  const bounds = {
    reliability: [0, 1] as [number, number],
    offense: [0, 100] as [number, number],
    survival: [0, 1] as [number, number],
    efficiency: [-10, 0] as [number, number],
    control: [0, 10] as [number, number],
    support: [0, 10] as [number, number],
  };

  it('ranks a dominant point highest under equal weights', () => {
    const best = weightedScore([1, 100, 1, 0, 10, 10], bounds, equalWeights());
    const worst = weightedScore([0, 0, 0, -10, 0, 0], bounds, equalWeights());
    expect(best).toBeCloseTo(1, 10);
    expect(worst).toBeCloseTo(0, 10);
  });

  it('weights shift the ranking', () => {
    // Build A: great offense, poor survival. Build B: the reverse.
    const a = [0.5, 100, 0, -5, 0, 0] as const;
    const b = [0.5, 0, 1, -5, 0, 0] as const;
    const offenseHeavy = { reliability: 0, offense: 1, survival: 0, efficiency: 0 };
    const survivalHeavy = { reliability: 0, offense: 0, survival: 1, efficiency: 0 };
    expect(weightedScore(a, bounds, offenseHeavy)).toBeGreaterThan(
      weightedScore(b, bounds, offenseHeavy),
    );
    expect(weightedScore(b, bounds, survivalHeavy)).toBeGreaterThan(
      weightedScore(a, bounds, survivalHeavy),
    );
  });
});

describe('describeGenome', () => {
  it('summarizes class, gear and top abilities', () => {
    const text = describeGenome({
      classSlug: 'barbarian',
      abilityAssignment: [0, 1, 2, 3, 4, 5],
      weaponName: 'Greatsword',
      armorName: null,
      shield: false,
      twoHanded: true,
    });
    expect(text).toContain('barbarian');
    expect(text).toContain('Greatsword (2H)');
    expect(text).toContain('unarmored');
    expect(text).toContain('STR 15');
  });
});

describe('buildReport against the seeds', () => {
  let catalog: MartialCatalog;
  let result: Nsga2Result;

  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      catalog = loadMartialCatalog(db, 3);
    } finally {
      db.close();
    }
    result = runNsga2(catalog, new Random(42), {
      populationSize: 16,
      generations: 6,
      eval: { runs: 8 },
    });
  });

  it('produces a serializable, well-formed report', () => {
    const config = { level: 3, scenarioId: 'l3-goblins', populationSize: 16, generations: 6 };
    const report = buildReport(result, config);
    expect(report.version).toBe(REPORT_VERSION);
    expect(report.runKey).toMatch(/^[0-9a-f]{8}$/);
    expect(report.objectiveNames).toEqual([
      'reliability',
      'offense',
      'survival',
      'efficiency',
      'control',
      'support',
    ]);
    expect(report.paretoFront.length).toBeGreaterThan(0);
    expect(report.leaderboard.length).toBeGreaterThan(0);
    // It round-trips through JSON (the UI/D1 contract).
    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
  });

  it('leaderboard is sorted by weighted score and de-duplicated', () => {
    const report = buildReport(result, {});
    for (let i = 1; i < report.leaderboard.length; i++) {
      expect(report.leaderboard[i - 1].weightedScore).toBeGreaterThanOrEqual(
        report.leaderboard[i].weightedScore,
      );
    }
    const keys = report.leaderboard.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every Pareto-front entry has rank 0', () => {
    const report = buildReport(result, {});
    for (const e of report.paretoFront) expect(e.rank).toBe(0);
  });

  it('rescore reweights without re-simulating and can change the order', () => {
    const report = buildReport(result, {});
    const survivalHeavy = { reliability: 0, offense: 0, survival: 3, efficiency: 0 };
    const reweighted = rescore(report, survivalHeavy);
    // Same builds, possibly different order; top entry maximizes survival.
    expect(reweighted.leaderboard.length).toBe(report.leaderboard.length);
    const topSurvival = reweighted.leaderboard[0].objectives['survival'];
    for (const e of reweighted.leaderboard) {
      expect(topSurvival).toBeGreaterThanOrEqual(e.objectives['survival']);
    }
  });

  it('runKey is stable for the same config', () => {
    expect(runKey({ a: 1, b: 2 })).toBe(runKey({ a: 1, b: 2 }));
    expect(runKey({ a: 1 })).not.toBe(runKey({ a: 2 }));
  });
});
