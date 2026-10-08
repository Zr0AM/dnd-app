import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant, type CombatantSpec } from './actor';
import { Encounter, idlePolicy, type CombatEvent, type TurnPolicy } from './encounter';
import type { AttackProfile } from './attack';

const claw: AttackProfile = {
  name: 'Claw',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 20, // always hits, for a deterministic demonstration
  damage: dice(2, 6, 4),
  damageType: 'slashing',
};

function boss(over: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'boss',
    name: 'Boss',
    side: 'enemy',
    level: 1,
    abilities: { str: 20, dex: 10, con: 18, int: 10, wis: 12, cha: 14 },
    ac: 18,
    maxHp: 300,
    attacks: [claw],
    legendaryActions: 3,
    position: cell(5, 5),
    ...over,
  });
}

function hero(id: string, pos: ReturnType<typeof cell>): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'party',
    level: 11,
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 16,
    maxHp: 90,
    attacks: [
      {
        name: 'sword',
        kind: 'melee',
        reachFt: 5,
        attackBonus: 8,
        damage: dice(1, 8, 3),
        damageType: 'slashing',
      },
    ],
    position: pos,
  });
}

const legendaryEvents = (e: Encounter) =>
  e.events.filter((x): x is Extract<CombatEvent, { kind: 'legendary' }> => x.kind === 'legendary');

describe('legendary actions', () => {
  it('a boss attacks between other creatures’ turns, up to its budget each round', () => {
    // Two adjacent heroes so the boss always has a reachable target.
    const b = boss();
    const heroes = [hero('h0', cell(4, 5)), hero('h1', cell(6, 5))];
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [...heroes, b],
      rng: new Random(5),
      // Heroes stand and swing; the boss's own policy does nothing, so every
      // legendary event comes from the between-turns legendary action path.
      policyFor: (c): TurnPolicy =>
        c.side === 'party'
          ? (api) => {
              const t = api.enemies()[0];
              if (t) api.attack(t, api.self.attacks[0]);
            }
          : idlePolicy,
    });
    e.rollInitiative();
    e.runRound();
    const firstRound = legendaryEvents(e);
    // Two other creatures act per round, so the boss gets at most 2 legendary
    // actions that round (one at the end of each), and never more than its budget.
    expect(firstRound.length).toBeGreaterThan(0);
    expect(firstRound.length).toBeLessThanOrEqual(3);
    expect(firstRound.every((x) => x.source === 'boss')).toBe(true);

    e.runRound();
    // The budget refreshes each round, so more legendary actions follow.
    expect(legendaryEvents(e).length).toBeGreaterThan(firstRound.length);
  });

  it('an ordinary monster takes no legendary actions', () => {
    const b = boss({ legendaryActions: 0 });
    const heroes = [hero('h0', cell(4, 5)), hero('h1', cell(6, 5))];
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [...heroes, b],
      rng: new Random(5),
      policyFor: () => idlePolicy,
    });
    e.rollInitiative();
    e.runRound();
    expect(legendaryEvents(e)).toHaveLength(0);
  });

  it('refreshes its legendary budget at the start of its own turn', () => {
    const b = boss();
    b.spendLegendary();
    b.spendLegendary();
    expect(b.legendaryRemaining).toBe(1);
    b.refreshLegendary();
    expect(b.legendaryRemaining).toBe(3);
  });
});
