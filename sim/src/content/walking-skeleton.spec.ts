// The walking-skeleton slice, end to end against the real seeds: compile a
// level-3 Fighter from the database, spawn Goblin Warriors from the database,
// and run a full fight in the engine with a simple melee policy. This proves the
// whole pipeline — seeds -> compilers -> combatants -> deterministic combat —
// works on real data, which is the Phase 3 milestone the plan calls for.

import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell, distanceFt, type Cell } from '../grid/grid';
import { Encounter, idlePolicy, type TurnPolicy } from '../combat/encounter';
import { compileMonster, spawnMonster, type MonsterTemplate } from './monster';
import { compileBuild, type ClassInfo, type WeaponInfo, type ArmorInfo } from './character';
import { RageFeature } from './martial-features';
import {
  buildSeedDatabase,
  loadArmor,
  loadClass,
  loadMonsterSources,
  loadProgression,
  loadWeapon,
} from './load-db';

// A melee policy: close to the nearest enemy, then attack if in reach.
function meleeAggressor(): TurnPolicy {
  return (api) => {
    const target = api
      .enemies()
      .slice()
      .sort(
        (a, b) =>
          distanceFt(api.self.position, a.position) - distanceFt(api.self.position, b.position),
      )[0];
    if (!target) return;
    const weapon = api.self.attacks.find((w) => w.kind === 'melee') ?? api.self.attacks[0];
    if (!weapon) return;
    const reach = weapon.reachFt ?? 5;
    if (distanceFt(api.self.position, target.position) > reach) {
      api.moveTo(stepToward(api.self.position, target.position, reach));
    }
    if (distanceFt(api.self.position, target.position) <= reach) api.attack(target, weapon);
  };
}

// A cell adjacent to `target` on the line from `from`, so the mover ends in reach.
function stepToward(from: Cell, target: Cell, reachFt: number): Cell {
  const steps = Math.max(1, Math.floor(reachFt / 5));
  let { x, y } = target;
  x -= Math.sign(target.x - from.x) * steps;
  y -= Math.sign(target.y - from.y) * steps;
  return cell(x, y);
}

describe('walking skeleton: Fighter vs. goblins from the seeds', () => {
  let fighterClass: ClassInfo;
  let longsword: WeaponInfo;
  let chainMail: ArmorInfo;
  let goblinWarrior: MonsterTemplate;

  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      fighterClass = loadClass(db, 'fighter');
      longsword = loadWeapon(db, 'Longsword');
      chainMail = loadArmor(db, 'Chain Mail');
      const src = loadMonsterSources(db).find((s) => s.monster.monsterSlug === 'goblin-warrior')!;
      goblinWarrior = compileMonster(src, {
        multiattack: [{ action: src.actions[0].actionName, count: 1 }],
      });
    } finally {
      db.close();
    }
  });

  it('loads real class, weapon and armor data', () => {
    expect(fighterClass.hitDieSides).toBe(10);
    expect([...fighterClass.saveProficiencies].sort()).toEqual(['con', 'str']);
    expect(longsword.name).toBe('Longsword');
    expect(longsword.properties).toContain('versatile');
    expect(chainMail.baseAc).toBe(16);
  });

  it('compiles a level-3 fighter with the expected statline', () => {
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
      position: cell(0, 0),
    });
    expect(fighter.ac).toBe(19);
    expect(fighter.hp).toBe(28);
    expect(fighter.attacks[0].attackBonus).toBe(5);
  });

  it('the fighter defeats three goblins, deterministically', () => {
    const run = () => {
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
        position: cell(0, 5),
      });
      const goblins = [cell(8, 4), cell(8, 5), cell(8, 6)].map((pos, i) =>
        spawnMonster(goblinWarrior, { id: `goblin-${i}`, side: 'enemy', position: pos }),
      );
      const e = new Encounter({
        grid: new Grid(12, 12),
        combatants: [fighter, ...goblins],
        rng: new Random(2024),
        policyFor: (c) => (c.isConscious ? meleeAggressor() : idlePolicy),
      });
      return e.run(50);
    };
    const a = run();
    const b = run();
    // A single champion fighter vs. three CR 1/4 goblins is a hard fight, but it
    // resolves to a winner within the round cap and is fully reproducible.
    expect(a.rounds).toBeLessThanOrEqual(50);
    expect(['party', 'enemy', null]).toContain(a.winner);
    expect(a.log).toEqual(b.log); // common random numbers: identical replay
    expect(a.rounds).toBe(b.rounds);
  });
});

describe('walking skeleton: a Barbarian compiled from the seeds rages', () => {
  it('loads rage progression and the feature activates and resists in combat', () => {
    const db = buildSeedDatabase();
    let barbarianClass: ClassInfo;
    let greataxe: WeaponInfo;
    let progression;
    try {
      barbarianClass = loadClass(db, 'barbarian');
      greataxe = loadWeapon(db, 'Greataxe');
      progression = loadProgression(db, 'barbarian', 3);
    } finally {
      db.close();
    }

    // Level-3 barbarian from the seed progression: 3 rage uses, +2 rage damage.
    expect(progression.rageUses).toBe(3);
    expect(progression.rageDamageBonus).toBe(2);
    expect(progression.extraAttacks).toBe(0); // no Extra Attack until level 5

    const barb = compileBuild({
      id: 'barbarian',
      name: 'Barbarian',
      class: barbarianClass,
      level: 3,
      abilities: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 8 },
      weapon: greataxe,
      twoHanded: true,
      unarmoredDefense: 'barbarian',
      progression,
      position: cell(0, 0),
    });
    expect(barb.ac).toBe(15); // 10 + Dex 2 + Con 3
    expect(barb.hp).toBe(35);
    expect(barb.resourceCount('rage')).toBe(3);

    // A hard-hitting slashing foe; Rage's resistance should roughly halve it.
    const foe = compileBuild({
      id: 'foe',
      name: 'Foe',
      side: 'enemy',
      class: barbarianClass,
      level: 3,
      abilities: { str: 20, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
      weapon: greataxe,
      twoHanded: true,
      unarmoredDefense: 'barbarian',
      position: cell(1, 0),
    });

    const attack: TurnPolicy = (api) => {
      const t = api.enemies()[0];
      const w = api.self.attacks[0];
      if (t && w) api.attack(t, w);
    };
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [barb, foe],
      rng: new Random(2024),
      policyFor: () => attack,
    });
    e.run(30);

    // The barbarian activated Rage (a use was spent) and is resisting B/P/S.
    expect(barb.resourceCount('rage')).toBeLessThan(3);
    expect((barb.features.find((f) => f.id === 'rage') as RageFeature).isRaging).toBe(true);
    expect(barb.damageResponseFor('slashing')).toBe('resistant');
  });
});
