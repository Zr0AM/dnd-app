import { describe, it, expect } from 'vitest';
import { mitigate } from './damage';

describe('mitigate', () => {
  it('passes normal damage through', () => {
    expect(mitigate(10, 'fire', {})).toBe(10);
  });

  it('halves resistant damage, rounding down', () => {
    expect(mitigate(10, 'fire', { fire: 'resistant' })).toBe(5);
    expect(mitigate(7, 'fire', { fire: 'resistant' })).toBe(3);
  });

  it('doubles vulnerable damage', () => {
    expect(mitigate(10, 'fire', { fire: 'vulnerable' })).toBe(20);
  });

  it('zeroes immune damage', () => {
    expect(mitigate(999, 'fire', { fire: 'immune' })).toBe(0);
  });

  it('only affects the matching type', () => {
    expect(mitigate(10, 'cold', { fire: 'resistant' })).toBe(10);
  });

  it('applies flat reduction before the response (resistance halves after)', () => {
    // 28 fire, reduce 5 -> 23, resistance halves (round down) -> 11.
    expect(mitigate(28, 'fire', { fire: 'resistant' }, 5)).toBe(11);
    // Same reduction, vulnerable instead: 23 doubled -> 46.
    expect(mitigate(28, 'fire', { fire: 'vulnerable' }, 5)).toBe(46);
  });

  it('flat reduction alone cannot go below zero', () => {
    expect(mitigate(3, 'fire', {}, 5)).toBe(0);
  });

  it('returns 0 for non-positive input', () => {
    expect(mitigate(0, 'fire', {})).toBe(0);
    expect(mitigate(-4, 'fire', {})).toBe(0);
  });
});
