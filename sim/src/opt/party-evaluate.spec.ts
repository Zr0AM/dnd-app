import { describe, it, expect, beforeAll } from 'vitest';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import { loadPartyHarness, evaluatePartyBuild, type PartyHarness } from './party-evaluate';
import type { MartialGenome } from './genome';

const clericHealer: MartialGenome = {
  classSlug: 'cleric',
  abilityAssignment: [4, 3, 2, 5, 0, 1], // Wis high
  weaponName: 'Mace',
  armorName: null,
  shield: false,
  twoHanded: false,
};
const wizardBlaster: MartialGenome = {
  classSlug: 'wizard',
  abilityAssignment: [5, 1, 2, 0, 3, 4], // Int high
  weaponName: 'Dagger',
  armorName: null,
  shield: false,
  twoHanded: false,
};

describe('party evaluation', () => {
  let catalog: MartialCatalog;
  let harness: PartyHarness;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      catalog = loadMartialCatalog(db, 5);
      harness = loadPartyHarness(db, 5);
    } finally {
      db.close();
    }
  });

  it('returns well-formed metrics across the templates', () => {
    const r = evaluatePartyBuild(clericHealer, catalog, harness, { runs: 8, heroRole: 'healer' });
    expect(r.runs).toBeGreaterThan(0);
    expect(r.winRate).toBeGreaterThanOrEqual(0);
    expect(r.winRate).toBeLessThanOrEqual(1);
    expect(r.ci.winRate.halfWidth).toBeGreaterThanOrEqual(0);
  });

  it('a healer hero produces healing; a blaster hero produces damage', () => {
    const healer = evaluatePartyBuild(clericHealer, catalog, harness, {
      runs: 12,
      heroRole: 'healer',
    });
    const blaster = evaluatePartyBuild(wizardBlaster, catalog, harness, {
      runs: 12,
      heroRole: 'controller',
    });
    // The support axis distinguishes them: the healer heals more, the blaster
    // out-damages by a wide margin (AoE across the horde).
    expect(healer.avgHeroHealing).toBeGreaterThan(blaster.avgHeroHealing);
    expect(blaster.avgHeroDamage).toBeGreaterThan(healer.avgHeroDamage);
  });

  it('is deterministic under the fixed scenario seeds', () => {
    const a = evaluatePartyBuild(clericHealer, catalog, harness, { runs: 8, heroRole: 'healer' });
    const b = evaluatePartyBuild(clericHealer, catalog, harness, { runs: 8, heroRole: 'healer' });
    expect(a.winRate).toBe(b.winRate);
    expect(a.avgHeroHealing).toBe(b.avgHeroHealing);
    expect(a.avgHeroDamage).toBe(b.avgHeroDamage);
  });
});
