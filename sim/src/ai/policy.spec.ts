import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant, type CombatantSpec } from '../combat/actor';
import { Encounter, idlePolicy, type CombatEvent } from '../combat/encounter';
import type { AttackProfile } from '../combat/attack';
import {
  DEFAULT_WEIGHTS,
  makeTacticalPolicy,
  primaryWeapon,
  scoreTarget,
  tacticalPolicy,
  threatOf,
  weaponAverageDamage,
} from './policy';

const sword: AttackProfile = {
  name: 'sword',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 8,
  damage: dice(1, 8, 4),
  damageType: 'slashing',
};
const bow: AttackProfile = {
  name: 'bow',
  kind: 'ranged',
  rangeFt: 80,
  rangeLongFt: 320,
  attackBonus: 8,
  damage: dice(1, 6, 3),
  damageType: 'piercing',
};

function mk(overrides: Partial<CombatantSpec>): Combatant {
  return new Combatant({
    id: 'c',
    name: 'C',
    side: 'party',
    level: 3,
    abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 15,
    maxHp: 30,
    ...overrides,
  });
}

function attackEvents(e: Encounter, attacker: string): Extract<CombatEvent, { kind: 'attack' }>[] {
  return e.events.filter(
    (x): x is Extract<CombatEvent, { kind: 'attack' }> =>
      x.kind === 'attack' && x.attacker === attacker,
  );
}

describe('weapon helpers', () => {
  it('weaponAverageDamage counts riders', () => {
    expect(weaponAverageDamage(sword)).toBe(4.5 + 4);
    expect(
      weaponAverageDamage({ ...sword, extraDamage: [{ damage: dice(2, 6), type: 'fire' }] }),
    ).toBe(4.5 + 4 + 7);
  });

  it('primaryWeapon picks the highest-average weapon', () => {
    const c = mk({ attacks: [bow, sword] });
    expect(primaryWeapon(c)?.name).toBe('sword'); // 8.5 vs 6.5
  });

  it('threatOf scales with extra attacks', () => {
    const one = mk({ attacks: [sword] });
    const two = mk({ attacks: [sword], extraAttacks: 1 });
    expect(threatOf(two)).toBe(threatOf(one) * 2);
  });
});

describe('scoreTarget', () => {
  it('prefers a wounded target over a healthy one', () => {
    const self = mk({ attacks: [sword], position: cell(0, 0) });
    const healthy = mk({ id: 'h', side: 'enemy', maxHp: 30, position: cell(1, 0) });
    const wounded = mk({ id: 'w', side: 'enemy', maxHp: 30, position: cell(1, 0) });
    wounded.takeDamage(20); // 10/30 left
    expect(scoreTarget(self, wounded, DEFAULT_WEIGHTS)).toBeGreaterThan(
      scoreTarget(self, healthy, DEFAULT_WEIGHTS),
    );
  });
});

describe('tactical policy in combat', () => {
  it('a melee attacker closes and kills a passive dummy', () => {
    const hero = mk({ id: 'hero', attacks: [sword], maxHp: 45, position: cell(0, 0) });
    const dummy = mk({ id: 'dummy', side: 'enemy', ac: 10, maxHp: 7, position: cell(5, 0) });
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [hero, dummy],
      rng: new Random(42),
      policyFor: (c) => (c.id === 'hero' ? tacticalPolicy : idlePolicy),
    });
    const result = e.run(20);
    expect(result.winner).toBe('party');
    expect(dummy.isConscious).toBe(false);
    expect(e.events.some((x) => x.kind === 'move' && x.id === 'hero')).toBe(true);
  });

  it('a ranged attacker fires without closing to melee', () => {
    const archer = mk({ id: 'archer', attacks: [bow], maxHp: 30, position: cell(0, 0) });
    const dummy = mk({ id: 'dummy', side: 'enemy', ac: 10, maxHp: 7, position: cell(6, 0) }); // 30 ft
    const e = new Encounter({
      grid: new Grid(20, 20),
      combatants: [archer, dummy],
      rng: new Random(7),
      policyFor: (c) => (c.id === 'archer' ? tacticalPolicy : idlePolicy),
    });
    e.run(20);
    // Already within 80 ft bow range, so no movement needed.
    expect(e.events.some((x) => x.kind === 'move' && x.id === 'archer')).toBe(false);
    expect(dummy.isConscious).toBe(false);
  });

  it('focuses fire on the wounded enemy first', () => {
    const hero = mk({ id: 'hero', attacks: [sword], maxHp: 45, position: cell(0, 0) });
    const full = mk({ id: 'full', side: 'enemy', ac: 30, maxHp: 20, position: cell(1, 0) }); // high AC: survive
    const wounded = mk({ id: 'wounded', side: 'enemy', ac: 30, maxHp: 20, position: cell(0, 1) });
    wounded.takeDamage(16); // 4 HP left
    const e = new Encounter({
      grid: new Grid(12, 12),
      combatants: [hero, full, wounded],
      rng: new Random(3),
      policyFor: (c) => (c.id === 'hero' ? tacticalPolicy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    const first = attackEvents(e, 'hero')[0];
    expect(first?.target).toBe('wounded');
  });

  it('is deterministic under a seed', () => {
    const play = () => {
      const hero = mk({ id: 'hero', attacks: [sword], maxHp: 45, position: cell(0, 0) });
      const foe = mk({
        id: 'foe',
        side: 'enemy',
        ac: 14,
        maxHp: 25,
        attacks: [sword],
        position: cell(4, 0),
      });
      const e = new Encounter({
        grid: new Grid(12, 12),
        combatants: [hero, foe],
        rng: new Random(99),
        policyFor: () => tacticalPolicy,
      });
      return e.run(30);
    };
    expect(play().log).toEqual(play().log);
  });

  it('weights are configurable without touching the engine', () => {
    const aggressive = makeTacticalPolicy({
      ...DEFAULT_WEIGHTS,
      woundedPreference: 0,
      threatPreference: 10,
    });
    expect(typeof aggressive).toBe('function');
  });
});
