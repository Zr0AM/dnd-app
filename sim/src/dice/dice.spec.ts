import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import {
  chanceToHit,
  dice,
  meanD20,
  meanDice,
  meanDie,
  roll,
  rollD20,
  rollDice,
  rollDie,
} from './dice';

const rng = () => new Random(2024).stream('test');

describe('rollDie', () => {
  it('stays within [1, sides]', () => {
    const r = rng();
    for (let i = 0; i < 2000; i++) {
      const v = rollDie(r, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('rejects non-positive or non-integer sides', () => {
    const r = rng();
    expect(() => rollDie(r, 0)).toThrow(RangeError);
    expect(() => rollDie(r, 2.5)).toThrow(RangeError);
  });

  it('empirical mean of a d6 approaches 3.5', () => {
    const r = rng();
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += rollDie(r, 6);
    expect(sum / n).toBeCloseTo(meanDie(6), 1);
  });

  it('covers every face of a d6', () => {
    const r = rng();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rollDie(r, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('rollDice and roll', () => {
  it('sums count dice within bounds', () => {
    const r = rng();
    for (let i = 0; i < 1000; i++) {
      const v = rollDice(r, 3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(24);
    }
  });

  it('rejects negative count', () => {
    expect(() => rollDice(rng(), -1, 6)).toThrow(RangeError);
  });

  it('applies the flat bonus', () => {
    const r = rng();
    const d = dice(2, 6, 5);
    for (let i = 0; i < 1000; i++) {
      const v = roll(r, d);
      expect(v).toBeGreaterThanOrEqual(2 + 5);
      expect(v).toBeLessThanOrEqual(12 + 5);
    }
  });

  it('empirical mean of 8d6 approaches the closed form (Fireball)', () => {
    const r = rng();
    const d = dice(8, 6);
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) sum += roll(r, d);
    expect(sum / n).toBeCloseTo(meanDice(d), 0); // 8 * 3.5 = 28
    expect(meanDice(d)).toBe(28);
  });
});

describe('meanDice', () => {
  it('matches count*meanDie + bonus', () => {
    expect(meanDice(dice(2, 8, 3))).toBe(2 * 4.5 + 3);
    expect(meanDice(dice(1, 10))).toBe(5.5);
  });
});

describe('rollD20', () => {
  it('normal stays in [1, 20]', () => {
    const r = rng();
    for (let i = 0; i < 1000; i++) {
      const v = rollD20(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('advantage mean exceeds normal exceeds disadvantage', () => {
    const mk = (adv: Parameters<typeof rollD20>[1]) => {
      const r = new Random(1).stream('d20');
      let s = 0;
      const n = 200000;
      for (let i = 0; i < n; i++) s += rollD20(r, adv);
      return s / n;
    };
    const adv = mk('advantage');
    const norm = mk('normal');
    const dis = mk('disadvantage');
    expect(adv).toBeCloseTo(meanD20('advantage'), 1);
    expect(norm).toBeCloseTo(meanD20('normal'), 1);
    expect(dis).toBeCloseTo(meanD20('disadvantage'), 1);
    expect(adv).toBeGreaterThan(norm);
    expect(norm).toBeGreaterThan(dis);
  });
});

describe('chanceToHit', () => {
  it('needs 11 on the die => 50% normal', () => {
    expect(chanceToHit(11)).toBeCloseTo(0.5, 10);
  });

  it('clamps: target <=1 always hits the face, >20 never', () => {
    expect(chanceToHit(1)).toBe(1);
    expect(chanceToHit(0)).toBe(1);
    expect(chanceToHit(21)).toBe(0);
    expect(chanceToHit(25)).toBe(0);
  });

  it('advantage and disadvantage match the square formulas', () => {
    const p = 0.5;
    expect(chanceToHit(11, 'advantage')).toBeCloseTo(1 - (1 - p) ** 2, 10);
    expect(chanceToHit(11, 'disadvantage')).toBeCloseTo(p ** 2, 10);
  });

  it('empirical hit rate matches chanceToHit under advantage', () => {
    const r = new Random(777).stream('hit');
    const need = 15; // need 15+ on the die
    let hits = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) if (rollD20(r, 'advantage') >= need) hits++;
    expect(hits / n).toBeCloseTo(chanceToHit(need, 'advantage'), 2);
  });
});
