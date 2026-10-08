import { describe, it, expect, beforeAll } from 'vitest';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import {
  loadPartyHarness,
  evaluatePartyBuild,
  partyObjectivesOf,
  type PartyHarness,
} from './party-evaluate';
import { OBJECTIVE_NAMES } from './evaluate';
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
const bardBuffer: MartialGenome = {
  classSlug: 'bard',
  abilityAssignment: [5, 1, 2, 3, 4, 0], // Cha high
  weaponName: 'Rapier',
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

  it('a buffer hero delivers buff assists and support the blaster does not', () => {
    const buffer = evaluatePartyBuild(bardBuffer, catalog, harness, {
      runs: 12,
      heroRole: 'buffer',
    });
    const blaster = evaluatePartyBuild(wizardBlaster, catalog, harness, {
      runs: 12,
      heroRole: 'controller',
    });
    // The bard's Bless/Haste land on allies, so it registers buff assists and a
    // support signal; the blaster buffs no one.
    expect(buffer.avgHeroBuffAssists).toBeGreaterThan(0);
    expect(buffer.avgHeroSupport).toBeGreaterThan(blaster.avgHeroSupport);
    expect(blaster.avgHeroBuffAssists).toBe(0);
  });

  it('partyObjectivesOf yields the six-axis vector with a support value', () => {
    const buffer = evaluatePartyBuild(bardBuffer, catalog, harness, {
      runs: 10,
      heroRole: 'buffer',
    });
    const vec = partyObjectivesOf(buffer);
    expect(vec).toHaveLength(OBJECTIVE_NAMES.length);
    // Support is the last axis and is positive for a working buffer.
    expect(vec[OBJECTIVE_NAMES.indexOf('support')]).toBeGreaterThan(0);
    // Efficiency (index 3) is negative rounds.
    expect(vec[OBJECTIVE_NAMES.indexOf('efficiency')]).toBeLessThanOrEqual(0);
  });

  it('is deterministic under the fixed scenario seeds', () => {
    const a = evaluatePartyBuild(clericHealer, catalog, harness, { runs: 8, heroRole: 'healer' });
    const b = evaluatePartyBuild(clericHealer, catalog, harness, { runs: 8, heroRole: 'healer' });
    expect(a.winRate).toBe(b.winRate);
    expect(a.avgHeroHealing).toBe(b.avgHeroHealing);
    expect(a.avgHeroDamage).toBe(b.avgHeroDamage);
  });
});
