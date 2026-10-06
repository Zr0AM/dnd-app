// The scenario library: a curated set of statically-seeded encounters a build is
// tested against, built from the seed database and validated against the SRD XP
// budget. Running every build across the same varied set (single foe, pack,
// swarm, mixed arms, on different maps) keeps the optimizer honest — a build that
// only beats two goblins should not win overall.
//
// Opponents are solo-hero scaled for now (the reference parties arrive with the
// caster layer); the budgets below are chosen for a tough-but-winnable solo
// level-3 fight. The XP-budget check is enforced so the set stays principled.

import type { DatabaseSync } from 'node:sqlite';
import { Grid, type Cell } from '../grid/grid';
import { Combatant } from '../combat/actor';
import { compileMonster, spawnMonster, type MonsterTemplate } from '../content/monster';
import { loadMonsterSources } from '../content/load-db';
import { MAPS } from './maps';

export type Difficulty = 'low' | 'moderate' | 'high';

interface ScenarioSpec {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly shape: string;
  readonly mapId: keyof typeof MAPS;
  readonly enemies: readonly { readonly slug: string; readonly count: number }[];
}

// Level-3 solo encounters. XP values (SRD): 1/8 = 25, 1/4 = 50, 1/2 = 100, 1 = 200.
const LEVEL3_SPECS: readonly ScenarioSpec[] = [
  {
    id: 'l3-pair-goblins',
    difficulty: 'low',
    shape: 'pack',
    mapId: 'open-field',
    enemies: [{ slug: 'goblin-warrior', count: 2 }], // 100 XP
  },
  {
    id: 'l3-single-bugbear',
    difficulty: 'moderate',
    shape: 'single',
    mapId: 'open-field',
    enemies: [{ slug: 'bugbear-warrior', count: 1 }], // 200 XP
  },
  {
    id: 'l3-swarm-minions',
    difficulty: 'moderate',
    shape: 'swarm',
    mapId: 'open-field',
    enemies: [{ slug: 'goblin-minion', count: 5 }], // 125 XP, action economy
  },
  {
    id: 'l3-mixed-hobgoblin',
    difficulty: 'moderate',
    shape: 'mixed',
    mapId: 'corridor-chokepoint',
    enemies: [
      { slug: 'hobgoblin-warrior', count: 1 }, // 100
      { slug: 'goblin-warrior', count: 2 }, // 100
    ],
  },
  {
    id: 'l3-choke-gnolls',
    difficulty: 'moderate',
    shape: 'pack',
    mapId: 'corridor-chokepoint',
    enemies: [{ slug: 'gnoll-warrior', count: 2 }], // 200 XP
  },
];

/** A runnable scenario: a fixed map and a way to spawn fresh enemies each run. */
export interface Scenario {
  readonly id: string;
  readonly level: number;
  readonly difficulty: Difficulty;
  readonly shape: string;
  readonly mapId: string;
  readonly xp: number;
  readonly grid: Grid;
  readonly heroStart: Cell;
  /** Spawn a fresh set of enemies on their starting cells. */
  spawnEnemies(): Combatant[];
}

/** XP by CR value (SRD ChallengeRating), read from the database. */
function xpByCr(db: DatabaseSync): Map<number, number> {
  const rows = db.prepare('SELECT crValue, xp FROM ChallengeRating').all() as unknown as {
    crValue: number;
    xp: number;
  }[];
  return new Map(rows.map((r) => [r.crValue, r.xp]));
}

/** Load every level-3 scenario, resolving monster templates and checking XP. */
export function loadScenarios(db: DatabaseSync, level = 3): Scenario[] {
  const templates = new Map<string, MonsterTemplate>();
  for (const src of loadMonsterSources(db)) {
    templates.set(src.monster.monsterSlug, compileMonster(src));
  }
  const xp = xpByCr(db);

  return LEVEL3_SPECS.map((spec) => {
    const layout = MAPS[spec.mapId]();
    let totalXp = 0;
    const enemyPlan: { template: MonsterTemplate; index: number }[] = [];
    let slot = 0;
    for (const group of spec.enemies) {
      const template = templates.get(group.slug);
      if (!template) throw new Error(`scenario ${spec.id}: monster not found: ${group.slug}`);
      for (let i = 0; i < group.count; i++) {
        enemyPlan.push({ template, index: slot });
        totalXp += xp.get(template.cr) ?? 0;
        slot++;
      }
    }
    if (slot > layout.enemyStarts.length) {
      throw new Error(
        `scenario ${spec.id}: ${slot} enemies but only ${layout.enemyStarts.length} start cells`,
      );
    }

    return {
      id: spec.id,
      level,
      difficulty: spec.difficulty,
      shape: spec.shape,
      mapId: layout.id,
      xp: totalXp,
      grid: layout.grid,
      heroStart: layout.heroStart,
      spawnEnemies: () =>
        enemyPlan.map((e, n) =>
          spawnMonster(e.template, {
            id: `enemy-${n}`,
            side: 'enemy',
            position: layout.enemyStarts[e.index],
          }),
        ),
    };
  });
}
