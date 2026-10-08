// The reference-party harness: party templates (R6, R4, R3), assembly with the
// hero substituted into its role slot, and party-scaled encounters. This turns the
// solo-hero evaluation into the party simulation the plan describes, so support
// roles (a healer keeping allies up, a buffer boosting their attacks) have signal.
//
// All three templates use the full frozen filler set. Encounter sizing scales with
// the party and is tuned to be a hard-but-winnable fight rather than matched to the
// exact XP budget (a party-harness v1 choice).

import type { DatabaseSync } from 'node:sqlite';
import { Grid, cell, type Cell } from '../grid/grid';
import { Combatant } from '../combat/actor';
import { compileMonster, spawnMonster, type MonsterTemplate } from '../content/monster';
import { loadMonsterSources } from '../content/load-db';
import { multiattackFor } from '../content/multiattack';
import { loadFillers, type Filler, type Role } from '../content/fillers';

/** A party template: the roles present, in a fixed order. */
export interface PartyTemplate {
  readonly id: string;
  readonly roles: readonly Role[];
  /** The role a hero without a matching slot replaces instead. */
  readonly flex: Role;
  /** Report weight for aggregation (plan: R6/R4/R3 = 2:2:1). */
  readonly weight: number;
}

export const R6: PartyTemplate = {
  // The full six-role party.
  id: 'R6',
  roles: ['tank', 'sustained-dps', 'burst', 'healer', 'controller', 'buffer'],
  flex: 'burst',
  weight: 2,
};

export const R4: PartyTemplate = {
  id: 'R4',
  roles: ['tank', 'burst', 'healer', 'controller'],
  flex: 'burst',
  weight: 2,
};

export const R3: PartyTemplate = {
  id: 'R3',
  roles: ['tank', 'healer', 'controller'],
  flex: 'controller',
  weight: 1,
};

export const PARTY_TEMPLATES: readonly PartyTemplate[] = [R6, R4, R3];

/** Party deployment cells (left side) and enemy cells (right side). */
function partyMap(): { grid: Grid; partyCells: Cell[]; enemyCells: Cell[] } {
  const grid = new Grid(22, 14);
  const partyCells = [cell(1, 5), cell(1, 7), cell(1, 9), cell(2, 6), cell(2, 8), cell(2, 4)];
  const enemyCells: Cell[] = [];
  for (let x = 18; x <= 20; x++) for (let y = 2; y <= 11; y += 1) enemyCells.push(cell(x, y));
  return { grid, partyCells, enemyCells };
}

/**
 * Assemble a party: the hero fills the slot for `heroRole` (or the template's flex
 * slot if the template lacks that role), and fillers fill the rest.
 */
export function assembleParty(
  fillers: Partial<Record<Role, Filler>>,
  template: PartyTemplate,
  hero: Combatant,
  heroRole: Role,
  partyCells: readonly Cell[],
): Combatant[] {
  const heroSlot = template.roles.includes(heroRole) ? heroRole : template.flex;
  const party: Combatant[] = [];
  let heroPlaced = false;
  template.roles.forEach((role, i) => {
    const position = partyCells[i] ?? partyCells[partyCells.length - 1];
    // The hero takes the first slot matching its role; duplicate role slots (e.g.
    // R6's two striker slots) are filled normally, with ids unique per slot index.
    if (role === heroSlot && !heroPlaced) {
      hero.position = position;
      party.push(hero);
      heroPlaced = true;
    } else {
      const filler = fillers[role];
      if (!filler) throw new Error(`no filler for role ${role}`);
      party.push(filler.make(`ally-${role}-${i}`, 'party', position));
    }
  });
  return party;
}

/** A runnable party scenario: a map and a fresh enemy spawn scaled to party size. */
export interface PartyScenario {
  readonly id: string;
  readonly partySize: number;
  readonly grid: Grid;
  readonly partyCells: readonly Cell[];
  spawnEnemies(): Combatant[];
}

interface PartyEncounterSpec {
  readonly id: string;
  /**
   * Enemy groups. `perMember` scales the count with party size; `count` is a fixed
   * number (a single boss). Both are capped by the map's enemy cells.
   */
  readonly enemies: readonly {
    readonly slug: string;
    readonly perMember?: number;
    readonly count?: number;
  }[];
}

// Level-5 party encounters: hordes of weak foes so allies take real damage and a
// healer has work to do (the support axis needs that pressure to have signal).
const PARTY_ENCOUNTERS_L5: readonly PartyEncounterSpec[] = [
  { id: 'horde', enemies: [{ slug: 'goblin-warrior', perMember: 5 }] },
  {
    id: 'mixed',
    enemies: [
      { slug: 'bugbear-warrior', perMember: 2 },
      { slug: 'goblin-warrior', perMember: 2 },
    ],
  },
];

// Level-11 party encounters: a legendary dragon boss (which now acts between the
// party's turns) and a pack of CR-5 brutes.
const PARTY_ENCOUNTERS_L11: readonly PartyEncounterSpec[] = [
  {
    // A legendary boss plus a couple of fixed adds (fixed, so the boss fight does
    // not balloon with party size); the pack scales with the party.
    id: 'boss-young-dragon',
    enemies: [
      { slug: 'young-red-dragon', count: 1 }, // CR 10, legendary + Rend x3
      { slug: 'winter-wolf', count: 2 }, // adds
    ],
  },
  { id: 'troll-pack', enemies: [{ slug: 'troll', perMember: 1 }] }, // CR 5 each
];

// Level-17 party encounters: an adult dragon boss and a fire-giant pack.
const PARTY_ENCOUNTERS_L17: readonly PartyEncounterSpec[] = [
  {
    id: 'boss-adult-dragon',
    enemies: [
      { slug: 'adult-red-dragon', count: 1 }, // CR 17, legendary + Rend x3
      { slug: 'troll', count: 2 }, // adds
    ],
  },
  {
    id: 'giant-pack',
    enemies: [
      { slug: 'fire-giant', count: 1 },
      { slug: 'troll', perMember: 1 },
    ],
  },
];

/** Party encounters for a party at the given level (nearest checkpoint at or below). */
function partyEncountersForLevel(level: number): readonly PartyEncounterSpec[] {
  if (level >= 17) return PARTY_ENCOUNTERS_L17;
  if (level >= 11) return PARTY_ENCOUNTERS_L11;
  return PARTY_ENCOUNTERS_L5;
}

/** Load party scenarios for a party of `partySize` at `level`. */
export function loadPartyScenarios(
  db: DatabaseSync,
  partySize: number,
  level = 5,
): PartyScenario[] {
  const templates = new Map<string, MonsterTemplate>();
  for (const src of loadMonsterSources(db))
    templates.set(
      src.monster.monsterSlug,
      compileMonster(src, multiattackFor(src.monster.monsterSlug)),
    );
  const { grid, partyCells, enemyCells } = partyMap();

  return partyEncountersForLevel(level).map((spec) => {
    const plan: MonsterTemplate[] = [];
    for (const group of spec.enemies) {
      const template = templates.get(group.slug);
      if (!template) throw new Error(`party scenario ${spec.id}: monster not found: ${group.slug}`);
      const n = (group.perMember ?? 0) * partySize + (group.count ?? 0);
      for (let i = 0; i < n; i++) plan.push(template);
    }
    const capped = plan.slice(0, enemyCells.length);
    return {
      id: spec.id,
      partySize,
      grid,
      partyCells,
      spawnEnemies: () =>
        capped.map((template, n) =>
          spawnMonster(template, { id: `enemy-${n}`, side: 'enemy', position: enemyCells[n] }),
        ),
    };
  });
}

export { loadFillers };
