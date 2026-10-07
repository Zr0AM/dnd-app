import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { buildSeedDatabase } from '../content/load-db';
import { loadMartialCatalog, type MartialCatalog } from './catalog';
import {
  abilitiesFrom,
  buildFromGenome,
  BUILD_CLASSES,
  crossover,
  genomeKey,
  mutate,
  randomGenome,
  repair,
  STANDARD_ARRAY,
  type MartialGenome,
} from './genome';

let catalog: MartialCatalog;

beforeAll(() => {
  const db = buildSeedDatabase();
  try {
    catalog = loadMartialCatalog(db, 3);
  } finally {
    db.close();
  }
});

describe('abilitiesFrom', () => {
  it('applies the standard array under the assignment', () => {
    const abilities = abilitiesFrom([0, 1, 2, 3, 4, 5]);
    expect(abilities.str).toBe(STANDARD_ARRAY[0]); // 15
    expect(abilities.cha).toBe(STANDARD_ARRAY[5]); // 8
    const sorted = Object.values(abilities).sort((a, b) => b - a);
    expect(sorted).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe('repair invariants', () => {
  it('barbarians are always unarmored', () => {
    const g = repair(
      {
        classSlug: 'barbarian',
        abilityAssignment: [0, 1, 2, 3, 4, 5],
        weaponName: 'Greataxe',
        armorName: 'Chain Mail',
        shield: false,
        twoHanded: true,
      },
      catalog,
    );
    expect(g.armorName).toBeNull();
  });

  it('a two-handed weapon drops the shield', () => {
    const g = repair(
      {
        classSlug: 'fighter',
        abilityAssignment: [0, 1, 2, 3, 4, 5],
        weaponName: 'Greatsword',
        armorName: 'Chain Mail',
        shield: true,
        twoHanded: true,
      },
      catalog,
    );
    expect(g.shield).toBe(false);
    expect(g.twoHanded).toBe(true);
  });

  it('non-barbarians get armor if they had none', () => {
    const g = repair(
      {
        classSlug: 'fighter',
        abilityAssignment: [0, 1, 2, 3, 4, 5],
        weaponName: 'Longsword',
        armorName: null,
        shield: true,
        twoHanded: false,
      },
      catalog,
    );
    expect(g.armorName).not.toBeNull();
  });

  it('fighters always have a fighting style', () => {
    const g = repair(
      {
        classSlug: 'fighter',
        abilityAssignment: [0, 1, 2, 3, 4, 5],
        weaponName: 'Longsword',
        armorName: 'Chain Mail',
        shield: true,
        twoHanded: false,
      },
      catalog,
    );
    expect(g.fightingStyle).toBeDefined();
  });
});

describe('random/mutate/crossover produce legal, buildable genomes', () => {
  it('randomGenome compiles to a valid combatant', () => {
    const rng = new Random(1);
    for (let i = 0; i < 50; i++) {
      const g = randomGenome(catalog, rng, `g:${i}`);
      const c = buildFromGenome(g, catalog);
      expect(c.hp).toBeGreaterThan(0);
      expect(c.ac).toBeGreaterThan(0);
      expect(c.attacks.length).toBe(1);
    }
  });

  it('mutate stays legal and buildable', () => {
    const rng = new Random(2);
    let g = randomGenome(catalog, rng, 'base');
    for (let i = 0; i < 50; i++) {
      g = mutate(g, catalog, rng, `m:${i}`);
      expect(() => buildFromGenome(g, catalog)).not.toThrow();
      if (g.classSlug === 'barbarian') expect(g.armorName).toBeNull();
    }
  });

  it('crossover stays legal', () => {
    const rng = new Random(3);
    const a = randomGenome(catalog, rng, 'a');
    const b = randomGenome(catalog, rng, 'b');
    const child = crossover(a, b, catalog, rng, 'x');
    expect(() => buildFromGenome(child, catalog)).not.toThrow();
  });

  it('compiles caster genomes to spellcasting combatants', () => {
    const wizard = buildFromGenome(
      {
        classSlug: 'wizard',
        abilityAssignment: [5, 1, 2, 0, 3, 4],
        weaponName: 'Dagger',
        armorName: null,
        shield: false,
        twoHanded: false,
      },
      catalog,
    );
    expect(wizard.spellAbility).toBe('int');
    expect(wizard.spells.length).toBeGreaterThan(0);
    expect(wizard.slotCount(1)).toBeGreaterThan(0);
  });

  it('every SRD class compiles to a valid combatant', () => {
    for (const classSlug of BUILD_CLASSES) {
      const c = buildFromGenome(
        {
          classSlug,
          abilityAssignment: [0, 1, 2, 3, 4, 5],
          weaponName: 'Longsword',
          armorName: classSlug === 'barbarian' ? null : 'Chain Mail',
          shield: false,
          twoHanded: false,
          fightingStyle: 'defense',
        },
        catalog,
      );
      expect(c.hp, classSlug).toBeGreaterThan(0);
      expect(c.ac, classSlug).toBeGreaterThan(0);
      expect(c.attacks.length, classSlug).toBe(1);
    }
    // The full v1 roster is twelve classes.
    expect(BUILD_CLASSES.length).toBe(12);
  });

  it('compiles a Druid to a Wis caster with nature spells', () => {
    const druid = buildFromGenome(
      {
        classSlug: 'druid',
        abilityAssignment: [5, 1, 2, 3, 0, 4],
        weaponName: 'Mace',
        armorName: null,
        shield: false,
        twoHanded: false,
      },
      catalog,
    );
    expect(druid.spellAbility).toBe('wis');
    expect(druid.spells.some((s) => s.id === 'moonbeam')).toBe(true);
    expect(druid.spells.some((s) => s.id === 'cure-wounds')).toBe(true);
  });

  it('genomeKey is stable and distinguishes genomes', () => {
    const rng = new Random(4);
    const a = randomGenome(catalog, rng, 'a');
    expect(genomeKey(a)).toBe(genomeKey({ ...a }));
    const b: MartialGenome = { ...a, classSlug: a.classSlug === 'fighter' ? 'rogue' : 'fighter' };
    expect(genomeKey(a)).not.toBe(genomeKey(b));
  });
});
