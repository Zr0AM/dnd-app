import { describe, it, expect } from 'vitest';
import { randomSeed, seededRng } from './random';

function take(seed: number, n = 20): number[] {
  const rng = seededRng(seed);
  return Array.from({ length: n }, () => rng());
}

describe('seededRng', () => {
  it('replays the same sequence for the same seed', () => {
    expect(take(123456)).toEqual(take(123456));
  });

  it('diverges for different seeds', () => {
    expect(take(1)).not.toEqual(take(2));
  });

  it('yields values in [0, 1) across the full 32-bit seed range', () => {
    for (const seed of [0, 1, 0x7fffffff, 0xffffffff]) {
      for (const value of take(seed, 200)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});

describe('randomSeed', () => {
  it('returns an unsigned 32-bit integer', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
