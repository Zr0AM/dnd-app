import { describe, it, expect } from 'vitest';
import { compareCost, costSortValue, formatCost, formatCostGp } from './item-cost';

describe('formatCost', () => {
  it('shows 0 as Priceless', () => {
    expect(formatCost(0)).toBe('Priceless');
  });

  it('groups positive numbers with thousands separators', () => {
    expect(formatCost(50)).toBe('50');
    expect(formatCost(2500)).toBe('2,500');
    expect(formatCost(1234567)).toBe('1,234,567');
  });

  it('shows an em dash for missing or invalid costs', () => {
    expect(formatCost(null)).toBe('—');
    expect(formatCost(undefined)).toBe('—');
    expect(formatCost(Number.NaN)).toBe('—');
    expect(formatCost(Infinity)).toBe('—');
  });
});

describe('formatCostGp', () => {
  it('adds gp to real prices only', () => {
    expect(formatCostGp(95000)).toBe('95,000 gp');
    expect(formatCostGp(0)).toBe('Priceless');
    expect(formatCostGp(null)).toBe('—');
    expect(formatCostGp(Number.NaN)).toBe('—');
  });
});

describe('cost sorting', () => {
  it('ranks priceless above every price', () => {
    expect(costSortValue(0)).toBe(Infinity);
    expect(costSortValue(500)).toBe(500);
    expect(costSortValue(Number.NaN)).toBe(-Infinity);
    expect(costSortValue(undefined)).toBe(-Infinity);
  });

  it('compares without NaN from Infinity - Infinity', () => {
    expect(compareCost(0, 0)).toBe(0);
    expect(compareCost(0, 200000)).toBe(1);
    expect(compareCost(200000, 0)).toBe(-1);
    expect(compareCost(50, 500)).toBe(-1);
    expect(compareCost(500, 500)).toBe(0);
    expect(compareCost(null, 5)).toBe(-1);
    expect(compareCost(Number.NaN, Number.NaN)).toBe(0);
  });
});
