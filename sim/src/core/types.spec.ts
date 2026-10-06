import { describe, it, expect } from 'vitest';
import {
  ABILITIES,
  CONDITIONS,
  DAMAGE_TYPES,
  SIZES,
  SIZE_SPACE_FT,
  abilityModifier,
  proficiencyBonus,
} from './types';

describe('reference vocabulary', () => {
  it('has the expected counts', () => {
    expect(ABILITIES).toHaveLength(6);
    expect(DAMAGE_TYPES).toHaveLength(13);
    expect(CONDITIONS).toHaveLength(15);
    expect(SIZES).toHaveLength(6);
  });

  it('maps every size to a space', () => {
    for (const s of SIZES) expect(SIZE_SPACE_FT[s]).toBeGreaterThan(0);
    expect(SIZE_SPACE_FT.medium).toBe(5);
    expect(SIZE_SPACE_FT.large).toBe(10);
  });
});

describe('abilityModifier', () => {
  it('matches the 2024 table', () => {
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(14)).toBe(2);
    expect(abilityModifier(15)).toBe(2);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(30)).toBe(10);
  });
});

describe('proficiencyBonus', () => {
  it('matches the Character Advancement table', () => {
    const expected: Record<number, number> = {
      1: 2,
      4: 2,
      5: 3,
      8: 3,
      9: 4,
      12: 4,
      13: 5,
      16: 5,
      17: 6,
      20: 6,
    };
    for (const [lvl, pb] of Object.entries(expected)) {
      expect(proficiencyBonus(Number(lvl))).toBe(pb);
    }
  });

  it('rejects out-of-range levels', () => {
    expect(() => proficiencyBonus(0)).toThrow(RangeError);
    expect(() => proficiencyBonus(21)).toThrow(RangeError);
    expect(() => proficiencyBonus(5.5)).toThrow(RangeError);
  });
});
