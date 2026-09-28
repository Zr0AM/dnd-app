import { describe, it, expect } from 'vitest';
import { items } from '../../dev/items.fixture';
import { ART_NAMES, CR_BANDS, CrBandId, GEM_NAMES } from './hoard-tables';
import { Rng, findRow, rollDice, rollHoard, sumGp } from './hoard';

function band(id: CrBandId) {
  return CR_BANDS.find((b) => b.id === id)!;
}

// Deterministic PRNG (mulberry32) so property-style tests are reproducible.
function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    it(`${b.label} rolls coins within the table's bounds`, () => {
      const rng = seeded(42);
      for (let i = 0; i < 200; i++) {
        const { coins } = rollHoard(b, items, rng);
        for (const key of ['pp', 'gp', 'sp', 'cp'] as const) {
          const formula = b.coins.find((f) => f.denom === key);
          if (!formula) {
            expect(coins[key]).toBe(0);
            continue;
          }
          const [count, sides] = formula.dice;
          expect(coins[key]).toBeGreaterThanOrEqual(count * formula.multiplier);
          expect(coins[key]).toBeLessThanOrEqual(count * sides * formula.multiplier);
        }
      }
    });
  }

  it('resolves a specific d100 row into grouped gems and catalog items', () => {
    // CR 0-4 coins consume 11 dice, then the d100 lands on 40:
    // 2d6 × 10 gp gems plus 1d6 rolls on Magic Item Table A (Common).
    const rng = sequence([...Array(11).fill(0), d100(40)]);
    const hoard = rollHoard(band('cr0-4'), items, rng);

    expect(hoard.itemRoll).toBe(40);
    expect(hoard.coins).toEqual({ pp: 0, gp: 20, sp: 300, cp: 600 });
    expect(hoard.gems).toEqual([{ name: 'Azurite', valueGp: 10, count: 2 }]);
    expect(hoard.art).toEqual([]);
    expect(hoard.magic).toHaveLength(1);
    expect(hoard.magic[0]).toMatchObject({ table: 'A', rarity: 'Common', count: 1 });
    expect(hoard.magic[0].item?.itemName).toBe('Potion of Healing');
  });

  it('falls back to a table placeholder when the catalog has no matching rarity', () => {
    const rng = sequence([...Array(11).fill(0), d100(40)]);
    const hoard = rollHoard(band('cr0-4'), [], rng);
    expect(hoard.magic).toEqual([
      { key: 'table-A', table: 'A', rarity: 'Common', item: null, count: 1 },
    ]);
  });

  it('returns nothing but coin on an empty row', () => {
    const rng = sequence([...Array(11).fill(0), d100(3)]);
    const hoard = rollHoard(band('cr0-4'), items, rng);
    expect(hoard.gems).toEqual([]);
    expect(hoard.art).toEqual([]);
    expect(hoard.magic).toEqual([]);
  });

  it('groups repeated valuables so counts add up to the dice roll', () => {
    const rng = seeded(7);
    for (let i = 0; i < 100; i++) {
      const hoard = rollHoard(band('cr5-10'), items, rng);
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
