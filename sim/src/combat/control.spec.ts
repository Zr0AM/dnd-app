import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { Combatant, type CombatantSpec } from './actor';
import { canAct } from './conditions';
import { Encounter, idlePolicy, type CombatEvent, type TurnPolicy } from './encounter';
import { holdPerson, hypnoticPattern } from '../content/spells';
import { dice } from '../dice/dice';
import type { AttackProfile } from './attack';
import type { Spell } from './spell';

// Deterministic d20 streams: rollD20 reads 1 + floor(rng()*20), so 0 -> 1 (worst)
// and 0.999 -> 20 (best).
const alwaysLow = () => 0;
const alwaysHigh = () => 0.999;

function caster(overrides: Partial<CombatantSpec> = {}): Combatant {
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
      cantrips: [],
      spells: [holdPerson, hypnoticPattern],
    },
    position: cell(0, 0),
    ...overrides,
  });
}

function victim(
  id: string,
  pos: ReturnType<typeof cell>,
  over: Partial<CombatantSpec> = {},
): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'enemy',
    level: 1,
    abilities: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ac: 10,
    maxHp: 20,
    position: pos,
    ...over,
  });
}

describe('timed conditions (actor subsystem)', () => {
  it('applies a condition flag and reports its control source', () => {
    const v = victim('v', cell(0, 0));
    v.applyTimedCondition({ condition: 'paralyzed', source: 'wiz', rounds: 3 });
    expect(v.hasCondition('paralyzed')).toBe(true);
    expect(v.controlSources()).toEqual(['wiz']);
    expect(canAct(v)).toBe(false); // paralyzed implies incapacitated
  });

  it('decrements the duration and clears the flag when it expires', () => {
    const v = victim('v', cell(0, 0));
    v.applyTimedCondition({ condition: 'stunned', source: 'wiz', rounds: 2 });
    expect(v.tickTimedConditions(alwaysLow)).toEqual([]); // 2 -> 1, still active
    expect(v.hasCondition('stunned')).toBe(true);
    const ended = v.tickTimedConditions(alwaysLow); // 1 -> 0, expires
    expect(ended).toEqual(['stunned']);
    expect(v.hasCondition('stunned')).toBe(false);
    expect(v.controlSources()).toEqual([]);
  });

  it('a successful repeat save ends the effect early', () => {
    // Wis 10 -> +0 save; DC 15. A nat 20 (alwaysHigh) is 20 >= 15 (success).
    const v = victim('v', cell(0, 0));
    v.applyTimedCondition({
      condition: 'paralyzed',
      source: 'wiz',
      rounds: 10,
      repeatSave: { ability: 'wis', dc: 15, endsOnSuccess: true },
    });
    expect(v.tickTimedConditions(alwaysHigh)).toEqual(['paralyzed']);
    expect(v.hasCondition('paralyzed')).toBe(false);
  });

  it('a failed repeat save keeps the effect (only the duration ticks down)', () => {
    const v = victim('v', cell(0, 0));
    v.applyTimedCondition({
      condition: 'paralyzed',
      source: 'wiz',
      rounds: 10,
      repeatSave: { ability: 'wis', dc: 15, endsOnSuccess: true },
    });
    expect(v.tickTimedConditions(alwaysLow)).toEqual([]); // nat 1 fails, still held
    expect(v.hasCondition('paralyzed')).toBe(true);
  });

  it('ends conditions sustained by a given concentration owner', () => {
    const v = victim('v', cell(0, 0));
    v.applyTimedCondition({
      condition: 'incapacitated',
      source: 'wiz',
      rounds: 10,
      concentrationOwner: 'wiz',
    });
    v.endConcentrationConditions('someone-else'); // not the owner: no effect
    expect(v.hasCondition('incapacitated')).toBe(true);
    v.endConcentrationConditions('wiz');
    expect(v.hasCondition('incapacitated')).toBe(false);
    expect(v.controlSources()).toEqual([]);
  });
});

function castControl(
  wiz: Combatant,
  spell: Spell,
  target: Combatant,
  others: Combatant[],
  seed = 7,
  rounds = 2,
): Encounter {
  const policy: TurnPolicy = (api) => {
    if (api.self === wiz) api.castSpell(spell, target);
  };
  const e = new Encounter({
    grid: new Grid(20, 20),
    combatants: [wiz, target, ...others],
    rng: new Random(seed),
    policyFor: (c) => (c === wiz ? policy : idlePolicy),
  });
  for (let r = 0; r < rounds; r++) e.runRound();
  return e;
}

describe('control spells in the engine', () => {
  it('a failed save paralyzes the target, who is then denied its action', () => {
    const wiz = caster();
    // A save bonus so negative the save cannot succeed, making the outcome deterministic.
    const v = victim('goblin', cell(2, 0), { saveBonuses: { wis: -50 } });
    const e = castControl(wiz, holdPerson, v, []);
    expect(v.hasCondition('paralyzed')).toBe(true);
    expect(wiz.concentratingOn).toBe('hold-person');
    const denials = e.events.filter(
      (x): x is Extract<CombatEvent, { kind: 'controlDenied' }> => x.kind === 'controlDenied',
    );
    expect(denials.length).toBeGreaterThan(0);
    expect(denials.every((d) => d.victim === 'goblin' && d.source === 'wiz')).toBe(true);
  });

  it('a made save leaves the target free to act', () => {
    const wiz = caster();
    const v = victim('goblin', cell(2, 0), { saveBonuses: { wis: 50 } });
    const e = castControl(wiz, holdPerson, v, []);
    expect(v.hasCondition('paralyzed')).toBe(false);
    const denials = e.events.filter((x) => x.kind === 'controlDenied');
    expect(denials).toHaveLength(0);
  });

  it('an area control spell catches every enemy that fails in its radius', () => {
    const wiz = caster();
    const a = victim('a', cell(4, 0), { saveBonuses: { wis: -50 } });
    const b = victim('b', cell(4, 1), { saveBonuses: { wis: -50 } });
    const c = victim('c', cell(5, 0), { saveBonuses: { wis: -50 } });
    const e = castControl(wiz, hypnoticPattern, a, [b, c], 7, 1);
    for (const v of [a, b, c]) expect(v.hasCondition('incapacitated')).toBe(true);
    const spellEv = e.events.find(
      (x): x is Extract<CombatEvent, { kind: 'spell' }> => x.kind === 'spell',
    );
    expect(spellEv?.targets).toBe(3);
  });

  it('breaking the caster’s concentration ends the controlled condition', () => {
    // Wizard: easy to hit (low AC) and sure to fail the Con save (huge negative
    // save bonus), so a single hit after the cast deterministically breaks it.
    const wiz = caster({ ac: 5, maxHp: 60, saveBonuses: { con: -50 }, position: cell(0, 0) });
    const v = victim('held', cell(2, 0), { saveBonuses: { wis: -50 } });
    const brute = victim('brute', cell(1, 0), { maxHp: 40 });
    const club: AttackProfile = {
      name: 'club',
      kind: 'melee',
      reachFt: 5,
      attackBonus: 50, // always hits AC 5
      damage: dice(1, 6, 2),
      damageType: 'bludgeoning',
    };

    let cast = false;
    const wizPolicy: TurnPolicy = (api) => {
      if (api.self === wiz && !cast) {
        api.castSpell(holdPerson, v);
        cast = true;
      }
    };
    const brutePolicy: TurnPolicy = (api) => {
      if (api.self === brute) api.attack(wiz, club);
    };

    const e = new Encounter({
      grid: new Grid(20, 20),
      combatants: [wiz, v, brute],
      rng: new Random(7),
      policyFor: (c) => (c === wiz ? wizPolicy : c === brute ? brutePolicy : idlePolicy),
    });
    e.runRound();
    e.runRound();

    expect(cast).toBe(true);
    expect(wiz.concentratingOn).toBeNull();
    expect(v.hasCondition('paralyzed')).toBe(false);
    expect(v.controlSources()).toEqual([]);
    const broken = e.events.filter((x) => x.kind === 'concentrationBroken');
    expect(broken.length).toBeGreaterThan(0);
  });
});
