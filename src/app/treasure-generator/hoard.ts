import { Item } from '../core/items/items.service';
import { Coins, emptyCoins, toGp } from '../core/coins/coins';
import { Rng } from '../core/random/random';
import {
  ART_NAMES,
  CR_BANDS,
  CrBand,
  CrBandId,
  Dice,
  GEM_NAMES,
  HoardRow,
  MAGIC_TABLE_RARITY,
  MAX_CR,
  MagicTable,
  bandForCr,
} from './hoard-tables';

export interface Valuable {
  name: string;
  valueGp: number;
  count: number;
}

export interface MagicDrop {
  key: string;
  table: MagicTable;
  rarity: string;
  item: Item | null;
  count: number;
}

export interface Hoard {
  cr: number;
  band: CrBandId;
  coinScale: number;
  itemRoll: number;
  coins: Coins;
  gems: Valuable[];
  art: Valuable[];
  magic: MagicDrop[];
}

function die(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

export function rollDice([count, sides]: Dice, rng: Rng): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += die(sides, rng);
  }
  return total;
}

function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)];
}

export function findRow(rows: readonly HoardRow[], roll: number): HoardRow {
  return rows.find((r) => roll <= r.upTo) ?? rows[rows.length - 1];
}

// Collapses repeats into one entry with a count, keeping first-seen order.
function tally<T extends object>(entries: readonly T[], keyOf: (entry: T) => string) {
  const groups = new Map<string, T & { count: number }>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const group = groups.get(key);
    if (group) {
      group.count++;
    } else {
      groups.set(key, { ...entry, count: 1 });
    }
  }
  return [...groups.values()];
}

export function expectedCoinGp(band: CrBand): number {
  const average = emptyCoins();
  for (const { denom, dice: [count, sides], multiplier } of band.coins) {
    average[denom] += ((count * (sides + 1)) / 2) * multiplier;
  }
  return toGp(average);
}

// Each band's DMG coin average is pinned to the band's middle CR (the top band
// spans 17–MAX_CR). Between those anchors coin follows a geometric curve, and
// past the outermost anchors the nearest segment's curve is extended.
const COIN_ANCHORS = CR_BANDS.map((band, i) => {
  const lastCr = i + 1 < CR_BANDS.length ? CR_BANDS[i + 1].minCr - 1 : MAX_CR;
  return { cr: (band.minCr + lastCr) / 2, gp: expectedCoinGp(band) };
});

function coinCurveGp(cr: number): number {
  let i = 0;
  while (i < COIN_ANCHORS.length - 2 && cr > COIN_ANCHORS[i + 1].cr) {
    i++;
  }
  const a = COIN_ANCHORS[i];
  const b = COIN_ANCHORS[i + 1];
  return a.gp * (b.gp / a.gp) ** ((cr - a.cr) / (b.cr - a.cr));
}

// Multiplier on the band's DMG coin: below 1 early in a band, 1 at its
// middle, above 1 late in it.
export function coinScale(cr: number): number {
  return coinCurveGp(cr) / expectedCoinGp(bandForCr(cr));
}

export function sumGp(valuables: readonly Valuable[]): number {
  return valuables.reduce((sum, v) => sum + v.valueGp * v.count, 0);
}

// For a given rng seed, coin, gems, art and magic item counts always replay
// identically; only the named magic items can differ if the catalog changes.
export function rollHoard(cr: number, catalog: readonly Item[], rng: Rng): Hoard {
  const band = bandForCr(cr);
  const scale = coinScale(cr);
  const coins = emptyCoins();
  for (const formula of band.coins) {
    coins[formula.denom] += Math.round(
      rollDice(formula.dice, rng) * formula.multiplier * scale,
    );
  }

  const itemRoll = die(100, rng);
  const row = findRow(band.rows, itemRoll);

  const valuables: Omit<Valuable, 'count'>[] = [];
  if (row.valuables) {
    const { kind, dice, valueGp } = row.valuables;
    const names = (kind === 'gem' ? GEM_NAMES : ART_NAMES)[valueGp];
    const count = rollDice(dice, rng);
    for (let i = 0; i < count; i++) {
      valuables.push({ name: pick(names, rng), valueGp });
    }
  }
  const grouped = tally(valuables, (v) => v.name);

  const drops: Omit<MagicDrop, 'count'>[] = [];
  for (const { table, dice } of row.magic) {
    const rarity = MAGIC_TABLE_RARITY[table];
    // Sorted so API ordering can't change which item a seed lands on.
    const pool = catalog
      .filter((i) => i.itemRarity === rarity)
      .sort((a, b) => a.itemID - b.itemID);
    const count = rollDice(dice, rng);
    for (let i = 0; i < count; i++) {
      // Always draw, even from an empty pool, so later rolls stay in sync.
      const draw = rng();
      const item = pool.length ? pool[Math.floor(draw * pool.length)] : null;
      drops.push({ key: item ? `item-${item.itemID}` : `table-${table}`, table, rarity, item });
    }
  }

  return {
    cr,
    band: band.id,
    coinScale: scale,
    itemRoll,
    coins,
    gems: row.valuables?.kind === 'gem' ? grouped : [],
    art: row.valuables?.kind === 'art' ? grouped : [],
    magic: tally(drops, (d) => d.key),
  };
}
