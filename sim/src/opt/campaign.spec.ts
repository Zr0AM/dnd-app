import { describe, it, expect, beforeAll } from 'vitest';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { evaluate } from './evaluate';
import { evaluateAdventuringDay } from './campaign';
import type { MartialGenome } from './genome';

const barbarian: MartialGenome = {
  classSlug: 'barbarian',
  abilityAssignment: [0, 2, 1, 3, 4, 5],
  weaponName: 'Greataxe',
  armorName: null,
  shield: false,
  twoHanded: true,
};
const wizard: MartialGenome = {
  classSlug: 'wizard',
  abilityAssignment: [5, 1, 2, 0, 3, 4],
  weaponName: 'Dagger',
  armorName: null,
  shield: false,
  twoHanded: false,
};

describe('adventuring-day (campaign) evaluation', () => {
  let catalog: MartialCatalog;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      catalog = loadMartialCatalog(db, 5);
    } finally {
      db.close();
    }
  });

  it('returns a well-formed result', () => {
    const r = evaluateAdventuringDay(barbarian, catalog, { days: 8 });
    expect(r.days).toBe(8);
    expect(r.encountersPerDay).toBeGreaterThan(0);
    expect(r.dayWinRate).toBeGreaterThanOrEqual(0);
    expect(r.dayWinRate).toBeLessThanOrEqual(1);
    expect(r.avgEncountersCleared).toBeLessThanOrEqual(r.encountersPerDay);
  });

  it('is deterministic under the fixed day seeds', () => {
    const a = evaluateAdventuringDay(wizard, catalog, { days: 8 });
    const b = evaluateAdventuringDay(wizard, catalog, { days: 8 });
    expect(a.dayWinRate).toBe(b.dayWinRate);
    expect(a.avgEncountersCleared).toBe(b.avgEncountersCleared);
  });

  it('separates a nova build from a sustained one across the day', () => {
    // The nova Wizard dumps its limited slots early and has no at-will staying
    // power; the Barbarian (at-will weapon attacks, short-rest Rage, high HP) lasts.
    const barbOne = evaluate(barbarian, catalog, { runs: 16 });
    const wizOne = evaluate(wizard, catalog, { runs: 16 });
    const barbDay = evaluateAdventuringDay(barbarian, catalog, { days: 16 });
    const wizDay = evaluateAdventuringDay(wizard, catalog, { days: 16 });

    // Both are credible in a single fight...
    expect(wizOne.winRate).toBeGreaterThan(0.4);
    expect(barbOne.winRate).toBeGreaterThan(0.4);
    // ...but the sustained build clears far more of the adventuring day.
    expect(barbDay.avgEncountersCleared).toBeGreaterThan(wizDay.avgEncountersCleared);
    expect(barbDay.dayWinRate).toBeGreaterThan(wizDay.dayWinRate);
  });
});
