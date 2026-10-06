import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  formatCp,
  formatSpellComponents,
  formatSpellLevel,
  formatWeight,
  splitList,
  titleCase,
} from './game-format';

describe('formatSpellLevel', () => {
  it('names cantrips and uses ordinals', () => {
    expect(formatSpellLevel(0)).toBe('Cantrip');
    expect([1, 2, 3, 4, 9].map(formatSpellLevel)).toEqual(['1st', '2nd', '3rd', '4th', '9th']);
  });
});

describe('formatCp', () => {
  it('shows the largest coin that divides evenly', () => {
    expect(formatCp(1500)).toBe('15 gp');
    expect(formatCp(20)).toBe('2 sp');
    expect(formatCp(1)).toBe('1 cp');
    expect(formatCp(150)).toBe('15 sp');
    expect(formatCp(1_000_000)).toBe('10,000 gp');
  });

  it('handles zero and missing prices', () => {
    expect(formatCp(0)).toBe('0 cp');
    expect(formatCp(null)).toBe('—');
    expect(formatCp(undefined)).toBe('—');
  });
});

describe('formatWeight', () => {
  it('formats pounds and a dash when unknown', () => {
    expect(formatWeight(55)).toBe('55 lb');
    expect(formatWeight(0.5)).toBe('0.5 lb');
    expect(formatWeight(null)).toBe('—');
  });
});

describe('abilityModifier', () => {
  it('signs and floors the modifier', () => {
    expect(abilityModifier(10)).toBe('+0');
    expect(abilityModifier(8)).toBe('-1');
    expect(abilityModifier(9)).toBe('-1');
    expect(abilityModifier(27)).toBe('+8');
    expect(abilityModifier(1)).toBe('-5');
  });
});

describe('formatSpellComponents', () => {
  it('joins the components present', () => {
    expect(
      formatSpellComponents({ spellVerbal: 1, spellSomatic: 1, spellMaterial: 'bat guano' }),
    ).toBe('V, S, M');
    expect(formatSpellComponents({ spellVerbal: 1, spellSomatic: 0, spellMaterial: null })).toBe(
      'V',
    );
    expect(formatSpellComponents({ spellVerbal: 0, spellSomatic: 0, spellMaterial: null })).toBe(
      'None',
    );
  });
});

describe('splitList', () => {
  it('splits, trims and drops empties', () => {
    expect(splitList('Sorcerer, Wizard', ',')).toEqual(['Sorcerer', 'Wizard']);
    expect(splitList('Huge or Large', ' or ')).toEqual(['Huge', 'Large']);
    expect(splitList(null, ',')).toEqual([]);
    expect(splitList('', ',')).toEqual([]);
    expect(splitList('a,,b', ',')).toEqual(['a', 'b']);
  });
});

describe('titleCase', () => {
  it('capitalises the first letter', () => {
    expect(titleCase('ammunition')).toBe('Ammunition');
    expect(titleCase('')).toBe('');
  });
});
