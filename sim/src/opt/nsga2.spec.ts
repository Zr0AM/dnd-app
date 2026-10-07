import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { objectivesOf } from './evaluate';
import { crowdingDistances, dominates, fastNonDominatedSort, runNsga2 } from './nsga2';

describe('dominates', () => {
  it('a strictly-better point dominates', () => {
    expect(dominates([2, 2], [1, 1])).toBe(true);
    expect(dominates([2, 1], [1, 1])).toBe(true); // equal in one, better in another
  });

  it('non-domination when each is better in a different objective', () => {
    expect(dominates([2, 1], [1, 2])).toBe(false);
    expect(dominates([1, 2], [2, 1])).toBe(false);
  });

  it('equal points do not dominate each other', () => {
    expect(dominates([1, 1], [1, 1])).toBe(false);
  });
});

describe('fastNonDominatedSort', () => {
  it('separates a dominated point into a later front', () => {
    // A and B are a trade-off (front 0); C is dominated by both (front 1).
    const points = [
      [2, 1], // A
      [1, 2], // B
      [1, 1], // C dominated by A and B
    ];
    const fronts = fastNonDominatedSort(points);
    expect(fronts).toHaveLength(2);
    expect(fronts[0].sort()).toEqual([0, 1]);
    expect(fronts[1]).toEqual([2]);
  });

  it('a single front when all points are mutually non-dominated', () => {
    const points = [
      [3, 1],
      [2, 2],
      [1, 3],
    ];
    const fronts = fastNonDominatedSort(points);
    expect(fronts).toHaveLength(1);
    expect(fronts[0]).toHaveLength(3);
  });

  it('a chain of domination yields one point per front', () => {
    const points = [
      [3, 3],
      [2, 2],
      [1, 1],
    ];
    const fronts = fastNonDominatedSort(points);
    expect(fronts.map((f) => f.length)).toEqual([1, 1, 1]);
    expect(fronts[0]).toEqual([0]);
  });
});

describe('crowdingDistances', () => {
  it('gives the boundary points infinite distance', () => {
    const points = [
      [1, 3],
      [2, 2],
      [3, 1],
    ];
    const d = crowdingDistances(points, [0, 1, 2]);
    // Sorted by each objective, the extremes are 0 and 2; the middle (1) is finite.
    const infCount = d.filter((x) => x === Infinity).length;
    expect(infCount).toBe(2);
    expect(d[1]).toBeGreaterThan(0);
    expect(Number.isFinite(d[1])).toBe(true);
  });

  it('handles a single point', () => {
    expect(crowdingDistances([[1, 1]], [0])).toEqual([Infinity]);
  });
});

describe('runNsga2 against the seeds', () => {
  let catalog: MartialCatalog;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      catalog = loadMartialCatalog(db, 3);
    } finally {
      db.close();
    }
  });

  it('returns a non-empty Pareto front of legal builds', () => {
    const result = runNsga2(catalog, new Random(42), {
      populationSize: 16,
      generations: 6,
      eval: { runs: 8 },
    });
    expect(result.front.length).toBeGreaterThan(0);
    for (const ind of result.front) {
      expect(ind.rank).toBe(0);
      expect(ind.objectives).toHaveLength(5);
    }
  });

  it('the front is actually non-dominated', () => {
    const result = runNsga2(catalog, new Random(5), {
      populationSize: 16,
      generations: 6,
      eval: { runs: 8 },
    });
    const pts = result.front.map((i) => i.objectives);
    for (let a = 0; a < pts.length; a++) {
      for (let b = 0; b < pts.length; b++) {
        if (a !== b) expect(dominates(pts[a], pts[b])).toBe(false);
      }
    }
  });

  it('is deterministic under a seed', () => {
    const opts = { populationSize: 12, generations: 5, eval: { runs: 6 } };
    const a = runNsga2(catalog, new Random(7), opts);
    const b = runNsga2(catalog, new Random(7), opts);
    expect(a.front.map((i) => i.objectives)).toEqual(b.front.map((i) => i.objectives));
  });

  it('objectivesOf orients all four objectives for maximization', () => {
    const result = runNsga2(catalog, new Random(11), {
      populationSize: 12,
      generations: 4,
      eval: { runs: 6 },
    });
    const best = result.front[0];
    expect(objectivesOf(best.result)).toEqual(best.objectives);
    // efficiency objective is negative rounds, so it is <= 0.
    expect(best.objectives[3]).toBeLessThanOrEqual(0);
  });
});
