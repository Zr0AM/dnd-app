import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { Combatant, type CombatantSpec } from './actor';
import { Encounter, idlePolicy, type CombatEvent } from './encounter';
import { tacticalPolicy } from '../ai/policy';
import { fireBolt, fireball } from '../content/spells';

function sorcerer(resources: CombatantSpec['resources']): Combatant {
  return new Combatant({
    id: 'sorc',
    name: 'Sorcerer',
    side: 'party',
    level: 5,
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 },
    ac: 13,
    maxHp: 44,
    resources,
    spellcasting: {
      ability: 'cha',
      slots: [
        { level: 1, count: 4 },
        { level: 2, count: 3 },
        { level: 3, count: 2 },
      ],
      cantrips: [fireBolt],
      spells: [fireball],
    },
    position: cell(0, 0),
  });
}

function dummy(id: string, pos: ReturnType<typeof cell>): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'enemy',
    level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ac: 12,
    maxHp: 120, // survives a round so we can see both casts
    position: pos,
  });
}

function sorcererCasts(e: Encounter): Extract<CombatEvent, { kind: 'spell' }>[] {
  return e.events.filter(
    (x): x is Extract<CombatEvent, { kind: 'spell' }> => x.kind === 'spell' && x.caster === 'sorc',
  );
}

describe('Quickened Spell (Sorcerer Metamagic)', () => {
  it('casts a second spell as a bonus action, spending Sorcery Points', () => {
    const sorc = sorcerer([{ id: 'sorcery', max: 5, rechargeLong: 'all' }]);
    const foe = dummy('foe', cell(3, 0)); // within Fireball/Fire Bolt range
    const e = new Encounter({
      grid: new Grid(20, 20),
      combatants: [sorc, foe],
      rng: new Random(2024),
      policyFor: (c) => (c === sorc ? tacticalPolicy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    const casts = sorcererCasts(e);
    // The action spell plus a quickened cantrip = two casts in one turn.
    expect(casts.length).toBe(2);
    expect(sorc.resourceCount('sorcery')).toBe(3); // 5 - 2 for the quicken
  });

  it('casts only once a turn with no Sorcery Points', () => {
    const sorc = sorcerer([{ id: 'sorcery', max: 0 }]);
    const foe = dummy('foe', cell(3, 0));
    const e = new Encounter({
      grid: new Grid(20, 20),
      combatants: [sorc, foe],
      rng: new Random(2024),
      policyFor: (c) => (c === sorc ? tacticalPolicy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    expect(sorcererCasts(e).length).toBe(1); // no quicken without points
  });
});
