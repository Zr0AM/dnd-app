import { describe, it, expect } from 'vitest';
import { formatHoardCode, parseHoardCode } from './hoard-code';

describe('hoard codes', () => {
  it('round-trips every CR and the full seed range', () => {
    for (let cr = 0; cr <= 30; cr++) {
      for (const seed of [0, 42, 0xffffffff]) {
        expect(parseHoardCode(formatHoardCode(cr, seed))).toEqual({ cr, seed });
      }
    }
  });

  it('formats a fixed-width, upper-case code', () => {
    expect(formatHoardCode(13, 42)).toBe('CR13-0000016');
    expect(formatHoardCode(0, 0xffffffff)).toBe('CR0-1Z141Z3');
  });

  it('tolerates pasted whitespace and lower case', () => {
    expect(parseHoardCode('  cr7-00000a \n')).toEqual({ cr: 7, seed: 10 });
  });

  it('rejects malformed codes', () => {
    for (const bad of ['', 'hello', 'CR-0000001', 'CR5-', 'CR5-ABC$', 'CR5-ZZZZZZZZ', '0000001', 'CR5-10-0000001']) {
      expect(parseHoardCode(bad), bad).toBeNull();
    }
  });

  it('rejects out-of-range CRs and seeds', () => {
    expect(parseHoardCode('CR31-0000001')).toBeNull();
    expect(parseHoardCode('CR17-1Z141Z4')).toBeNull();
  });
});
