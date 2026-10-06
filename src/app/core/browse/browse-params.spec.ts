import { describe, expect, it } from 'vitest';
import {
  oneOf,
  sortedUnique,
  toDirection,
  toPageSize,
  toPositiveInt,
  toText,
} from './browse-params';

describe('browse params', () => {
  it('toPositiveInt falls back to 1 for malformed values', () => {
    expect(toPositiveInt('3')).toBe(3);
    expect(toPositiveInt('2.9')).toBe(2);
    for (const bad of [undefined, '', 'abc', '0', '-4', 'NaN', 'Infinity']) {
      expect(toPositiveInt(bad), String(bad)).toBe(1);
    }
  });

  it('toPageSize accepts only the offered sizes', () => {
    expect([10, 25, 50].map((n) => toPageSize(String(n)))).toEqual([10, 25, 50]);
    for (const bad of [undefined, '7', '1000', 'x']) {
      expect(toPageSize(bad), String(bad)).toBe(25);
    }
  });

  it('toText defaults to an empty string', () => {
    expect(toText(undefined)).toBe('');
    expect(toText('Fey')).toBe('Fey');
  });

  it('oneOf keeps allowed values and falls back otherwise', () => {
    const parse = oneOf(['a', 'b'] as const, 'a');
    expect(parse('b')).toBe('b');
    expect(parse('c')).toBe('a');
    expect(parse(undefined)).toBe('a');
    expect(parse('constructor')).toBe('a');
  });

  it('toDirection only accepts desc', () => {
    expect(toDirection('desc')).toBe('desc');
    expect(toDirection('asc')).toBe('asc');
    expect(toDirection('DESC')).toBe('asc');
    expect(toDirection(undefined)).toBe('asc');
  });

  it('sortedUnique dedupes and sorts', () => {
    expect(sortedUnique(['b', 'a', 'b', 'C'])).toEqual(['a', 'b', 'C']);
  });
});
