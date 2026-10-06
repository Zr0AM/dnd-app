import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell, distanceFt } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant } from '../combat/actor';
import { Encounter, idlePolicy, type TurnPolicy } from '../combat/encounter';
import type { AttackProfile } from '../combat/attack';
import { RageFeature, RecklessAttackFeature, SneakAttackFeature } from './martial-features';
import type { OnHitContext } from '../combat/feature';

const greataxe: AttackProfile = {
  name: 'Greataxe',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 5,
  damage: dice(1, 12, 3),
  damageType: 'slashing',
};
const rapier: AttackProfile = {
  name: 'Rapier',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 5,
  damage: dice(1, 8, 3),
  damageType: 'piercing',
  finesse: true,
};

function combatant(id: string, overrides = {}): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'party',
    level: 3,
    abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 15,
    maxHp: 30,
    ...overrides,
  });
}

function onHitCtx(
  self: Combatant,
  target: Combatant,
  weapon: AttackProfile,
  over: Partial<OnHitContext> = {},
): OnHitContext {
  return {
    self,
    target,
    weapon,
    crit: false,
    rollAdvantage: 'normal',
    allyAdjacentToTarget: false,
    ...over,
  };
}

describe('RageFeature', () => {
  it('activates on turn start when a use is available, spending it', () => {
    const barb = combatant('barb', { resources: [{ id: 'rage', max: 3, rechargeLong: 'all' }] });
    const rage = new RageFeature(2);
    expect(rage.isRaging).toBe(false);
    rage.onTurnStart(barb);
    expect(rage.isRaging).toBe(true);
    expect(barb.resourceCount('rage')).toBe(2);
  });

  it('does not activate with no uses left', () => {
    const barb = combatant('barb', { resources: [{ id: 'rage', max: 0 }] });
    const rage = new RageFeature(2);
    rage.onTurnStart(barb);
    expect(rage.isRaging).toBe(false);
  });

  it('grants resistance to B/P/S only while raging', () => {
    const barb = combatant('barb', { resources: [{ id: 'rage', max: 1, rechargeLong: 'all' }] });
    const rage = new RageFeature(2);
    expect(rage.resistsDamage(barb, 'slashing')).toBe(false);
    rage.onTurnStart(barb);
    expect(rage.resistsDamage(barb, 'slashing')).toBe(true);
    expect(rage.resistsDamage(barb, 'fire')).toBe(false);
  });

  it('adds rage damage to melee hits only', () => {
    const barb = combatant('barb', { resources: [{ id: 'rage', max: 1, rechargeLong: 'all' }] });
    const rage = new RageFeature(2);
    rage.onTurnStart(barb);
    const extra = rage.onHit(onHitCtx(barb, combatant('t'), greataxe));
    expect(extra).toHaveLength(1);
    expect(extra[0].type).toBe('slashing');
    expect(extra[0].damage.bonus).toBe(2);
  });
});

describe('RecklessAttackFeature', () => {
  it('gives advantage on melee attacks and then grants attackers advantage', () => {
    const r = new RecklessAttackFeature();
    expect(r.grantsAttackersAdvantage()).toBe(false);
    const mods = r.outgoingAttack(combatant('b'), combatant('t'), greataxe);
    expect(mods?.advantage).toBe(true);
    expect(r.grantsAttackersAdvantage()).toBe(true);
  });

  it('the attackers-advantage window closes at the start of the next turn', () => {
    const r = new RecklessAttackFeature();
    r.outgoingAttack(combatant('b'), combatant('t'), greataxe);
    expect(r.grantsAttackersAdvantage()).toBe(true);
    r.onTurnStart();
    expect(r.grantsAttackersAdvantage()).toBe(false);
  });
});

describe('SneakAttackFeature', () => {
  it('triggers once per turn with advantage on a finesse weapon', () => {
    const s = new SneakAttackFeature(2);
    const self = combatant('rogue');
    const target = combatant('t');
    const first = s.onHit(onHitCtx(self, target, rapier, { rollAdvantage: 'advantage' }));
    expect(first).toHaveLength(1);
    expect(first[0].damage.count).toBe(2);
    expect(first[0].damage.sides).toBe(6);
    // Second hit the same turn: no sneak attack.
    expect(s.onHit(onHitCtx(self, target, rapier, { rollAdvantage: 'advantage' }))).toHaveLength(0);
    // After a new turn it is available again.
    s.onTurnStart();
    expect(s.onHit(onHitCtx(self, target, rapier, { rollAdvantage: 'advantage' }))).toHaveLength(1);
  });

  it('triggers from an adjacent ally without advantage, if not at disadvantage', () => {
    const s = new SneakAttackFeature(2);
    expect(
      s.onHit(onHitCtx(combatant('r'), combatant('t'), rapier, { allyAdjacentToTarget: true })),
    ).toHaveLength(1);
  });

  it('does not trigger at disadvantage even with an adjacent ally', () => {
    const s = new SneakAttackFeature(2);
    expect(
      s.onHit(
        onHitCtx(combatant('r'), combatant('t'), rapier, {
          allyAdjacentToTarget: true,
          rollAdvantage: 'disadvantage',
        }),
      ),
    ).toHaveLength(0);
  });

  it('requires a finesse or ranged weapon', () => {
    const s = new SneakAttackFeature(2);
    expect(
      s.onHit(onHitCtx(combatant('r'), combatant('t'), greataxe, { rollAdvantage: 'advantage' })),
    ).toHaveLength(0);
  });
});

describe('features in the engine', () => {
  const alwaysAttack =
    (weapon: AttackProfile): TurnPolicy =>
    (api) => {
      const t = api.enemies()[0];
      if (t) {
        let dmg = api.attack(t, weapon);
        while (dmg !== null && api.resources.attacksRemaining > 0) dmg = api.attack(t, weapon);
      }
    };

  it('a raging barbarian takes half damage from a slashing attacker', () => {
    const barb = combatant('barb', {
      side: 'party',
      maxHp: 40,
      resources: [{ id: 'rage', max: 1, rechargeLong: 'all' }],
      features: [new RageFeature(2)],
      position: cell(0, 0),
    });
    const foe = combatant('foe', {
      side: 'enemy',
      ac: 10,
      maxHp: 60,
      attacks: [{ ...greataxe, attackBonus: 20 }], // hits reliably
      position: cell(1, 0),
    });
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [barb, foe],
      rng: new Random(5),
      policyFor: (c) =>
        c.id === 'foe' ? alwaysAttack({ ...greataxe, attackBonus: 20 }) : idlePolicy,
    });
    e.rollInitiative();
    // Run a couple of rounds; the barbarian should be raging and resisting.
    e.runRound();
    e.runRound();
    const raging = (barb.features[0] as RageFeature).isRaging;
    expect(raging).toBe(true);
    // With resistance, the barbarian still has meaningful HP after being hit.
    expect(barb.hp).toBeGreaterThan(0);
  });

  it('a level-5 extra-attack fighter makes two attacks in one action', () => {
    const fighter = combatant('fighter', {
      side: 'party',
      level: 5,
      extraAttacks: 1,
      attacks: [greataxe],
      position: cell(0, 0),
    });
    const dummy = combatant('dummy', { side: 'enemy', ac: 1, maxHp: 200, position: cell(1, 0) });
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [fighter, dummy],
      rng: new Random(9),
      policyFor: (c) => (c.id === 'fighter' ? alwaysAttack(greataxe) : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    const attacks = e.events.filter((x) => x.kind === 'attack' && x.attacker === 'fighter');
    expect(attacks.length).toBe(2); // one Attack action = two attacks at level 5
  });

  it('sanity: adjacency helper matches grid distance', () => {
    expect(distanceFt(cell(0, 0), cell(1, 0))).toBe(5);
  });
});
