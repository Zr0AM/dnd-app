import { describe, it, expect } from 'vitest';
import { editDistance, matchesSearch, toSearchText } from './item-search';

const NAMES = [
  'Armor, +1: Studded Leather',
  'Armor, +2: Studded Leather',
  'Armor of Reistance: Studded Leather - Fire',
  'Cast-Off Armor: Studded Leather',
  'Ring of Spell Storing',
  'Wings of Flying',
  'Mordenkainen’s Magnificent Mansion',
  'Flame Tongue',
];

function search(query: string): string[] {
  const q = toSearchText(query);
  return NAMES.filter((name) => matchesSearch(toSearchText(name), q));
}

describe('item search', () => {
  it('still finds exact and partial substrings', () => {
    expect(search('Armor, +1: Studded')).toEqual(['Armor, +1: Studded Leather']);
    expect(search('mor, +1')).toEqual(['Armor, +1: Studded Leather']);
  });

  it('ignores case, punctuation and extra spaces', () => {
    expect(search('  ARMOR +1   studded ')).toEqual(['Armor, +1: Studded Leather']);
  });

  it('accepts words in any order', () => {
    expect(search('studded leather +1')).toEqual(['Armor, +1: Studded Leather']);
    expect(search('+2 studded')).toEqual(['Armor, +2: Studded Leather']);
  });

  it('matches partially typed words', () => {
    expect(search('flam tong')).toEqual(['Flame Tongue']);
  });

  it('tolerates typos in longer words, in either the query or the data', () => {
    expect(search('studed lether +1')).toEqual(['Armor, +1: Studded Leather']);
    expect(search('armour of resistance')).toEqual(['Armor of Reistance: Studded Leather - Fire']);
    expect(search('flame tonuge')).toEqual(['Flame Tongue']);
  });

  it('keeps short words strict so near-misses stay out', () => {
    expect(search('ring')).toEqual(['Ring of Spell Storing']);
    expect(search('wings')).toEqual(['Wings of Flying']);
    expect(search('flmae')).toEqual([]);
    expect(search('+3 studded')).toEqual([]);
  });

  it('ignores apostrophes and accents', () => {
    expect(search('mordenkainens mansion')).toEqual(['Mordenkainen’s Magnificent Mansion']);
    expect(search("Mordenkainen's")).toEqual(['Mordenkainen’s Magnificent Mansion']);
    expect(search('mánsion')).toEqual(['Mordenkainen’s Magnificent Mansion']);
  });

  it('treats a blank query as matching everything', () => {
    expect(search('  ')).toEqual(NAMES);
  });

  it('rejects unrelated names', () => {
    expect(search('vorpal sword')).toEqual([]);
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and swaps', () => {
    expect(editDistance('studed', 'studded')).toBe(1);
    expect(editDistance('leather', 'lether')).toBe(1);
    expect(editDistance('armor', 'armer')).toBe(1);
    expect(editDistance('flmae', 'flame')).toBe(1);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('stops early once the limit is exceeded', () => {
    expect(editDistance('abc', 'xyzxyz', 1)).toBeGreaterThan(1);
    expect(editDistance('kitten', 'sitting', 1)).toBeGreaterThan(1);
  });
});
