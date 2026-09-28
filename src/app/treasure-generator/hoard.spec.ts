import { describe, it, expect } from 'vitest';
import { items } from '../../dev/items.fixture';
import {
  ART_NAMES,
  CR_BANDS,
  CrBandId,
  GEM_NAMES,
  MAX_CR,
  bandForCr,
  clampCr,
} from './hoard-tables';
import { Rng, seededRng as seeded } from '../core/random/random';
import { coinScale, expectedCoinGp, findRow, rollDice, rollHoard, sumGp } from './hoard';

function band(id: CrBandId) {
  return CR_BANDS.find((b) => b.id === id)!;
}

// Replays the given rng values in order, then returns `fallback` forever.
function sequence(values: number[], fallback = 0): Rng {
  let i = 0;
  return () => (i < values.length ? values[i++] : fallback);
}

function d100(roll: number) {
  return (roll - 1) / 100 + 0.001;
}

describe('hoard tables', () => {
  for (const b of CR_BANDS) {
    it(`${b.label} covers every d100 result exactly once`, () => {
      const bounds = b.rows.map((r) => r.upTo);
      expect(bounds[0]).toBeGreaterThanOrEqual(1);
      expect(bounds.at(-1)).toBe(100);
      bounds.slice(1).forEach((upTo, i) => expect(upTo).toBeGreaterThan(bounds[i]));
    });

    it(`${b.label} only references gem and art tiers that have names`, () => {
      for (const row of b.rows) {
        if (row.valuables) {
          const names = row.valuables.kind === 'gem' ? GEM_NAMES : ART_NAMES;
          expect(names[row.valuables.valueGp]?.length).toBeGreaterThan(0);
        }
      }
    });
  }

  it('finds the row on either side of a boundary', () => {
    const rows = band('cr0-4').rows;
    expect(findRow(rows, 6).valuables).toBeUndefined();
    expect(findRow(rows, 7).valuables).toEqual({ kind: 'gem', dice: [2, 6], valueGp: 10 });
    expect(findRow(rows, 100).magic).toEqual([{ table: 'G', dice: [1, 1] }]);
  });
});

describe('rollDice', () => {
  it('stays within the possible range', () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      const total = rollDice([3, 6], rng);
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(18);
    }
  });
});

describe('rollHoard', () => {
  for (const b of CR_BANDS) {
    it(`${b.label} rolls coins within the table's scaled bounds`, () => {
      const rng = seeded(42);
      for (let i = 0; i < 200; i++) {
        const { coins, coinScale: scale } = rollHoard(b.minCr, items, rng);
        for (const key of ['pp', 'gp', 'sp', 'cp'] as const) {
          const formula = b.coins.find((f) => f.denom === key);
          if (!formula) {
            expect(coins[key]).toBe(0);
            continue;
          }
          const [count, sides] = formula.dice;
          const unit = formula.multiplier * scale;
          expect(coins[key]).toBeGreaterThanOrEqual(Math.round(count * unit));
          expect(coins[key]).toBeLessThanOrEqual(Math.round(count * sides * unit));
        }
      }
    });
  }

  it('resolves a specific d100 row into grouped gems and catalog items', () => {
    // CR 0-4 coins consume 11 dice, then the d100 lands on 40:
    // 2d6 × 10 gp gems plus 1d6 rolls on Magic Item Table A (Common).
    const rng = sequence([...Array(11).fill(0), d100(40)]);
    const hoard = rollHoard(band('cr0-4').minCr, items, rng);

    expect(hoard.itemRoll).toBe(40);
    expect(hoard.gems).toEqual([{ name: 'Azurite', valueGp: 10, count: 2 }]);
    expect(hoard.art).toEqual([]);
    expect(hoard.magic).toHaveLength(1);
    expect(hoard.magic[0]).toMatchObject({ table: 'A', rarity: 'Common', count: 1 });
    expect(hoard.magic[0].item?.itemName).toBe('Potion of Healing');
  });

  it('falls back to a table placeholder when the catalog has no matching rarity', () => {
    const rng = sequence([...Array(11).fill(0), d100(40)]);
    const hoard = rollHoard(band('cr0-4').minCr, [], rng);
    expect(hoard.magic).toEqual([
      { key: 'table-A', table: 'A', rarity: 'Common', item: null, count: 1 },
    ]);
  });

  it('returns nothing but coin on an empty row', () => {
    const rng = sequence([...Array(11).fill(0), d100(3)]);
    const hoard = rollHoard(band('cr0-4').minCr, items, rng);
    expect(hoard.gems).toEqual([]);
    expect(hoard.art).toEqual([]);
    expect(hoard.magic).toEqual([]);
  });

  it('groups repeated valuables so counts add up to the dice roll', () => {
    const rng = seeded(7);
    for (let i = 0; i < 100; i++) {
      const hoard = rollHoard(band('cr5-10').minCr, items, rng);
      const row = findRow(band('cr5-10').rows, hoard.itemRoll);
      const total = [...hoard.gems, ...hoard.art].reduce((n, v) => n + v.count, 0);
      if (row.valuables) {
        const [count, sides] = row.valuables.dice;
        expect(total).toBeGreaterThanOrEqual(count);
        expect(total).toBeLessThanOrEqual(count * sides);
      } else {
        expect(total).toBe(0);
      }
    }
  });
});

describe('CR mapping', () => {
  it('selects the DMG table for each CR', () => {
    const cases: [number, CrBandId][] = [
      [0, 'cr0-4'], [4, 'cr0-4'], [5, 'cr5-10'], [10, 'cr5-10'],
      [11, 'cr11-16'], [16, 'cr11-16'], [17, 'cr17'], [30, 'cr17'],
    ];
    for (const [cr, id] of cases) {
      expect(bandForCr(cr).id, `CR ${cr}`).toBe(id);
    }
  });

  it('clamps and rounds CR input', () => {
    expect(clampCr(-3)).toBe(0);
    expect(clampCr(12.6)).toBe(13);
    expect(clampCr(99)).toBe(MAX_CR);
    expect(clampCr(NaN)).toBe(0);
  });
});

describe('coin scaling', () => {
  const lastCr = (i: number) => (CR_BANDS[i + 1]?.minCr ?? MAX_CR + 1) - 1;
  const expected = (cr: number) => expectedCoinGp(bandForCr(cr)) * coinScale(cr);

  it("pins each band's DMG coin average to its middle CR", () => {
    CR_BANDS.forEach((b, i) => {
      const middle = (b.minCr + lastCr(i)) / 2;
      expect(coinScale(middle), b.label).toBeCloseTo(1, 10);
    });
  });

  it('starts each band below its DMG average and ends above it', () => {
    CR_BANDS.forEach((b, i) => {
      expect(coinScale(b.minCr), `${b.label} low`).toBeLessThan(1);
      expect(coinScale(lastCr(i)), `${b.label} high`).toBeGreaterThan(1);
    });
  });

  it('makes expected coin rise with every step of CR, including across bands', () => {
    for (let cr = 1; cr <= MAX_CR; cr++) {
      expect(expected(cr), `CR ${cr}`).toBeGreaterThan(expected(cr - 1));
    }
  });

  it('never more than doubles coin between adjacent CRs', () => {
    for (let cr = 1; cr <= MAX_CR; cr++) {
      expect(expected(cr) / expected(cr - 1), `CR ${cr}`).toBeLessThan(2);
    }
  });

  it('applies the scale to each rolled coin amount', () => {
    // All-minimum dice: CR 0-4 rolls 600 cp, 300 sp, 20 gp before scaling.
    const hoard = rollHoard(4, items, sequence([], 0));
    const factor = coinScale(4);
    expect(hoard.coinScale).toBe(factor);
    expect(hoard.coins).toEqual({
      pp: 0,
      gp: Math.round(20 * factor),
      sp: Math.round(300 * factor),
      cp: Math.round(600 * factor),
    });
  });

  it('leaves item odds identical within a band', () => {
    for (let seed = 0; seed < 30; seed++) {
      const low = rollHoard(11, items, seeded(seed));
      const high = rollHoard(16, items, seeded(seed));
      expect(high.itemRoll).toBe(low.itemRoll);
      expect(high.gems).toEqual(low.gems);
      expect(high.art).toEqual(low.art);
      expect(high.magic).toEqual(low.magic);
    }
  });
});

describe('rollHoard reproducibility', () => {
  it('replays an identical hoard from the same CR and seed', () => {
    for (let cr = 0; cr <= MAX_CR; cr++) {
      for (const seed of [1, 99, 123456789]) {
        expect(rollHoard(cr, items, seeded(seed))).toEqual(rollHoard(cr, items, seeded(seed)));
      }
    }
  });

  it('picks the same items regardless of catalog order', () => {
    const reversed = [...items].reverse();
    for (let seed = 0; seed < 50; seed++) {
      expect(rollHoard(band('cr11-16').minCr, reversed, seeded(seed))).toEqual(
        rollHoard(band('cr11-16').minCr, items, seeded(seed)),
      );
    }
  });

  it('keeps coin, valuables and magic counts stable even without a catalog', () => {
    for (let seed = 0; seed < 50; seed++) {
      const full = rollHoard(band('cr5-10').minCr, items, seeded(seed));
      const empty = rollHoard(band('cr5-10').minCr, [], seeded(seed));
      expect(empty.coins).toEqual(full.coins);
      expect(empty.gems).toEqual(full.gems);
      expect(empty.art).toEqual(full.art);
      const count = (h: typeof full) => h.magic.reduce((n, m) => n + m.count, 0);
      expect(count(empty)).toBe(count(full));
    }
  });
});

describe('sumGp', () => {
  it('multiplies value by count', () => {
    expect(
      sumGp([
        { name: 'Amber', valueGp: 100, count: 3 },
        { name: 'Jet', valueGp: 100, count: 1 },
      ]),
    ).toBe(400);
  });
});
