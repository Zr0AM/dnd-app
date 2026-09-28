export type CoinKey = 'pp' | 'gp' | 'sp' | 'cp';

export type Coins = Record<CoinKey, number>;

export interface Denomination {
  key: CoinKey;
  name: 'platinum' | 'gold' | 'silver' | 'copper';
  label: string;
  valueCp: number;
}

// Ordered largest-first; algorithms that hand out coins greedily rely on this.
export const DENOMS: readonly Denomination[] = [
  { key: 'pp', name: 'platinum', label: 'Platinum', valueCp: 1000 },
  { key: 'gp', name: 'gold', label: 'Gold', valueCp: 100 },
  { key: 'sp', name: 'silver', label: 'Silver', valueCp: 10 },
  { key: 'cp', name: 'copper', label: 'Copper', valueCp: 1 },
];

export const MAX_COINS = 1_000_000;

export function emptyCoins(): Coins {
  return { pp: 0, gp: 0, sp: 0, cp: 0 };
}

export function toCp(coins: Coins): number {
  return DENOMS.reduce((sum, d) => sum + coins[d.key] * d.valueCp, 0);
}

export function toGp(coins: Coins): number {
  return toCp(coins) / 100;
}

// Accepts user or URL input; anything malformed becomes 0.
export function parseCoinCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(MAX_COINS, Math.max(0, n)) : 0;
}

export function toQueryParams(coins: Coins): Partial<Coins> {
  const params: Partial<Coins> = {};
  for (const { key } of DENOMS) {
    if (coins[key] > 0) {
      params[key] = coins[key];
    }
  }
  return params;
}

export function fromQueryParams(params: Partial<Record<string, unknown>>): Coins {
  const coins = emptyCoins();
  for (const { key } of DENOMS) {
    coins[key] = parseCoinCount(params[key]);
  }
  return coins;
}
