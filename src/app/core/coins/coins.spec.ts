import { describe, it, expect } from 'vitest';
import {
  DENOMS,
  MAX_COINS,
  emptyCoins,
  fromQueryParams,
  parseCoinCount,
  toCp,
  toGp,
  toQueryParams,
} from './coins';

describe('coins', () => {
  it('orders denominations largest-first', () => {
    const values = DENOMS.map((d) => d.valueCp);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('converts a purse to copper and gold at standard rates', () => {
    const coins = { pp: 1, gp: 2, sp: 3, cp: 4 };
    expect(toCp(coins)).toBe(1234);
    expect(toGp(coins)).toBe(12.34);
  });

  it('values an empty purse at zero', () => {
    expect(toCp(emptyCoins())).toBe(0);
  });

  it('sanitizes coin counts', () => {
    expect(parseCoinCount('42')).toBe(42);
    expect(parseCoinCount(7.9)).toBe(7);
    expect(parseCoinCount('-5')).toBe(0);
    expect(parseCoinCount('lots')).toBe(0);
    expect(parseCoinCount(undefined)).toBe(0);
    expect(parseCoinCount(MAX_COINS + 1)).toBe(MAX_COINS);
  });

  it('omits empty denominations from query params', () => {
    expect(toQueryParams({ pp: 0, gp: 250, sp: 0, cp: 12 })).toEqual({ gp: 250, cp: 12 });
  });

  it('round-trips through query params', () => {
    const coins = { pp: 3, gp: 0, sp: 40, cp: 9 };
    expect(fromQueryParams(toQueryParams(coins))).toEqual(coins);
  });

  it('parses string query params and ignores junk', () => {
    expect(fromQueryParams({ gp: '100', sp: 'abc', extra: '5' })).toEqual({
      pp: 0,
      gp: 100,
      sp: 0,
      cp: 0,
    });
  });
});
