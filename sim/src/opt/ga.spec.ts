import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { evaluate } from './evaluate';
import { abilitiesFrom, buildFromGenome, type MartialGenome } from './genome';
import { runGa } from './ga';

let catalog: MartialCatalog;

beforeAll(() => {
  const db = buildSeedDatabase();
  try {
    catalog = loadMartialCatalog(db, 3);
  } finally {
    db.close();
  }
});

// A deliberately strong and a deliberately weak genome for a sanity comparison.
const strong: MartialGenome = {
  classSlug: 'fighter',
  abilityAssignment: [0, 1, 2, 3, 4, 5], // Str 15 highest
  weaponName: 'Greatsword',
  armorName: 'Chain Mail',
  shield: false,
  twoHanded: true,
  fightingStyle: 'great-weapon',
};
const weak: MartialGenome = {
  classSlug: 'fighter',
  abilityAssignment: [5, 4, 3, 2, 1, 0], // Str 8 (dump)
  weaponName: 'Shortbow',
  armorName: 'Studded Leather Armor',
  shield: false,
  twoHanded: false,
  fightingStyle: 'defense',
};

describe('evaluate', () => {
  it('is deterministic for the same genome', () => {
    const a = evaluate(strong, catalog, { runs: 8 });
    const b = evaluate(strong, catalog, { runs: 8 });
    expect(a).toEqual(b);
  });

  it('rates a strong build above a weak one', () => {
    const s = evaluate(strong, catalog, { runs: 16 });
    const w = evaluate(weak, catalog, { runs: 16 });
    expect(s.fitness).toBeGreaterThan(w.fitness);
    expect(s.winRate).toBeGreaterThanOrEqual(w.winRate);
  });

  it('reports metrics in sensible ranges', () => {
    const r = evaluate(strong, catalog, { runs: 16 });
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(1);
    expect(r.avgRounds).toBeGreaterThan(0);
  });
});

describe('runGa', () => {
  it('improves (never worsens) the best fitness across generations', () => {
    const result = runGa(catalog, new Random(42), {
      populationSize: 12,
      generations: 5,
      eval: { runs: 8 },
    });
    // Elitism guarantees a non-decreasing best-fitness history.
    for (let i = 1; i < result.history.length; i++) {
      expect(result.history[i]).toBeGreaterThanOrEqual(result.history[i - 1]);
    }
  });

  it('is deterministic under a seed', () => {
    const opts = { populationSize: 10, generations: 4, eval: { runs: 6 } };
    const a = runGa(catalog, new Random(7), opts);
    const b = runGa(catalog, new Random(7), opts);
    expect(a.best.result.fitness).toBe(b.best.result.fitness);
    expect(a.history).toEqual(b.history);
  });

  it('finds a build at least as good as a naive strong one', () => {
    const result = runGa(catalog, new Random(123), {
      populationSize: 16,
      generations: 8,
      eval: { runs: 10 },
    });
    const naive = evaluate(strong, catalog, { runs: 10 });
    expect(result.best.result.fitness).toBeGreaterThanOrEqual(naive.fitness - 1e-9);
    // The best build should be buildable and have its primary ability invested.
    const hero = buildFromGenome(result.best.genome, catalog);
    expect(hero.hp).toBeGreaterThan(0);
    const abilities = abilitiesFrom(result.best.genome.abilityAssignment);
    const topScore = Math.max(...Object.values(abilities));
    expect(topScore).toBe(15); // the standard array's best is used somewhere
  });
});
