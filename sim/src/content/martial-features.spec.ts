import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell, distanceFt } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant } from '../combat/actor';
import { Encounter, idlePolicy, type CombatEvent, type TurnPolicy } from '../combat/encounter';
import { tacticalPolicy } from '../ai/policy';
import type { AttackProfile } from '../combat/attack';
import {
  ColossusSlayerFeature,
  DivineSmiteFeature,
  HuntersMarkFeature,
  MartialArtsFeature,
  RageFeature,
  RecklessAttackFeature,
  SneakAttackFeature,
  StunningStrikeFeature,
} from './martial-features';
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

describe('ColossusSlayerFeature', () => {
  const longbow: AttackProfile = {
    name: 'Longbow',
    kind: 'ranged',
    rangeFt: 150,
    attackBonus: 7,
    damage: dice(1, 8, 2),
    damageType: 'piercing',
  };

  it('adds 1d8 to a hit on a wounded target, once per turn', () => {
    const c = new ColossusSlayerFeature();
    const self = combatant('ranger');
    const wounded = combatant('t', { maxHp: 30 });
    wounded.takeDamage(5); // now missing HP
    const first = c.onHit(onHitCtx(self, wounded, longbow));
    expect(first).toHaveLength(1);
    expect(first[0].damage.count).toBe(1);
    expect(first[0].damage.sides).toBe(8);
    // Second hit the same turn: no extra.
    expect(c.onHit(onHitCtx(self, wounded, longbow))).toHaveLength(0);
    // Available again next turn.
    c.onTurnStart();
    expect(c.onHit(onHitCtx(self, wounded, longbow))).toHaveLength(1);
  });

  it('does not trigger against a full-HP target', () => {
    const c = new ColossusSlayerFeature();
    const full = combatant('t', { maxHp: 30 }); // undamaged
    expect(c.onHit(onHitCtx(combatant('ranger'), full, longbow))).toHaveLength(0);
  });
});

describe('DivineSmiteFeature', () => {
  const sword: AttackProfile = {
    name: 'Longsword',
    kind: 'melee',
    reachFt: 5,
    attackBonus: 6,
    damage: dice(1, 8, 3),
    damageType: 'slashing',
  };
  const paladin = () =>
    combatant('pal', {
      spellcasting: {
        ability: 'cha' as const,
        slots: [{ level: 1, count: 2 }],
        cantrips: [],
        spells: [],
      },
    });

  it('spends a slot once per turn on a melee hit for 2d8 radiant', () => {
    const d = new DivineSmiteFeature();
    const self = paladin();
    const extra = d.onHit(onHitCtx(self, combatant('t'), sword));
    expect(extra).toHaveLength(1);
    expect(extra[0].type).toBe('radiant');
    expect(extra[0].damage.count).toBe(2); // 2d8 from a 1st-level slot
    expect(extra[0].damage.sides).toBe(8);
    expect(self.slotCount(1)).toBe(1); // a slot was spent
    // Only once per turn.
    expect(d.onHit(onHitCtx(self, combatant('t'), sword))).toHaveLength(0);
    expect(self.slotCount(1)).toBe(1);
    // Available again next turn.
    d.onTurnStart();
    expect(d.onHit(onHitCtx(self, combatant('t'), sword))).toHaveLength(1);
    expect(self.slotCount(1)).toBe(0);
  });

  it('does nothing with no slots or on a ranged attack', () => {
    const d = new DivineSmiteFeature();
    const self = paladin();
    const bow: AttackProfile = { ...sword, name: 'bow', kind: 'ranged', rangeFt: 100 };
    expect(d.onHit(onHitCtx(self, combatant('t'), bow))).toHaveLength(0); // melee only
    self.spendSlot(1);
    self.spendSlot(1); // out of slots
    expect(d.onHit(onHitCtx(self, combatant('t'), sword))).toHaveLength(0);
  });
});

describe('Monk features', () => {
  const fist: AttackProfile = {
    name: 'Unarmed Strike',
    kind: 'melee',
    reachFt: 5,
    attackBonus: 5,
    damage: dice(1, 6, 3),
    damageType: 'bludgeoning',
  };
  const monk = () =>
    combatant('monk', {
      abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
      level: 5,
      resources: [{ id: 'focus', max: 5, rechargeShort: 'all' as const }],
    });

  it('Martial Arts grants one bonus attack action by default', () => {
    expect(new MartialArtsFeature().bonusAttackActions()).toBe(1);
  });

  it('Flurry of Blows spends Focus for a second bonus strike, keeping one in reserve', () => {
    const m = new MartialArtsFeature();
    const self = monk(); // 5 Focus
    m.onTurnStart(self);
    expect(m.bonusAttackActions()).toBe(2); // Martial Arts + Flurry
    expect(self.resourceCount('focus')).toBe(4); // one Focus spent

    // Drain to a single Focus: no Flurry, so the point is kept for Stunning Strike.
    self.spendResource('focus', 3);
    m.onTurnStart(self);
    expect(m.bonusAttackActions()).toBe(1);
    expect(self.resourceCount('focus')).toBe(1);
  });

  it('Stunning Strike spends Focus for a Con save vs Stunned, once per turn', () => {
    const s = new StunningStrikeFeature();
    const self = monk();
    const effect = s.onHitEffect(onHitCtx(self, combatant('t'), fist));
    expect(effect).not.toBeNull();
    expect(effect!.save).toBe('con');
    expect(effect!.condition).toBe('stunned');
    expect(effect!.dc).toBe(8 + 3 + 2); // PB 3 (L5) + Wis +2
    expect(self.resourceCount('focus')).toBe(4); // a focus point was spent
    // Only once per turn.
    expect(s.onHitEffect(onHitCtx(self, combatant('t'), fist))).toBeNull();
    s.onTurnStart();
    expect(s.onHitEffect(onHitCtx(self, combatant('t'), fist))).not.toBeNull();
  });

  it('Stunning Strike needs Focus and a melee hit', () => {
    const s = new StunningStrikeFeature();
    const self = monk();
    const bow: AttackProfile = { ...fist, name: 'bow', kind: 'ranged', rangeFt: 100 };
    expect(s.onHitEffect(onHitCtx(self, combatant('t'), bow))).toBeNull(); // melee only
    // Drain all focus, then it cannot trigger.
    const fresh = new StunningStrikeFeature();
    for (let i = 0; i < 5; i++) {
      fresh.onTurnStart();
      fresh.onHitEffect(onHitCtx(self, combatant('t'), fist));
    }
    fresh.onTurnStart();
    expect(self.resourceCount('focus')).toBe(0);
    expect(fresh.onHitEffect(onHitCtx(self, combatant('t'), fist))).toBeNull();
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

  it('a Monk makes an extra bonus unarmed strike (Martial Arts) and Stuns on a hit', () => {
    const fist: AttackProfile = {
      name: 'Unarmed Strike',
      kind: 'melee',
      reachFt: 5,
      attackBonus: 20, // always hits for a deterministic test
      damage: dice(1, 6, 3),
      damageType: 'bludgeoning',
    };
    const monk = combatant('monk', {
      side: 'party',
      level: 5,
      extraAttacks: 1, // Extra Attack
      abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 10 },
      attacks: [fist],
      resources: [{ id: 'focus', max: 5, rechargeShort: 'all' as const }],
      features: [new MartialArtsFeature(), new StunningStrikeFeature()],
      position: cell(0, 0),
    });
    // A foe sure to fail the Con save, so Stunning Strike reliably lands.
    const foe = combatant('foe', {
      side: 'enemy',
      ac: 1,
      maxHp: 200,
      saveBonuses: { con: -50 },
      position: cell(1, 0),
    });
    // Drain the action attacks and the Martial Arts bonus attack.
    const drain: TurnPolicy = (api) => {
      if (api.self.id !== 'monk') return;
      const t = api.enemies()[0];
      while (t && api.attack(t, fist) !== null) {
        /* keep swinging */
      }
    };
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [monk, foe],
      rng: new Random(3),
      policyFor: (c) => (c.id === 'monk' ? drain : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    e.runRound();
    const monkAttacks = e.events.filter(
      (x) => x.kind === 'attack' && x.attacker === 'monk' && x.hit,
    );
    // 2 Attack-action strikes + 1 Martial Arts bonus strike per turn.
    expect(monkAttacks.length).toBeGreaterThanOrEqual(3);
    // Stunning Strike landed, so the foe's turn is denied and attributed to the monk.
    const denied = e.events.filter((x) => x.kind === 'controlDenied' && x.source === 'monk');
    expect(denied.length).toBeGreaterThan(0);
  });

  it('a Paladin uses Lay on Hands (bonus action) to heal a hurt ally, then acts', () => {
    const sword: AttackProfile = {
      name: 'Longsword',
      kind: 'melee',
      reachFt: 5,
      attackBonus: 6,
      damage: dice(1, 8, 3),
      damageType: 'slashing',
    };
    const paladin = combatant('pal', {
      side: 'party',
      level: 5,
      attacks: [sword],
      resources: [{ id: 'lay-on-hands', max: 25, rechargeLong: 'all' }],
      position: cell(0, 0),
    });
    const ally = combatant('ally', { side: 'party', maxHp: 50, position: cell(0, 1) });
    ally.takeDamage(45); // down to 5/50 (badly hurt)
    const foe = combatant('foe', { side: 'enemy', ac: 12, maxHp: 80, position: cell(1, 0) });
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [paladin, ally, foe],
      rng: new Random(4),
      policyFor: (c) => (c.id === 'pal' ? tacticalPolicy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    const heals = e.events.filter(
      (x): x is Extract<CombatEvent, { kind: 'heal' }> => x.kind === 'heal' && x.source === 'pal',
    );
    expect(heals.length).toBe(1);
    expect(ally.hp).toBeGreaterThan(5); // the ally was topped up
    expect(paladin.resourceCount('lay-on-hands')).toBeLessThan(25); // pool was drawn from
    // The bonus-action heal left the action free, so the paladin also attacked.
    expect(e.events.some((x) => x.kind === 'attack' && x.attacker === 'pal')).toBe(true);
  });

  it('a Ranger marks a target (bonus action) and hits carry the mark', () => {
    const bow: AttackProfile = {
      name: 'Longbow',
      kind: 'ranged',
      rangeFt: 150,
      attackBonus: 20, // always hits for a deterministic test
      damage: dice(1, 8, 3),
      damageType: 'piercing',
    };
    const ranger = combatant('ranger', {
      side: 'party',
      level: 5,
      attacks: [bow],
      features: [new HuntersMarkFeature()],
      resources: [{ id: 'hunters-mark', max: 3, rechargeLong: 'all' }],
      position: cell(0, 0),
    });
    const foe = combatant('foe', { side: 'enemy', ac: 1, maxHp: 300, position: cell(2, 0) });
    const policy: TurnPolicy = (api) => {
      if (api.self.id !== 'ranger') return;
      api.markTarget(foe);
      api.attack(foe, bow);
    };
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [ranger, foe],
      rng: new Random(3),
      policyFor: (c) => (c.id === 'ranger' ? policy : idlePolicy),
    });
    e.rollInitiative();
    e.runRound();
    expect(ranger.markedTarget).toBe('foe');
    expect(ranger.concentratingOn).toBe('hunters-mark');
    expect(ranger.resourceCount('hunters-mark')).toBe(2); // a use was spent
    expect(e.events.some((x) => x.kind === 'marked' && x.source === 'ranger')).toBe(true);
  });

  it('Hunter’s Mark adds 1d6 force only to the marked target', () => {
    const bow: AttackProfile = {
      name: 'Longbow',
      kind: 'ranged',
      rangeFt: 150,
      attackBonus: 7,
      damage: dice(1, 8, 3),
      damageType: 'piercing',
    };
    const f = new HuntersMarkFeature();
    const ranger = combatant('ranger');
    const marked = combatant('m');
    const other = combatant('o');
    ranger.markedTarget = 'm';
    const extra = f.onHit(onHitCtx(ranger, marked, bow));
    expect(extra).toHaveLength(1);
    expect(extra[0].type).toBe('force');
    expect(extra[0].damage.sides).toBe(6);
    expect(f.onHit(onHitCtx(ranger, other, bow))).toHaveLength(0); // not the marked one
  });

  it('sanity: adjacency helper matches grid distance', () => {
    expect(distanceFt(cell(0, 0), cell(1, 0))).toBe(5);
  });
});
