import { describe, it, expect } from 'vitest';
import { Combatant, type CombatantSpec } from './actor';
import {
  attackAdvantage,
  autoFailsSave,
  canAct,
  canReact,
  effectiveConditions,
  effectiveSpeedFt,
  exhaustionD20Penalty,
  isAutoCritTarget,
  isIncapacitated,
  saveAdvantage,
} from './conditions';

function make(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'x',
    name: 'X',
    side: 'party',
    level: 5,
    abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    ac: 15,
    maxHp: 30,
    speedFt: 30,
    ...overrides,
  });
}

describe('effectiveConditions', () => {
  it('expands implied conditions', () => {
    const c = make();
    c.addCondition('unconscious');
    const eff = effectiveConditions(c);
    expect(eff.has('unconscious')).toBe(true);
    expect(eff.has('incapacitated')).toBe(true);
    expect(eff.has('prone')).toBe(true);
  });

  it('paralyzed implies incapacitated', () => {
    const c = make();
    c.addCondition('paralyzed');
    expect(effectiveConditions(c).has('incapacitated')).toBe(true);
  });
});

describe('acting', () => {
  it('incapacitating conditions stop actions and reactions', () => {
    const c = make();
    expect(canAct(c)).toBe(true);
    c.addCondition('stunned');
    expect(isIncapacitated(c)).toBe(true);
    expect(canAct(c)).toBe(false);
    expect(canReact(c)).toBe(false);
  });

  it('a dying creature cannot act', () => {
    const c = make();
    c.takeDamage(30);
    expect(canAct(c)).toBe(false);
  });
});

describe('attackAdvantage', () => {
  it('is normal between two healthy creatures', () => {
    expect(attackAdvantage(make(), make(), true)).toBe('normal');
  });

  it('prone defender: advantage in melee, disadvantage at range', () => {
    const def = make();
    def.addCondition('prone');
    expect(attackAdvantage(make(), def, true)).toBe('advantage');
    expect(attackAdvantage(make(), def, false)).toBe('disadvantage');
  });

  it('restrained defender grants advantage', () => {
    const def = make();
    def.addCondition('restrained');
    expect(attackAdvantage(make(), def, true)).toBe('advantage');
  });

  it('blinded attacker has disadvantage', () => {
    const atk = make();
    atk.addCondition('blinded');
    expect(attackAdvantage(atk, make(), true)).toBe('disadvantage');
  });

  it('advantage and disadvantage cancel (no stacking)', () => {
    // Prone defender in melee (advantage) + poisoned attacker (disadvantage) => normal.
    const atk = make();
    atk.addCondition('poisoned');
    const def = make();
    def.addCondition('prone');
    expect(attackAdvantage(atk, def, true)).toBe('normal');
  });

  it('invisible attacker has advantage; invisible defender imposes disadvantage', () => {
    const invisAtk = make();
    invisAtk.addCondition('invisible');
    expect(attackAdvantage(invisAtk, make(), true)).toBe('advantage');

    const invisDef = make();
    invisDef.addCondition('invisible');
    expect(attackAdvantage(make(), invisDef, true)).toBe('disadvantage');
  });
});

describe('isAutoCritTarget', () => {
  it('paralyzed within 5 feet is an auto-crit', () => {
    const def = make();
    def.addCondition('paralyzed');
    expect(isAutoCritTarget(def, true)).toBe(true);
    expect(isAutoCritTarget(def, false)).toBe(false);
  });

  it('unconscious within 5 feet is an auto-crit', () => {
    const def = make();
    def.takeDamage(30); // unconscious
    expect(isAutoCritTarget(def, true)).toBe(true);
  });

  it('stunned and petrified are not auto-crits', () => {
    const stunned = make();
    stunned.addCondition('stunned');
    expect(isAutoCritTarget(stunned, true)).toBe(false);
    const petrified = make();
    petrified.addCondition('petrified');
    expect(isAutoCritTarget(petrified, true)).toBe(false);
  });
});

describe('saves', () => {
  it('inert conditions auto-fail Str and Dex saves only', () => {
    const c = make();
    c.addCondition('paralyzed');
    expect(autoFailsSave(c, 'str')).toBe(true);
    expect(autoFailsSave(c, 'dex')).toBe(true);
    expect(autoFailsSave(c, 'con')).toBe(false);
    expect(autoFailsSave(c, 'wis')).toBe(false);
  });

  it('restrained gives disadvantage on Dex saves only', () => {
    const c = make();
    c.addCondition('restrained');
    expect(saveAdvantage(c, 'dex')).toBe('disadvantage');
    expect(saveAdvantage(c, 'con')).toBe('normal');
  });
});

describe('exhaustion', () => {
  it('penalizes D20 tests by -2 per level and reduces speed by 5 per level', () => {
    const c = make();
    c.gainExhaustion(3);
    expect(exhaustionD20Penalty(c)).toBe(-6);
    expect(effectiveSpeedFt(c)).toBe(30 - 15);
    expect(c.hasCondition('exhaustion')).toBe(true);
    expect(c.conditionList).toContain('exhaustion');
  });

  it('dies at level 6', () => {
    const c = make();
    c.gainExhaustion(6);
    expect(c.dead).toBe(true);
  });
});

describe('effectiveSpeedFt', () => {
  it('is zero while movement is locked', () => {
    for (const cond of ['grappled', 'restrained', 'paralyzed', 'stunned'] as const) {
      const c = make();
      c.addCondition(cond);
      expect(effectiveSpeedFt(c)).toBe(0);
    }
  });

  it('prone does not zero speed (crawl/stand handled by movement)', () => {
    const c = make();
    c.addCondition('prone');
    expect(effectiveSpeedFt(c)).toBe(30);
  });
});
