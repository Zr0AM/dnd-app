import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { runNsga2, type Nsga2Result } from './nsga2';
import { buildReport, rescore } from './reports';
import { CASTER_ROLES, ROLE_WEIGHTS, roleWeights } from './roles';
import {
  BENCHMARK_GENOME,
  computeAnchor,
  normalizeAgainstAnchor,
  OBJECTIVE_FLOORS,
} from './anchor';
import { evaluate, objectivesOf } from './evaluate';

describe('role presets', () => {
  it('exposes the martial-expressible roles', () => {
    expect(Object.keys(ROLE_WEIGHTS)).toContain('tank');
    expect(Object.keys(ROLE_WEIGHTS)).toContain('sustained-dps');
    expect(roleWeights('tank')['survival']).toBeGreaterThan(roleWeights('tank')['offense']);
  });

  it('marks caster roles as not-yet-usable', () => {
    expect(CASTER_ROLES['healer']).toBeDefined();
    expect(() => roleWeights('healer')).toThrow();
  });
});

describe('anchor normalization', () => {
  let catalog: MartialCatalog;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      catalog = loadMartialCatalog(db, 3);
    } finally {
      db.close();
    }
  });

  it('normalizes the benchmark to ~1.0 on every axis', () => {
    const anchor = computeAnchor(catalog, undefined, { runs: 12 });
    const self = objectivesOf(evaluate(BENCHMARK_GENOME, catalog, { runs: 12 }));
    const norm = normalizeAgainstAnchor(self, anchor);
    for (const v of norm) expect(v).toBeCloseTo(1, 6);
  });

  it('scores a strictly-better build above 1 on the improved axes', () => {
    const anchor = computeAnchor(catalog, undefined, { runs: 16 });
    // A raging greatsword barbarian out-damages and out-survives the benchmark.
    const strong = objectivesOf(
      evaluate(
        {
          classSlug: 'barbarian',
          abilityAssignment: [0, 2, 1, 3, 4, 5],
          weaponName: 'Greatsword',
          armorName: null,
          shield: false,
          twoHanded: true,
        },
        catalog,
        { runs: 16 },
      ),
    );
    const norm = normalizeAgainstAnchor(strong, anchor);
    // Offense axis (index 1) should exceed the benchmark.
    expect(norm[1]).toBeGreaterThan(1);
  });

  it('floors are defined for every objective', () => {
    expect(OBJECTIVE_FLOORS.efficiency).toBeLessThan(0);
    expect(OBJECTIVE_FLOORS.reliability).toBe(0);
  });
});

describe('role-based report rescoring', () => {
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

  it('role reweighting shifts the ranking toward the role’s axis', () => {
    const base = buildReport(result, {});
    const tankTop = rescore(base, roleWeights('tank')).leaderboard[0];
    const dpsTop = rescore(base, roleWeights('sustained-dps')).leaderboard[0];
    // The tank-ranked best is at least as survivable as the DPS-ranked best, and
    // the DPS-ranked best deals at least as much damage as the tank-ranked best.
    expect(tankTop.objectives['survival']).toBeGreaterThanOrEqual(dpsTop.objectives['survival']);
    expect(dpsTop.objectives['offense']).toBeGreaterThanOrEqual(tankTop.objectives['offense']);
  });

  it('a pure survival weight puts the most survivable build on top', () => {
    const report = rescore(buildReport(result, {}), {
      reliability: 0,
      offense: 0,
      survival: 1,
      efficiency: 0,
    });
    const topSurvival = report.leaderboard[0].objectives['survival'];
    for (const e of report.leaderboard) {
      expect(topSurvival).toBeGreaterThanOrEqual(e.objectives['survival']);
    }
  });
});
