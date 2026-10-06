import { describe, expect, it } from 'vitest';
import {
  formatBuildNumber,
  parseRunNumber,
  resolveBuildDate,
} from '../../../../scripts/build-number.mjs';

describe('formatBuildNumber', () => {
  const date = new Date('2026-10-01T12:00:00Z');

  it('pads the run number to three digits', () => {
    expect(formatBuildNumber(date, 1)).toBe('2026-10-01_001');
    expect(formatBuildNumber(date, 42)).toBe('2026-10-01_042');
    expect(formatBuildNumber(date, 999)).toBe('2026-10-01_999');
  });

  it('keeps every digit above 999', () => {
    expect(formatBuildNumber(date, 1000)).toBe('2026-10-01_1000');
    expect(formatBuildNumber(date, 123456)).toBe('2026-10-01_123456');
  });

  it('uses the literal dev suffix for local builds', () => {
    expect(formatBuildNumber(date, 'dev')).toBe('2026-10-01_dev');
  });

  it('renders 000 for unusable run numbers', () => {
    expect(formatBuildNumber(date, 0)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, -5)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, 1.5)).toBe('2026-10-01_000');
    expect(formatBuildNumber(date, Number.NaN)).toBe('2026-10-01_000');
  });

  it('takes the date in UTC, not local time', () => {
    expect(formatBuildNumber(new Date('2026-12-31T23:59:59.999Z'), 7)).toBe('2026-12-31_007');
    expect(formatBuildNumber(new Date('2027-01-01T00:00:00.000Z'), 7)).toBe('2027-01-01_007');
    expect(formatBuildNumber(new Date('2026-03-01T00:30:00+05:00'), 7)).toBe('2026-02-28_007');
  });
});

describe('parseRunNumber', () => {
  it('accepts positive integers only', () => {
    expect(parseRunNumber('42')).toBe(42);
    expect(parseRunNumber(' 7 ')).toBe(7);
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '12abc', '1e3']) {
      expect(parseRunNumber(bad)).toBeNull();
    }
  });
});

describe('resolveBuildDate', () => {
  const now = new Date('2026-10-01T08:00:00Z');

  it('honours a valid SOURCE_DATE_EPOCH', () => {
    expect(resolveBuildDate('1000000000', now).toISOString()).toBe('2001-09-09T01:46:40.000Z');
    expect(resolveBuildDate('253402300799', now).getUTCFullYear()).toBe(9999);
  });

  it('falls back to now for blank, zero, negative, junk and out-of-range values', () => {
    for (const bad of [
      undefined,
      '',
      '0',
      '-5',
      'abc',
      '99999999999999999',
      '8.64e15',
      '8.64e12',
      '253402300800',
    ]) {
      expect(resolveBuildDate(bad, now)).toBe(now);
    }
  });
});
