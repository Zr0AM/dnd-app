import { describe, it, expect } from 'vitest';
import { Combatant, type CombatantSpec } from './actor';

function scripted(faces: number[]): () => number {
  let i = 0;
  return () => (faces[i++ % faces.length] - 1) / 20 + 1e-9;
}

function make(overrides: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id: 'c1',
    name: 'Test',
    side: 'party',
    level: 5,
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    ac: 16,
    maxHp: 40,
    saveProficiencies: ['str', 'con'],
    ...overrides,
  });
}

describe('Combatant basics', () => {
  it('starts at full HP and conscious', () => {
    const c = make();
    expect(c.hp).toBe(40);
    expect(c.isConscious).toBe(true);
    expect(c.isAlive).toBe(true);
    expect(c.isDying).toBe(false);
  });

  it('computes ability modifiers and proficiency bonus', () => {
    const c = make();
    expect(c.abilityMod('str')).toBe(3);
    expect(c.abilityMod('cha')).toBe(-1);
    expect(c.proficiencyBonus).toBe(3); // level 5
  });

  it('adds proficiency to proficient saves only', () => {
    const c = make();
    expect(c.saveBonus('con')).toBe(2 + 3); // +2 con mod, +3 prof
    expect(c.saveBonus('dex')).toBe(2); // +2 dex mod, not proficient
  });
});

describe('takeDamage', () => {
  it('reduces HP by the damage', () => {
    const c = make();
    const out = c.takeDamage(10);
    expect(c.hp).toBe(30);
    expect(out.hpLost).toBe(10);
    expect(out.dropped).toBe(false);
  });

  it('temporary HP absorbs first and does not stack', () => {
    const c = make();
    c.grantTempHp(5);
    c.grantTempHp(3); // does not stack; stays 5
    const out = c.takeDamage(8);
    expect(out.absorbedByTemp).toBe(5);
    expect(out.hpLost).toBe(3);
    expect(c.tempHp).toBe(0);
    expect(c.hp).toBe(37);
  });

  it('drops to 0 and becomes dying, not dead', () => {
    const c = make();
    const out = c.takeDamage(40);
    expect(c.hp).toBe(0);
    expect(out.dropped).toBe(true);
    expect(out.died).toBe(false);
    expect(c.isDying).toBe(true);
    expect(c.isConscious).toBe(false);
    expect(c.hasCondition('unconscious')).toBe(true);
  });

  it('dies from massive damage (overflow >= max HP)', () => {
    const c = make({ maxHp: 12 });
    c.hp = 6;
    const out = c.takeDamage(18); // 6 to zero, 12 overflow >= 12 max
    expect(out.died).toBe(true);
    expect(c.dead).toBe(true);
    expect(c.isAlive).toBe(false);
  });

  it('does not die when overflow is below max HP', () => {
    const c = make({ maxHp: 12 });
    c.hp = 6;
    const out = c.takeDamage(10); // overflow 4 < 12
    expect(out.dropped).toBe(true);
    expect(out.died).toBe(false);
    expect(c.isDying).toBe(true);
  });

  it('damage at 0 HP causes a death-save failure (two on a crit)', () => {
    const c = make();
    c.takeDamage(40); // to 0
    const out1 = c.takeDamage(3);
    expect(out1.deathSaveFailures).toBe(1);
    expect(c.deathFailures).toBe(1);
    const out2 = c.takeDamage(3, { critical: true });
    expect(out2.deathSaveFailures).toBe(2);
    expect(c.deathFailures).toBe(3);
    expect(c.dead).toBe(true);
  });

  it('a single hit for >= max HP while at 0 kills outright', () => {
    const c = make();
    c.takeDamage(40); // to 0
    const out = c.takeDamage(40);
    expect(out.died).toBe(true);
    expect(c.dead).toBe(true);
  });

  it('ignores non-positive damage and the dead', () => {
    const c = make();
    expect(c.takeDamage(0).hpLost).toBe(0);
    c.dead = true;
    expect(c.takeDamage(10).hpLost).toBe(0);
  });
});

describe('heal', () => {
  it('restores HP up to the maximum', () => {
    const c = make();
    c.takeDamage(30);
    expect(c.heal(100)).toBe(30);
    expect(c.hp).toBe(40);
  });

  it('revives from 0, clearing dying and death saves', () => {
    const c = make();
    c.takeDamage(40);
    c.deathFailures = 2;
    const healed = c.heal(5);
    expect(healed).toBe(5);
    expect(c.hp).toBe(5);
    expect(c.isDying).toBe(false);
    expect(c.isConscious).toBe(true);
    expect(c.deathFailures).toBe(0);
    expect(c.hasCondition('unconscious')).toBe(false);
  });

  it('cannot heal the dead', () => {
    const c = make();
    c.dead = true;
    expect(c.heal(10)).toBe(0);
  });
});

describe('death saves', () => {
  it('three successes stabilize', () => {
    const c = make();
    c.takeDamage(40);
    c.rollDeathSave(scripted([10]));
    c.rollDeathSave(scripted([12]));
    const out = c.rollDeathSave(scripted([15]));
    expect(out.stabilized).toBe(true);
    expect(c.stable).toBe(true);
    expect(c.isDying).toBe(true); // still at 0 HP, but stable
  });

  it('three failures kill', () => {
    const c = make();
    c.takeDamage(40);
    c.rollDeathSave(scripted([5]));
    const out = c.rollDeathSave(scripted([1])); // nat 1 = two failures => 3 total
    expect(out.died).toBe(true);
    expect(c.dead).toBe(true);
  });

  it('a natural 20 revives at 1 HP', () => {
    const c = make();
    c.takeDamage(40);
    const out = c.rollDeathSave(scripted([20]));
    expect(out.revived).toBe(true);
    expect(c.hp).toBe(1);
    expect(c.isConscious).toBe(true);
  });

  it('a stable creature makes no death saves', () => {
    const c = make();
    c.takeDamage(40);
    c.stabilize();
    const out = c.rollDeathSave(scripted([1]));
    expect(out.stabilized).toBe(true);
    expect(c.deathFailures).toBe(0);
  });

  it('taking damage ends stability', () => {
    const c = make();
    c.takeDamage(40);
    c.stabilize();
    expect(c.stable).toBe(true);
    c.takeDamage(3);
    expect(c.stable).toBe(false);
    expect(c.deathFailures).toBe(1);
  });
});

describe('conditions', () => {
  it('adds, checks and removes conditions', () => {
    const c = make();
    expect(c.hasCondition('prone')).toBe(false);
    c.addCondition('prone');
    expect(c.hasCondition('prone')).toBe(true);
    expect(c.conditionList).toContain('prone');
    c.removeCondition('prone');
    expect(c.hasCondition('prone')).toBe(false);
  });
});
