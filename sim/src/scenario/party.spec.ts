import { describe, it, expect, beforeAll } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { buildSeedDatabase } from '../content/load-db';
import { loadFillers, type Filler, type Role } from '../content/fillers';
import { assembleParty, loadPartyScenarios, R3, R4, type PartyScenario } from './party';
import { Combatant } from '../combat/actor';
import { cell } from '../grid/grid';

function hero(): Combatant {
  return new Combatant({
    id: 'hero',
    name: 'Hero',
    side: 'party',
    level: 5,
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 18,
    maxHp: 45,
    position: cell(0, 0),
  });
}

describe('fillers', () => {
  let fillers: Partial<Record<Role, Filler>>;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      fillers = loadFillers(db, 5);
    } finally {
      db.close();
    }
  });

  it('builds the available roles', () => {
    expect(fillers.tank).toBeDefined();
    expect(fillers.healer).toBeDefined();
    expect(fillers.controller).toBeDefined();
    expect(fillers.burst).toBeDefined();
  });

  it('the healer is a spellcaster with healing', () => {
    const healer = fillers.healer!.make('h', 'party', cell(0, 0));
    expect(healer.spellAbility).toBe('wis');
    expect(healer.spells.some((s) => s.id === 'cure-wounds')).toBe(true);
  });

  it('the tank is a durable martial', () => {
    const tank = fillers.tank!.make('t', 'party', cell(0, 0));
    expect(tank.ac).toBeGreaterThanOrEqual(18); // chain mail + shield + Defense
    expect(tank.attacks.length).toBe(1);
  });
});

describe('assembleParty', () => {
  let fillers: Partial<Record<Role, Filler>>;
  beforeAll(() => {
    const db = buildSeedDatabase();
    try {
      fillers = loadFillers(db, 5);
    } finally {
      db.close();
    }
  });

  it('puts the hero in its role slot and fills the rest', () => {
    const h = hero();
    const party = assembleParty(
      fillers,
      R4,
      h,
      'tank',
      R4.roles.map((_, i) => cell(0, i)),
    );
    expect(party).toHaveLength(4);
    expect(party.filter((c) => c.id === 'hero')).toHaveLength(1);
    // The hero occupies the tank slot (index 0 in R4.roles).
    expect(party[0].id).toBe('hero');
  });

  it('a hero without a matching role takes the flex slot', () => {
    const h = hero();
    // R3 has no "burst" role; the hero goes to the flex (controller) slot.
    const party = assembleParty(
      fillers,
      R3,
      h,
      'burst',
      R3.roles.map((_, i) => cell(0, i)),
    );
    expect(party.filter((c) => c.id === 'hero')).toHaveLength(1);
    const flexIndex = R3.roles.indexOf(R3.flex);
    expect(party[flexIndex].id).toBe('hero');
  });
});

describe('party scenarios', () => {
  let db: DatabaseSync;
  beforeAll(() => {
    db = buildSeedDatabase();
  });

  it('scale enemy counts with party size', () => {
    const small = loadPartyScenarios(db, 3);
    const large = loadPartyScenarios(db, 4);
    const hordeSmall = small.find((s) => s.id === 'horde')!.spawnEnemies().length;
    const hordeLarge = large.find((s) => s.id === 'horde')!.spawnEnemies().length;
    expect(hordeLarge).toBeGreaterThan(hordeSmall);
  });

  it('spawns fresh enemies on passable cells', () => {
    const s: PartyScenario = loadPartyScenarios(db, 4)[0];
    for (const e of s.spawnEnemies()) {
      expect(s.grid.isPassable(e.position)).toBe(true);
      expect(e.isConscious).toBe(true);
    }
  });
});
