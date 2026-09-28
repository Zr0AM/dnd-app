import { Item } from '../core/items/items.service';
import { Coins, emptyCoins } from '../core/coins/coins';
import {
  ART_NAMES,
  CrBand,
  CrBandId,
  Dice,
  GEM_NAMES,
  HoardRow,
  MAGIC_TABLE_RARITY,
  MagicTable,
} from './hoard-tables';

export type Rng = () => number;

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
  band: CrBandId;
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

export function sumGp(valuables: readonly Valuable[]): number {
  return valuables.reduce((sum, v) => sum + v.valueGp * v.count, 0);
}

export function rollHoard(band: CrBand, catalog: readonly Item[], rng: Rng = Math.random): Hoard {
  const coins = emptyCoins();
  for (const formula of band.coins) {
    coins[formula.denom] += rollDice(formula.dice, rng) * formula.multiplier;
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
    const pool = catalog.filter((i) => i.itemRarity === rarity);
    const count = rollDice(dice, rng);
    for (let i = 0; i < count; i++) {
      const item = pool.length ? pick(pool, rng) : null;
      drops.push({ key: item ? `item-${item.itemID}` : `table-${table}`, table, rarity, item });
    }
  }

  return {
    band: band.id,
    itemRoll,
    coins,
    gems: row.valuables?.kind === 'gem' ? grouped : [],
    art: row.valuables?.kind === 'art' ? grouped : [],
    magic: tally(drops, (d) => d.key),
  };
}
