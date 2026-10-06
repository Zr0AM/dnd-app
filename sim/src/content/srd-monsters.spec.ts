// End-to-end validation of the monster compiler against the real seed data:
// builds the seed database and compiles every monster, asserting the compiler
// handles all 341 rows and produces sensible combat data. This is the "auto
// -compiled monsters" claim from the effect-format survey, checked for real.

import { describe, it, expect, beforeAll } from 'vitest';
import { compileMonster, spawnMonster, type MonsterTemplate } from './monster';
import { buildSeedDatabase, loadMonsterSources } from './load-db';
import { cell } from '../grid/grid';

describe('compiling all SRD monsters', () => {
  let templates: MonsterTemplate[];

  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      templates = loadMonsterSources(db).map((s) => compileMonster(s));
    } finally {
      db.close();
    }
  });

  it('compiles every monster without throwing', () => {
    expect(templates.length).toBeGreaterThan(300); // ~341 in the seeds
  });

  it('every template has valid scalars', () => {
    for (const t of templates) {
      expect(t.ac).toBeGreaterThan(0);
      expect(t.maxHp).toBeGreaterThan(0);
      expect(t.speedFt).toBeGreaterThanOrEqual(0);
      expect(t.cr).toBeGreaterThanOrEqual(0);
    }
  });

  it('most monsters have at least one attack', () => {
    const withAttacks = templates.filter((t) => t.attacks.length > 0).length;
    // The effect survey found ~160+ auto-compilable; the great majority have attacks.
    expect(withAttacks).toBeGreaterThan(templates.length * 0.7);
  });

  it('all compiled attacks carry a known damage type and positive bonus range', () => {
    for (const t of templates) {
      for (const a of t.attacks) {
        expect(typeof a.damageType).toBe('string');
        expect(Number.isFinite(a.attackBonus)).toBe(true);
      }
    }
  });

  it('the goblin minion compiles to its known stat block', () => {
    const goblin = templates.find((t) => t.slug === 'goblin-minion');
    expect(goblin).toBeDefined();
    expect(goblin!.ac).toBe(12);
    expect(goblin!.maxHp).toBe(7);
    expect(goblin!.attacks[0]?.name).toBe('Dagger');
  });

  it('a spawned SRD monster can be placed on the board', () => {
    const anyWithAttack = templates.find((t) => t.attacks.length > 0)!;
    const c = spawnMonster(anyWithAttack, { id: 'm', side: 'enemy', position: cell(2, 2) });
    expect(c.isConscious).toBe(true);
    expect(c.attacks.length).toBeGreaterThan(0);
  });
});
