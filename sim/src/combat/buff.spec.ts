import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { dice } from '../dice/dice';
import { Combatant, type CombatantSpec } from './actor';
import { Encounter, idlePolicy, type CombatEvent, type TurnPolicy } from './encounter';
import { bless, haste } from '../content/spells';
import type { AttackProfile } from './attack';

const sword: AttackProfile = {
  name: 'sword',
  kind: 'melee',
  reachFt: 5,
  attackBonus: 5,
  damage: dice(1, 8, 3),
  damageType: 'slashing',
};

function bard(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'bard',
    name: 'Bard',
    side: 'party',
    level: 5,
    abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 18 },
    ac: 13,
    maxHp: 30,
    spellcasting: {
      ability: 'cha',
      slots: [
        { level: 1, count: 4 },
        { level: 2, count: 3 },
        { level: 3, count: 2 },
      ],
      cantrips: [],
      spells: [bless, haste],
    },
    position: cell(0, 0),
    ...overrides,
  });
}

function fighter(
  id: string,
  pos: ReturnType<typeof cell>,
  over: Partial<CombatantSpec> = {},
): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'party',
    level: 1,
    abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
    ac: 16,
    maxHp: 25,
    attacks: [sword],
    position: pos,
    ...over,
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
    ac: 5, // easy to hit, so a blessed attack lands and logs its assist
    maxHp: 80,
    position: pos,
    ...over,
  });
}

describe('buff state (actor subsystem)', () => {
  it('applies a buff and exposes its effects', () => {
    const f = fighter('f', cell(0, 0));
    f.applyBuff({ id: 'haste', source: 'bard', rounds: 10, acBonus: 2, extraAttackAction: true });
    expect(f.hasBuff('haste')).toBe(true);
    expect(f.effectiveAc()).toBe(18); // 16 + 2
    expect(f.hasExtraAttackAction()).toBe(true);
    expect(f.buffSourceFor('haste')).toBe('bard');
  });

  it('exposes attack/save bonus dice for Bless-style buffs', () => {
    const f = fighter('f', cell(0, 0));
    f.applyBuff({
      id: 'bless',
      source: 'bard',
      rounds: 10,
      attackBonusDice: dice(1, 4),
      saveBonusDice: dice(1, 4),
    });
    expect(f.buffAttackBonuses()).toHaveLength(1);
    expect(f.buffAttackBonuses()[0].source).toBe('bard');
    expect(f.buffSaveBonuses()).toHaveLength(1);
  });

  it('refreshes rather than stacks the same buff', () => {
    const f = fighter('f', cell(0, 0));
    f.applyBuff({ id: 'bless', source: 'bard', rounds: 3, attackBonusDice: dice(1, 4) });
    f.applyBuff({ id: 'bless', source: 'bard', rounds: 10, attackBonusDice: dice(1, 4) });
    expect(f.buffAttackBonuses()).toHaveLength(1);
  });

  it('ticks down and expires', () => {
    const f = fighter('f', cell(0, 0));
    f.applyBuff({ id: 'bless', source: 'bard', rounds: 2, attackBonusDice: dice(1, 4) });
    expect(f.tickBuffs()).toEqual([]); // 2 -> 1
    expect(f.hasBuff('bless')).toBe(true);
    expect(f.tickBuffs()).toEqual(['bless']); // 1 -> 0, expires
    expect(f.hasBuff('bless')).toBe(false);
  });

  it('ends buffs sustained by a given concentration owner', () => {
    const f = fighter('f', cell(0, 0));
    f.applyBuff({ id: 'bless', source: 'bard', rounds: 10, concentrationOwner: 'bard' });
    f.endConcentrationBuffs('someone-else');
    expect(f.hasBuff('bless')).toBe(true);
    f.endConcentrationBuffs('bard');
    expect(f.hasBuff('bless')).toBe(false);
  });
});

/** Run `rounds` rounds with the given per-combatant policies. */
function runWith(
  combatants: Combatant[],
  policyFor: (c: Combatant) => TurnPolicy,
  rounds: number,
  seed = 7,
): Encounter {
  const e = new Encounter({ grid: new Grid(20, 20), combatants, rng: new Random(seed), policyFor });
  for (let r = 0; r < rounds; r++) e.runRound();
  return e;
}

describe('buffs in the engine', () => {
  it('Bless covers up to maxTargets allies and logs the application', () => {
    const b = bard();
    const a1 = fighter('a1', cell(1, 0));
    const a2 = fighter('a2', cell(1, 1));
    const a3 = fighter('a3', cell(0, 1));
    const a4 = fighter('a4', cell(2, 2));
    const enemy = dummy('e', cell(10, 10));
    const policy: TurnPolicy = (api) => {
      if (api.self === b) api.castSpell(bless, a1);
    };
    const e = runWith([b, a1, a2, a3, a4, enemy], (c) => (c === b ? policy : idlePolicy), 1);
    const applied = e.events.filter(
      (x): x is Extract<CombatEvent, { kind: 'buffApplied' }> => x.kind === 'buffApplied',
    );
    expect(applied).toHaveLength(3); // Bless maxTargets = 3
    expect(applied.every((x) => x.buff === 'bless' && x.source === 'bard')).toBe(true);
    expect(b.concentratingOn).toBe('bless');
  });

  it('a blessed ally’s attack is boosted, logged against the caster', () => {
    const b = bard();
    const f = fighter('a1', cell(1, 0));
    const enemy = dummy('e', cell(2, 0));
    let blessed = false;
    const policy: TurnPolicy = (api) => {
      if (api.self === b && !blessed) {
        api.castSpell(bless, f);
        blessed = true;
      } else if (api.self === f) {
        api.attack(enemy, sword);
      }
    };
    const e = runWith([b, f, enemy], (c) => (c === b || c === f ? policy : idlePolicy), 2);
    const boosts = e.events.filter(
      (x): x is Extract<CombatEvent, { kind: 'buffBoost' }> => x.kind === 'buffBoost',
    );
    expect(boosts.length).toBeGreaterThan(0);
    const bless0 = boosts.find((x) => x.buff === 'bless');
    expect(bless0?.source).toBe('bard');
    expect(bless0?.beneficiary).toBe('a1');
    expect(bless0!.amount).toBeGreaterThanOrEqual(1);
    expect(bless0!.amount).toBeLessThanOrEqual(4); // a d4
  });

  it('Haste grants one extra weapon attack beyond the normal action', () => {
    const f = fighter('a1', cell(1, 0));
    f.applyBuff({ id: 'haste', source: 'bard', rounds: 10, acBonus: 2, extraAttackAction: true });
    const enemy = dummy('e', cell(2, 0));
    let attacks = 0;
    const policy: TurnPolicy = (api) => {
      if (api.self !== f) return;
      // Attack until the engine refuses (action, then the Haste extra action).
      while (api.attack(enemy, sword) !== null) attacks++;
    };
    const e = runWith([f, enemy], (c) => (c === f ? policy : idlePolicy), 1);
    expect(attacks).toBe(2); // one action attack + one Haste attack (no Extra Attack at L1)
    const hasteBoost = e.events.filter((x) => x.kind === 'buffBoost' && x.buff === 'haste');
    expect(hasteBoost).toHaveLength(1);
  });

  it('breaking the caster’s concentration ends the buff on allies', () => {
    const b = bard({ ac: 5, maxHp: 60, saveBonuses: { con: -50 }, position: cell(0, 0) });
    const f = fighter('a1', cell(1, 1));
    const brute = dummy('brute', cell(1, 0), { maxHp: 40 });
    const club: AttackProfile = {
      name: 'club',
      kind: 'melee',
      reachFt: 5,
      attackBonus: 50,
      damage: dice(1, 6, 2),
      damageType: 'bludgeoning',
    };
    let cast = false;
    const policy: TurnPolicy = (api) => {
      if (api.self === b && !cast) {
        api.castSpell(bless, f);
        cast = true;
      } else if (api.self === brute) {
        api.attack(b, club);
      }
    };
    const e = runWith([b, f, brute], (c) => (c === b || c === brute ? policy : idlePolicy), 2);
    expect(cast).toBe(true);
    expect(b.concentratingOn).toBeNull();
    expect(f.hasBuff('bless')).toBe(false);
    expect(e.events.some((x) => x.kind === 'concentrationBroken')).toBe(true);
  });
});
