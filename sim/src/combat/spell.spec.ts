import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { meanDice } from '../dice/dice';
import { Combatant, type CombatantSpec } from './actor';
import { Encounter, idlePolicy, type CombatEvent, type TurnPolicy } from './encounter';
import { cantripDice, raysAt, upcastDice, type Spell } from './spell';
import { fireBolt, fireball, sacredFlame, scorchingRay } from '../content/spells';

describe('spell scaling', () => {
  it('cantrips gain a die at 5, 11, 17', () => {
    const d = cantripDice(1, 10);
    expect(meanDice(d(0, 1))).toBe(meanDice({ count: 1, sides: 10, bonus: 0 }));
    expect(meanDice(d(0, 5))).toBe(meanDice({ count: 2, sides: 10, bonus: 0 }));
    expect(meanDice(d(0, 11))).toBe(meanDice({ count: 3, sides: 10, bonus: 0 }));
    expect(meanDice(d(0, 17))).toBe(meanDice({ count: 4, sides: 10, bonus: 0 }));
  });

  it('upcast dice add per slot above base', () => {
    const d = upcastDice(3, 8, 6); // Fireball: 8d6 + 1d6 per slot over 3
    expect(d(3, 5).count).toBe(8);
    expect(d(5, 5).count).toBe(10);
  });

  it('rays scale with upcast', () => {
    expect(raysAt(scorchingRay.kind as never, 2, 2)).toBe(3);
    expect(raysAt(scorchingRay.kind as never, 4, 2)).toBe(5); // +1 ray per slot over 2
  });
});

function wizard(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'wiz',
    name: 'Wizard',
    side: 'party',
    level: 5,
    abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 },
    ac: 13,
    maxHp: 30,
    spellcasting: {
      ability: 'int',
      slots: [
        { level: 1, count: 4 },
        { level: 2, count: 3 },
        { level: 3, count: 2 },
      ],
      cantrips: [fireBolt, sacredFlame],
      spells: [scorchingRay, fireball],
    },
    position: cell(0, 0),
    ...overrides,
  });
}

function dummy(
  id: string,
  pos: ReturnType<typeof cell>,
  over: Partial<CombatantSpec> = {},
): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'enemy',
    level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ac: 10,
    maxHp: 12,
    position: pos,
    ...over,
  });
}

describe('spellcasting stats', () => {
  it('computes save DC and spell attack from the ability', () => {
    const w = wizard();
    expect(w.spellAttackBonus()).toBe(3 + 4); // prof 3 (L5) + Int 4
    expect(w.spellSaveDc()).toBe(8 + 3 + 4); // 15
  });

  it('tracks and spends slots', () => {
    const w = wizard();
    expect(w.slotCount(3)).toBe(2);
    expect(w.spendSlot(3)).toBe(true);
    expect(w.slotCount(3)).toBe(1);
    expect(w.availableSlotLevels()).toEqual([1, 2, 3]);
  });
});

function castOnce(
  caster: Combatant,
  spell: Spell,
  target: Combatant,
  targets: Combatant[],
  slot?: number,
) {
  const policy: TurnPolicy = (api) => {
    if (api.self === caster) api.castSpell(spell, target, slot);
  };
  const e = new Encounter({
    grid: new Grid(20, 20),
    combatants: [caster, ...targets],
    rng: new Random(2024),
    policyFor: (c) => (c === caster ? policy : idlePolicy),
  });
  e.rollInitiative();
  e.runRound();
  return e.events.find((x): x is Extract<CombatEvent, { kind: 'spell' }> => x.kind === 'spell');
}

describe('casting in the engine', () => {
  it('a cantrip deals damage and costs no slot', () => {
    const w = wizard();
    const d = dummy('d', cell(2, 0)); // 10 ft away, in Fire Bolt range
    const ev = castOnce(w, fireBolt, d, [d]);
    expect(ev?.spell).toBe('Fire Bolt');
    expect(ev?.slotLevel).toBe(0);
    expect(w.slotCount(1)).toBe(4); // unchanged
  });

  it('a leveled spell spends a slot of its level', () => {
    const w = wizard();
    const d = dummy('d', cell(3, 0));
    castOnce(w, fireball, d, [d], 3);
    expect(w.slotCount(3)).toBe(1);
  });

  it('Fireball hits every enemy in its radius with one shared roll', () => {
    const w = wizard();
    // Three dummies clustered within 20 ft of the aim point.
    const a = dummy('a', cell(10, 0));
    const b = dummy('b', cell(10, 1));
    const c = dummy('c', cell(11, 0));
    const ev = castOnce(w, fireball, a, [a, b, c], 3);
    expect(ev?.targets).toBe(3); // all three caught
    expect(ev?.damage).toBeGreaterThan(0);
  });

  it('refuses to cast with no slot of the required level', () => {
    const w = wizard();
    w.spendSlot(3);
    w.spendSlot(3); // out of level-3 slots
    const d = dummy('d', cell(3, 0));
    const policy: TurnPolicy = (api) => {
      if (api.self === w) {
        const dmg = api.castSpell(fireball, d, 3);
        expect(dmg).toBeNull();
      }
    };
    const e = new Encounter({
      grid: new Grid(20, 20),
      combatants: [w, d],
      rng: new Random(1),
      policyFor: (cc) => (cc === w ? policy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
  });
});
