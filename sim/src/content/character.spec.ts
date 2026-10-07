import { describe, it, expect } from 'vitest';
import { meanDice } from '../dice/dice';
import {
  armorClass,
  compileBuild,
  maxHitPoints,
  weaponAbility,
  weaponAttack,
  type ArmorInfo,
  type BuildSpec,
  type ClassInfo,
  type WeaponInfo,
} from './character';

// Resolved data from the seeds.
const fighterClass: ClassInfo = {
  slug: 'fighter',
  hitDieSides: 10,
  saveProficiencies: ['str', 'con'],
};
const barbarianClass: ClassInfo = {
  slug: 'barbarian',
  hitDieSides: 12,
  saveProficiencies: ['str', 'con'],
};
const rogueClass: ClassInfo = { slug: 'rogue', hitDieSides: 8, saveProficiencies: ['dex', 'int'] };

const longsword: WeaponInfo = {
  name: 'Longsword',
  category: 'martial',
  range: 'melee',
  diceCount: 1,
  diceSides: 8,
  damageType: 'slashing',
  properties: ['versatile'],
  versatileDiceCount: 1,
  versatileDiceSides: 10,
};
const greataxe: WeaponInfo = {
  name: 'Greataxe',
  category: 'martial',
  range: 'melee',
  diceCount: 1,
  diceSides: 12,
  damageType: 'slashing',
  properties: ['heavy', 'two-handed'],
};
const rapier: WeaponInfo = {
  name: 'Rapier',
  category: 'martial',
  range: 'melee',
  diceCount: 1,
  diceSides: 8,
  damageType: 'piercing',
  properties: ['finesse'],
};
const longbow: WeaponInfo = {
  name: 'Longbow',
  category: 'martial',
  range: 'ranged',
  diceCount: 1,
  diceSides: 8,
  damageType: 'piercing',
  properties: ['heavy', 'two-handed', 'ammunition', 'range'],
  rangeNormalFt: 150,
  rangeLongFt: 600,
};

const chainMail: ArmorInfo = {
  name: 'Chain Mail',
  category: 'heavy',
  baseAc: 16,
  addsDex: false,
  dexCap: 0,
};
const studdedLeather: ArmorInfo = {
  name: 'Studded Leather',
  category: 'light',
  baseAc: 12,
  addsDex: true,
  dexCap: null,
};
const breastplate: ArmorInfo = {
  name: 'Breastplate',
  category: 'medium',
  baseAc: 14,
  addsDex: true,
  dexCap: 2,
};

describe('maxHitPoints', () => {
  it('level 1 is max die + Con', () => {
    expect(maxHitPoints(10, 1, 2)).toBe(12);
  });

  it('fighter L3, Con +2 = 10 + 2 + 2*(6+2) = 28', () => {
    expect(maxHitPoints(10, 3, 2)).toBe(28);
  });

  it('barbarian L3, Con +3 = 12 + 3 + 2*(7+3) = 35', () => {
    expect(maxHitPoints(12, 3, 3)).toBe(35);
  });

  it('rogue L3, Con +1 = 8 + 1 + 2*(5+1) = 21', () => {
    expect(maxHitPoints(8, 3, 1)).toBe(21);
  });

  it('each level adds at least 1 even with a huge Con penalty', () => {
    expect(maxHitPoints(6, 3, -5)).toBe(Math.max(1, 6 - 5) + 1 + 1); // level1 max(1,1)=1 -> actually 6-5=1, then +1,+1
  });
});

describe('armorClass', () => {
  const base = (o: Partial<BuildSpec>): BuildSpec => ({
    name: 'T',
    class: fighterClass,
    level: 3,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    weapon: longsword,
    ...o,
  });

  it('heavy armor ignores Dex', () => {
    expect(armorClass(base({ armor: chainMail }))).toBe(16);
  });

  it('light armor adds full Dex', () => {
    expect(
      armorClass(
        base({
          armor: studdedLeather,
          abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 },
        }),
      ),
    ).toBe(15); // 12 + 3
  });

  it('medium armor caps Dex at 2', () => {
    expect(
      armorClass(
        base({
          armor: breastplate,
          abilities: { str: 10, dex: 18, con: 14, int: 10, wis: 10, cha: 10 },
        }),
      ),
    ).toBe(16); // 14 + 2
  });

  it('shield and Defense style stack with armor', () => {
    expect(armorClass(base({ armor: chainMail, shield: true, fightingStyle: 'defense' }))).toBe(
      16 + 2 + 1,
    );
  });

  it('Defense style does not apply without armor', () => {
    expect(
      armorClass(
        base({
          armor: null,
          unarmoredDefense: 'barbarian',
          fightingStyle: 'defense',
          abilities: { str: 16, dex: 14, con: 16, int: 10, wis: 10, cha: 10 },
        }),
      ),
    ).toBe(10 + 2 + 3);
  });

  it('barbarian Unarmored Defense is 10 + Dex + Con, shield allowed', () => {
    const b = base({
      class: barbarianClass,
      armor: null,
      unarmoredDefense: 'barbarian',
      shield: true,
      abilities: { str: 16, dex: 14, con: 16, int: 10, wis: 10, cha: 10 },
    });
    expect(armorClass(b)).toBe(10 + 2 + 3 + 2);
  });
});

describe('weaponAbility and weaponAttack', () => {
  const base = (o: Partial<BuildSpec>): BuildSpec => ({
    name: 'T',
    class: fighterClass,
    level: 3,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    weapon: longsword,
    ...o,
  });

  it('melee uses Str; finesse picks the better of Str/Dex', () => {
    expect(weaponAbility(base({ weapon: longsword }))).toBe('str');
    expect(
      weaponAbility(
        base({
          weapon: rapier,
          abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 },
        }),
      ),
    ).toBe('dex');
    expect(
      weaponAbility(
        base({
          weapon: rapier,
          abilities: { str: 18, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
        }),
      ),
    ).toBe('str');
  });

  it('ranged uses Dex', () => {
    expect(weaponAbility(base({ weapon: longbow }))).toBe('dex');
  });

  it('fighter L3 longsword: +5 to hit, 1d8+3', () => {
    const a = weaponAttack(base({ weapon: longsword }));
    expect(a.attackBonus).toBe(3 + 2); // Str +3, prof +2
    expect(meanDice(a.damage)).toBe(4.5 + 3); // 1d8 + 3
    expect(a.critRange).toBe(20);
  });

  it('two-handed longsword uses the versatile die (1d10)', () => {
    const a = weaponAttack(base({ weapon: longsword, twoHanded: true }));
    expect(meanDice(a.damage)).toBe(5.5 + 3); // 1d10 + 3
  });

  it('Archery style adds +2 only to ranged attacks', () => {
    const ranged = weaponAttack(base({ weapon: longbow, fightingStyle: 'archery' }));
    expect(ranged.attackBonus).toBe(2 + 2 + 2); // Dex +2, prof +2, archery +2
    const melee = weaponAttack(base({ weapon: longsword, fightingStyle: 'archery' }));
    expect(melee.attackBonus).toBe(3 + 2); // no archery on melee
    expect(ranged.rangeFt).toBe(150);
  });

  it('Champion gets a 19-20 crit range from level 3', () => {
    expect(weaponAttack(base({ subclass: 'champion' })).critRange).toBe(19);
    expect(weaponAttack(base({ subclass: 'champion', level: 2 })).critRange).toBe(20);
  });

  it('a non-proficient weapon drops the proficiency bonus', () => {
    expect(weaponAttack(base({ weaponProficient: false })).attackBonus).toBe(3);
  });
});

describe('compileBuild', () => {
  it('a level-3 sword-and-board fighter has the expected statline', () => {
    const fighter = compileBuild({
      id: 'fighter',
      name: 'Fighter',
      class: fighterClass,
      subclass: 'champion',
      level: 3,
      abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
      weapon: longsword,
      armor: chainMail,
      shield: true,
      fightingStyle: 'defense',
    });
    expect(fighter.ac).toBe(16 + 2 + 1); // chain mail + shield + Defense = 19
    expect(fighter.hp).toBe(28); // d10, Con +2, L3
    expect(fighter.saveBonus('con')).toBe(2 + 2); // Con +2, proficient (+2 PB)
    expect(fighter.saveBonus('dex')).toBe(1); // Dex +1, not proficient
    expect(fighter.attacks[0].attackBonus).toBe(5);
    expect(fighter.attacks[0].critRange).toBe(19);
  });

  it('a level-3 barbarian is unarmored and tough', () => {
    const barb = compileBuild({
      name: 'Barbarian',
      class: barbarianClass,
      level: 3,
      abilities: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
      weapon: greataxe,
      twoHanded: true,
      unarmoredDefense: 'barbarian',
    });
    expect(barb.ac).toBe(10 + 2 + 3); // 15
    expect(barb.hp).toBe(35);
    expect(meanDice(barb.attacks[0].damage)).toBe(6.5 + 3); // 1d12 + 3
  });

  it('a level-3 dual-wield rogue uses Dex via finesse', () => {
    const rogue = compileBuild({
      name: 'Rogue',
      class: rogueClass,
      subclass: 'thief',
      level: 3,
      abilities: { str: 10, dex: 16, con: 12, int: 14, wis: 10, cha: 10 },
      weapon: rapier,
      armor: studdedLeather,
    });
    expect(rogue.ac).toBe(12 + 3); // studded leather + Dex 3 = 15
    expect(rogue.hp).toBe(21); // d8, Con +1, L3
    expect(rogue.attacks[0].attackBonus).toBe(3 + 2); // Dex +3, prof +2
    expect(rogue.saveBonus('dex')).toBe(3 + 2); // proficient
    expect(rogue.saveBonus('int')).toBe(2 + 2); // proficient
  });

  it('a Paladin gish carries spell slots and Divine Smite', () => {
    const paladinClass: ClassInfo = {
      slug: 'paladin',
      hitDieSides: 10,
      saveProficiencies: ['wis', 'cha'],
    };
    const pal = compileBuild({
      name: 'Paladin',
      class: paladinClass,
      subclass: 'oath-of-devotion',
      level: 5,
      abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 14 },
      weapon: longsword,
      armor: chainMail,
      shield: true,
      fightingStyle: 'defense',
      progression: { extraAttacks: 1 },
      spellcasting: { ability: 'cha', slots: [{ level: 1, count: 4 }], cantrips: [], spells: [] },
    });
    expect(pal.extraAttacks).toBe(1); // Extra Attack at level 5
    expect(pal.slotCount(1)).toBe(4);
    expect(pal.spellSaveDc()).toBe(8 + 3 + 2); // PB 3 + Cha +2
    expect(pal.features.some((f) => f.id === 'divine-smite')).toBe(true);
  });
});
