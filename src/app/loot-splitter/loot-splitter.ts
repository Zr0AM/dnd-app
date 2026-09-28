import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../shared/icon/icon';
import {
  CoinKey,
  Coins,
  DENOMS,
  Denomination,
  MAX_COINS,
  emptyCoins,
  parseCoinCount,
  toCp,
} from '../core/coins/coins';

export interface Purse extends Coins {
  valueCp: number;
}

// Fair, denomination-preserving split in O(players): hand each player the whole
// share of every coin type, then deal the leftover coins one at a time to the
// currently poorest purse so totals stay as even as indivisible coins allow.
function splitLoot(counts: Coins, players: number): Purse[] {
  if (players <= 0) {
    return [];
  }
  const purses: Purse[] = Array.from({ length: players }, () => ({ ...emptyCoins(), valueCp: 0 }));

  for (const denom of DENOMS) {
    const count = counts[denom.key];
    const base = Math.floor(count / players);
    let remainder = count % players;

    if (base > 0) {
      for (const purse of purses) {
        purse[denom.key] += base;
        purse.valueCp += base * denom.valueCp;
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
      purses[min].valueCp += denom.valueCp;
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
  protected readonly maxCoins = MAX_COINS;

  // Optional query params (e.g. from the Treasure Hoard) seed the form once;
  // edits after that stay local and are not written back to the URL.
  readonly pp = input(0, { transform: parseCoinCount });
  readonly gp = input(0, { transform: parseCoinCount });
  readonly sp = input(0, { transform: parseCoinCount });
  readonly cp = input(0, { transform: parseCoinCount });

  protected readonly platinum = linkedSignal(() => this.pp());
  protected readonly gold = linkedSignal(() => this.gp());
  protected readonly silver = linkedSignal(() => this.sp());
  protected readonly copper = linkedSignal(() => this.cp());
  protected readonly players = signal(4);

  private readonly coinSignals: Record<CoinKey, WritableSignal<number>> = {
    pp: this.platinum,
    gp: this.gold,
    sp: this.silver,
    cp: this.copper,
  };

  protected readonly coinInputs = DENOMS.map((d) => ({ ...d, sig: this.coinSignals[d.key] }));

  protected readonly coins = computed<Coins>(() => ({
    pp: this.platinum(),
    gp: this.gold(),
    sp: this.silver(),
    cp: this.copper(),
  }));

  protected readonly totalCp = computed(() => toCp(this.coins()));

  protected readonly hasLoot = computed(() => this.totalCp() > 0 && this.players() > 0);

  protected readonly distributions = computed(() => splitLoot(this.coins(), this.players()));

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
    for (const sig of Object.values(this.coinSignals)) {
      sig.set(0);
    }
  }

  protected coinsOf(purse: Purse): (Pick<Denomination, 'key' | 'name'> & { count: number })[] {
    return DENOMS.map((d) => ({ key: d.key, name: d.name, count: purse[d.key] })).filter(
      (c) => c.count > 0,
    );
  }
}
