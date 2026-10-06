import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell, distanceFt } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant, type CombatantSpec } from './actor';
import { type AttackProfile } from './attack';
import { Encounter, idlePolicy, linePath, type CombatEvent, type TurnPolicy } from './encounter';

const sword: AttackProfile = {
  name: 'sword',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 8,
  damage: dice(1, 8, 4),
  damageType: 'slashing',
};

function hero(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'hero',
    name: 'Hero',
    side: 'party',
    level: 5,
    abilities: { str: 18, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 17,
    maxHp: 45,
    attacks: [sword],
    position: cell(0, 0),
    ...overrides,
  });
}

function dummy(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'dummy',
    name: 'Dummy',
    side: 'enemy',
    level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ac: 10,
    maxHp: 7,
    position: cell(1, 0),
    ...overrides,
  });
}

// Attacks the first reachable enemy; otherwise ends the turn.
const attackInReach: TurnPolicy = (api) => {
  const target = api.enemies()[0];
  if (!target) return;
  const weapon = api.self.attacks[0];
  if (weapon) api.attack(target, weapon);
};

describe('rollInitiative', () => {
  it('is deterministic for the same seed', () => {
    const mk = () =>
      new Encounter({ grid: new Grid(10, 10), combatants: [hero(), dummy()], rng: new Random(5) })
        .rollInitiative()
        .map((c) => c.id);
    expect(mk()).toEqual(mk());
  });

  it('orders by descending initiative total', () => {
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [hero(), dummy(), dummy({ id: 'd2', position: cell(2, 0) })],
      rng: new Random(9),
    });
    e.rollInitiative();
    const init = e.events.find(
      (x): x is Extract<CombatEvent, { kind: 'initiative' }> => x.kind === 'initiative',
    );
    const totals = init!.order.map((o) => o.total);
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1]).toBeGreaterThanOrEqual(totals[i]);
  });

  it('includes every combatant exactly once', () => {
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [hero(), dummy()],
      rng: new Random(1),
    });
    expect(
      e
        .rollInitiative()
        .map((c) => c.id)
        .sort(),
    ).toEqual(['dummy', 'hero']);
  });
});

describe('a basic fight', () => {
  it('the attacker defeats a passive dummy, and the party wins', () => {
    const d = dummy();
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [hero(), d],
      rng: new Random(42),
      policyFor: (c) => (c.side === 'party' ? attackInReach : idlePolicy),
    });
    const result = e.run();
    expect(result.winner).toBe('party');
    expect(d.isConscious).toBe(false);
    expect(result.rounds).toBeGreaterThanOrEqual(1);
    expect(e.events.some((x) => x.kind === 'attack' && x.hit)).toBe(true);
  });

  it('terminates when both sides fight (no infinite loop)', () => {
    const h = hero();
    const foe = new Combatant({
      id: 'foe',
      name: 'Foe',
      side: 'enemy',
      level: 3,
      abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 },
      ac: 14,
      maxHp: 30,
      attacks: [{ ...sword, name: 'claw', attackBonus: 5, damage: dice(1, 6, 3) }],
      position: cell(1, 0),
    });
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [h, foe],
      rng: new Random(7),
      policyFor: () => attackInReach,
    });
    const result = e.run(100);
    expect(result.rounds).toBeLessThanOrEqual(100);
    expect(e.isOver()).toBe(true);
    expect(['party', 'enemy', null]).toContain(result.winner);
  });

  it('is reproducible under common random numbers', () => {
    const play = () => {
      const e = new Encounter({
        grid: new Grid(10, 10),
        combatants: [hero(), dummy()],
        rng: new Random(123),
        policyFor: (c) => (c.side === 'party' ? attackInReach : idlePolicy),
      });
      return e.run();
    };
    const a = play();
    const b = play();
    expect(a.rounds).toBe(b.rounds);
    expect(a.winner).toBe(b.winner);
    expect(a.log).toEqual(b.log);
  });
});

describe('movement and opportunity attacks', () => {
  it('provokes an opportunity attack when leaving reach', () => {
    const mover = hero({ id: 'mover', position: cell(5, 5), attacks: [] });
    const guard = new Combatant({
      id: 'guard',
      name: 'Guard',
      side: 'enemy',
      level: 3,
      abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 8 },
      ac: 12,
      maxHp: 30,
      attacks: [sword],
      position: cell(6, 5), // adjacent to the mover
    });
    const flee: TurnPolicy = (api) => {
      if (api.self.id === 'mover') api.moveTo(cell(0, 5)); // run far away
    };
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [mover, guard],
      rng: new Random(3),
      policyFor: () => flee,
    });
    e.rollInitiative();
    e.runRound();
    expect(e.events.some((x) => x.kind === 'opportunity')).toBe(true);
  });

  it('a move costs double through difficult terrain and can be refused if too far', () => {
    const g = new Grid(12, 12);
    g.fillRect(1, 0, 1, 1, { difficult: true }); // cell (1,0) difficult
    const h = hero({ position: cell(0, 0), attacks: [] });
    let moved: boolean | undefined;
    const policy: TurnPolicy = (api) => {
      // speed 30 -> 6 normal steps, but moving 6 straight with one difficult cell costs 35 > 30.
      if (api.self.id === 'hero') moved = api.moveTo(cell(6, 0));
    };
    const e = new Encounter({
      grid: g,
      combatants: [h, dummy({ position: cell(11, 11) })],
      rng: new Random(1),
      policyFor: (c) => (c.id === 'hero' ? policy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    expect(moved).toBe(false);
    expect(h.position).toEqual(cell(0, 0));
  });
});

describe('death saves in the loop', () => {
  it('a dying combatant rolls a death save at the start of its turn', () => {
    const downed = hero({ id: 'downed', attacks: [] });
    downed.takeDamage(45); // to 0, dying
    const ally = hero({ id: 'ally', position: cell(0, 1) }); // keeps the party in the fight
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [downed, ally, dummy()],
      rng: new Random(11),
      policyFor: () => idlePolicy,
    });
    e.rollInitiative();
    e.runRound();
    expect(e.events.some((x) => x.kind === 'deathSave' && x.id === 'downed')).toBe(true);
  });
});

describe('linePath', () => {
  it('steps one cell at a time to the destination', () => {
    expect(linePath(cell(0, 0), cell(3, 2))).toEqual([
      cell(0, 0),
      cell(1, 1),
      cell(2, 2),
      cell(3, 2),
    ]);
  });

  it('length is Chebyshev distance plus one', () => {
    expect(linePath(cell(0, 0), cell(0, 0))).toHaveLength(1);
    expect(linePath(cell(0, 0), cell(5, 0))).toHaveLength(6);
  });
});

describe('distance sanity for reach', () => {
  it('adjacent cells are 5 ft apart', () => {
    expect(distanceFt(cell(0, 0), cell(1, 0))).toBe(5);
  });
});
