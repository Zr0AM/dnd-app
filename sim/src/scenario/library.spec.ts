import { describe, it, expect, beforeAll } from 'vitest';
import { buildSeedDatabase } from '../content/load-db';
import { loadScenarios, type Scenario } from './library';
import { corridorChokepoint, openField, MAPS } from './maps';
import { cell } from '../grid/grid';

describe('maps', () => {
  it('open-field is passable with distinct start zones', () => {
    const m = openField();
    expect(m.grid.isPassable(m.heroStart)).toBe(true);
    for (const e of m.enemyStarts) expect(m.grid.isPassable(e)).toBe(true);
    expect(m.heroStart).not.toEqual(m.enemyStarts[0]);
  });

  it('corridor has a wall with a one-cell doorway', () => {
    const m = corridorChokepoint();
    expect(m.grid.isWall(cell(8, 0))).toBe(true);
    expect(m.grid.isWall(cell(8, 4))).toBe(false); // the doorway
    expect(m.grid.isPassable(m.heroStart)).toBe(true);
  });

  it('every registered map builds', () => {
    for (const build of Object.values(MAPS)) expect(build().grid).toBeDefined();
  });
});

describe('scenario library', () => {
  let scenarios: Scenario[];
  let db: ReturnType<typeof buildSeedDatabase>;

  beforeAll(() => {
    db = buildSeedDatabase();
    scenarios = loadScenarios(db, 3);
    db.close();
  });

  it('loads several level-3 scenarios of varied shapes', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(5);
    const shapes = new Set(scenarios.map((s) => s.shape));
    expect(shapes.has('single')).toBe(true);
    expect(shapes.has('swarm')).toBe(true);
    expect(shapes.has('pack')).toBe(true);
  });

  it('every scenario has a sane XP total and enough start cells', () => {
    for (const s of scenarios) {
      expect(s.xp).toBeGreaterThan(0);
      // Level-3 solo encounters sit in a tough-but-winnable band.
      expect(s.xp).toBeLessThanOrEqual(300);
      const enemies = s.spawnEnemies();
      expect(enemies.length).toBeGreaterThan(0);
      for (const e of enemies) expect(s.grid.isPassable(e.position)).toBe(true);
    }
  });

  it('spawnEnemies produces fresh, full-HP combatants each call', () => {
    const s = scenarios[0];
    const a = s.spawnEnemies();
    a[0].takeDamage(1000);
    const b = s.spawnEnemies();
    expect(b[0].isConscious).toBe(true); // a fresh set, not the damaged one
    expect(b[0].hp).toBe(b[0].maxHp);
  });

  it('enemies are placed on their map start cells', () => {
    const s = scenarios.find((x) => x.mapId === 'corridor-chokepoint')!;
    for (const e of s.spawnEnemies()) {
      expect(s.grid.inBounds(e.position)).toBe(true);
      expect(s.grid.isWall(e.position)).toBe(false);
    }
  });
});
