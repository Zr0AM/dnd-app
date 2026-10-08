import { describe, it, expect, beforeAll } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { buildSeedDatabase, loadClass, loadWeapon } from './load-db';
import { loadSpellSlots } from './load-db';
import { compileCaster } from './caster';
import { fireBolt, fireball, scorchingRay } from './spells';
import { Encounter, idlePolicy } from '../combat/encounter';
import { tacticalPolicy } from '../ai/policy';
import { spawnMonster, compileMonster } from './monster';
import { loadMonsterSources } from './load-db';
import type { DatabaseSync } from 'node:sqlite';

describe('compileCaster', () => {
  let db: DatabaseSync;
  beforeAll(() => {
    db = buildSeedDatabase();
  });

  it('builds a level-5 wizard with slots and a save DC', () => {
    const wizard = compileCaster({
      name: 'Wizard',
      class: loadClass(db, 'wizard'),
      level: 5,
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
      weapon: loadWeapon(db, 'Dagger'),
      armor: null,
      shield: false,
      spellAbility: 'int',
      cantrips: [fireBolt],
      spells: [scorchingRay, fireball],
      slots: loadSpellSlots(db, 'wizard', 5),
    });
    expect(wizard.ac).toBe(12); // 10 + Dex 2, unarmored
    expect(wizard.hp).toBe(6 + 2 + 4 * (4 + 2)); // d6, Con +2, L5 = 32
    expect(wizard.spellSaveDc()).toBe(8 + 3 + 2); // prof 3, Int +2 = 13
    expect(wizard.slotCount(3)).toBe(2);
    expect(wizard.spells.length).toBe(2);
  });

  it('a wizard can win a fight by casting', () => {
    const wizard = compileCaster({
      id: 'wizard',
      name: 'Wizard',
      class: loadClass(db, 'wizard'),
      level: 5,
      abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
      weapon: loadWeapon(db, 'Dagger'),
      armor: null,
      shield: false,
      spellAbility: 'int',
      cantrips: [fireBolt],
      spells: [scorchingRay, fireball],
      slots: loadSpellSlots(db, 'wizard', 5),
      position: cell(0, 6),
    });
    const src = loadMonsterSources(db).find((s) => s.monster.monsterSlug === 'goblin-warrior')!;
    const template = compileMonster(src);
    const goblins = [cell(10, 5), cell(10, 6), cell(10, 7)].map((p, i) =>
      spawnMonster(template, { id: `g${i}`, side: 'enemy', position: p }),
    );
    const e = new Encounter({
      grid: new Grid(16, 12),
      combatants: [wizard, ...goblins],
      rng: new Random(2024),
      policyFor: (c) => (c.id === 'wizard' ? tacticalPolicy : idlePolicy),
    });
    const res = e.run(20);
    expect(res.winner).toBe('party');
    // The wizard dealt its damage through spells (logged as spell events).
    expect(e.events.some((x) => x.kind === 'spell' && x.caster === 'wizard' && x.damage > 0)).toBe(
      true,
    );
  });
});
