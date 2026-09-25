import { ChangeDetectionStrategy, Component, WritableSignal, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../shared/icon/icon';

interface Purse {
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  valueCp: number;
}

type CoinKey = 'platinum' | 'gold' | 'silver' | 'copper';

const DENOMS: { key: CoinKey; value: number; abbr: string }[] = [
  { key: 'platinum', value: 1000, abbr: 'pp' },
  { key: 'gold', value: 100, abbr: 'gp' },
  { key: 'silver', value: 10, abbr: 'sp' },
  { key: 'copper', value: 1, abbr: 'cp' },
];

// Fair, denomination-preserving split in O(players): hand each player the whole
// share of every coin type, then deal the leftover coins one at a time to the
// currently poorest purse so totals stay as even as indivisible coins allow.
function splitLoot(counts: Record<CoinKey, number>, players: number): Purse[] {
  if (players <= 0) {
    return [];
  }
  const purses: Purse[] = Array.from({ length: players }, () => ({
    platinum: 0,
    gold: 0,
    silver: 0,
    copper: 0,
    valueCp: 0,
  }));

  for (const denom of DENOMS) {
    const count = counts[denom.key];
    const base = Math.floor(count / players);
    let remainder = count % players;

    if (base > 0) {
      for (const purse of purses) {
        purse[denom.key] += base;
        purse.valueCp += base * denom.value;
      }
    }

    while (remainder > 0) {
      let min = 0;
      for (let i = 1; i < players; i++) {
        if (purses[i].valueCp < purses[min].valueCp) {
          min = i;
        }
      }
      purses[min][denom.key] += 1;
      purses[min].valueCp += denom.value;
      remainder--;
    }
  }

  return purses;
}

@Component({
  selector: 'app-loot-splitter',
  imports: [DecimalPipe, Icon],
  templateUrl: './loot-splitter.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './loot-splitter.scss',
})
export class LootSplitter {
  protected readonly denoms = DENOMS;

  protected readonly platinum = signal(0);
  protected readonly gold = signal(0);
  protected readonly silver = signal(0);
  protected readonly copper = signal(0);
  protected readonly players = signal(4);

  protected readonly coinInputs = [
    { label: 'Platinum', abbr: 'pp', key: 'platinum' as CoinKey, sig: this.platinum },
    { label: 'Gold', abbr: 'gp', key: 'gold' as CoinKey, sig: this.gold },
    { label: 'Silver', abbr: 'sp', key: 'silver' as CoinKey, sig: this.silver },
    { label: 'Copper', abbr: 'cp', key: 'copper' as CoinKey, sig: this.copper },
  ];

  protected readonly totalCp = computed(
    () =>
      this.platinum() * 1000 + this.gold() * 100 + this.silver() * 10 + this.copper(),
  );

  protected readonly hasLoot = computed(() => this.totalCp() > 0 && this.players() > 0);

  protected readonly distributions = computed(() =>
    splitLoot(
      {
        platinum: this.platinum(),
        gold: this.gold(),
        silver: this.silver(),
        copper: this.copper(),
      },
      this.players(),
    ),
  );

  // Spread between the richest and poorest share — 0 means a perfectly even split.
  protected readonly spreadCp = computed(() => {
    const purses = this.distributions();
    if (purses.length === 0) {
      return 0;
    }
    const values = purses.map((p) => p.valueCp);
    return Math.max(...values) - Math.min(...values);
  });

  protected setNum(target: WritableSignal<number>, raw: string, min: number, max: number) {
    const parsed = Math.floor(Number(raw));
    target.set(Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min);
  }

  protected reset() {
    this.platinum.set(0);
    this.gold.set(0);
    this.silver.set(0);
    this.copper.set(0);
  }

  protected coinsOf(purse: Purse): { abbr: string; key: CoinKey; count: number }[] {
    return DENOMS.map((d) => ({ abbr: d.abbr, key: d.key, count: purse[d.key] })).filter(
      (c) => c.count > 0,
    );
  }
}
