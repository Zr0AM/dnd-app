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
import { multiattackFor } from '../content/multiattack';
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

// Level-11 solo encounters: CR-appropriate single foes and small packs tuned for a
// tough-but-winnable fight for ONE level-11 hero (the solo evaluation pits a lone
// hero against them — party-scale hordes are the reference-party harness's job).
// Breath weapons and legendary actions arrive in a later Phase 7 slice.
const LEVEL11_SPECS: readonly ScenarioSpec[] = [
  {
    id: 'l11-single-troll',
    difficulty: 'moderate',
    shape: 'single',
    mapId: 'open-field',
    enemies: [{ slug: 'troll', count: 1 }], // CR 5, Rend x3
  },
  {
    id: 'l11-pack-owlbears',
    difficulty: 'high',
    shape: 'pack',
    mapId: 'open-field',
    enemies: [{ slug: 'owlbear', count: 2 }], // CR 3 each, Rend x2
  },
  {
    id: 'l11-swarm-wolves',
    difficulty: 'moderate',
    shape: 'swarm',
    mapId: 'corridor-chokepoint',
    enemies: [{ slug: 'winter-wolf', count: 3 }], // CR 3 each, action economy
  },
  {
    id: 'l11-mixed-troll-wolf',
    difficulty: 'high',
    shape: 'mixed',
    mapId: 'corridor-chokepoint',
    enemies: [
      { slug: 'troll', count: 1 }, // CR 5
      { slug: 'winter-wolf', count: 1 }, // CR 3
    ],
  },
];

// Level-17 solo encounters: CR 7-10 single foes and packs for ONE level-17 hero.
const LEVEL17_SPECS: readonly ScenarioSpec[] = [
  {
    id: 'l17-single-hezrou',
    difficulty: 'moderate',
    shape: 'single',
    mapId: 'open-field',
    enemies: [{ slug: 'hezrou', count: 1 }], // CR 8
  },
  {
    id: 'l17-elite-trex',
    difficulty: 'high',
    shape: 'single',
    mapId: 'open-field',
    enemies: [{ slug: 'tyrannosaurus-rex', count: 1 }], // CR 8, Bite + Tail
  },
  {
    id: 'l17-pack-trolls',
    difficulty: 'high',
    shape: 'pack',
    mapId: 'open-field',
    enemies: [{ slug: 'troll', count: 2 }], // CR 5 each, Rend x3
  },
  {
    id: 'l17-mixed-troll-owlbear',
    difficulty: 'high',
    shape: 'mixed',
    mapId: 'corridor-chokepoint',
    enemies: [
      { slug: 'troll', count: 1 }, // CR 5
      { slug: 'owlbear', count: 1 }, // CR 3
    ],
  },
];

/** The scenario specs for a hero of the given level (nearest checkpoint at or below). */
function specsForLevel(level: number): readonly ScenarioSpec[] {
  if (level >= 17) return LEVEL17_SPECS;
  if (level >= 11) return LEVEL11_SPECS;
  return LEVEL3_SPECS;
}

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
    templates.set(
      src.monster.monsterSlug,
      compileMonster(src, multiattackFor(src.monster.monsterSlug)),
    );
  }
  const xp = xpByCr(db);

  return specsForLevel(level).map((spec) => {
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
