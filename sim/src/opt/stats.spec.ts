import { describe, it, expect } from 'vitest';
import { mean, meanInterval, sampleStdDev, wilsonInterval, Z_95 } from './stats';

describe('mean and sampleStdDev', () => {
  it('computes the mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
  });

  it('computes the Bessel-corrected standard deviation', () => {
    // values 2,4,4,4,5,5,7,9 -> sd = 2.138 (n-1)
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 3);
    expect(sampleStdDev([5])).toBe(0);
  });
});

describe('wilsonInterval', () => {
  it('brackets the point estimate within [0, 1]', () => {
    const ci = wilsonInterval(5, 10);
    expect(ci.point).toBe(0.5);
    expect(ci.lo).toBeGreaterThanOrEqual(0);
    expect(ci.hi).toBeLessThanOrEqual(1);
    expect(ci.lo).toBeLessThan(0.5);
    expect(ci.hi).toBeGreaterThan(0.5);
  });

  it('matches a known value: 5/10 at 95% is about [0.24, 0.76]', () => {
    const ci = wilsonInterval(5, 10, Z_95);
    expect(ci.lo).toBeCloseTo(0.2366, 2);
    expect(ci.hi).toBeCloseTo(0.7634, 2);
  });

  it('stays in-bounds at the extremes', () => {
    const all = wilsonInterval(10, 10);
    expect(all.hi).toBeCloseTo(1, 10);
    expect(all.hi).toBeLessThanOrEqual(1);
    expect(all.lo).toBeGreaterThan(0.6);
    const none = wilsonInterval(0, 10);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeLessThan(0.4);
  });

  it('narrows as n grows', () => {
    expect(wilsonInterval(50, 100).halfWidth).toBeLessThan(wilsonInterval(5, 10).halfWidth);
  });

  it('handles n = 0', () => {
    const ci = wilsonInterval(0, 0);
    expect(ci.lo).toBe(0);
    expect(ci.hi).toBe(1);
  });
});

describe('meanInterval', () => {
  it('is symmetric around the mean', () => {
    const ci = meanInterval([10, 12, 14, 16, 18]);
    expect(ci.point).toBe(14);
    expect(ci.point - ci.lo).toBeCloseTo(ci.hi - ci.point, 10);
  });

  it('narrows as the sample grows for the same spread', () => {
    const small = meanInterval([8, 10, 12]);
    const large = meanInterval([8, 10, 12, 8, 10, 12, 8, 10, 12, 8, 10, 12]);
    expect(large.halfWidth).toBeLessThan(small.halfWidth);
  });

  it('has zero width for a single sample', () => {
    expect(meanInterval([5]).halfWidth).toBe(0);
  });
});
