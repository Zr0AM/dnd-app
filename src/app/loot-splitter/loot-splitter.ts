import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface CoinPurse {
  platinum: number;
  gold: number;
  silver: number;
  copper: number;
  value: number;
}

@Component({
  selector: 'app-loot-splitter',
  imports: [FormsModule, CommonModule],
  templateUrl: './loot-splitter.html',
  styleUrl: './loot-splitter.scss',
})
export class LootSplitter {
  platinum: number = 0;
  gold: number = 0;
  silver: number = 0;
  copper: number = 0;
  players: number = 2;

  distributions: CoinPurse[] = [];

  splitLoot() {
    if (this.players <= 0) {
      this.distributions = [];
      return;
    }

    // Initialize player purses
    this.distributions = Array.from({ length: this.players }, () => ({
      platinum: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      value: 0
    }));

    const coinTypes: { name: keyof Omit<CoinPurse, 'value'>, value: number, count: number }[] = [
      { name: 'platinum', value: 1000, count: this.platinum },
      { name: 'gold', value: 100, count: this.gold },
      { name: 'silver', value: 10, count: this.silver },
      { name: 'copper', value: 1, count: this.copper }
    ];

    for (const coin of coinTypes) {
      let count = coin.count;
      const value = coin.value;
      const name = coin.name;

      while (count > 0) {
        // Find player with lowest total value
        let minIndex = 0;
        let minValue = this.distributions[0].value;

        for (let i = 1; i < this.players; i++) {
          if (this.distributions[i].value < minValue) {
            minValue = this.distributions[i].value;
            minIndex = i;
          }
        }

        // Give coin to that player
        this.distributions[minIndex][name]++;
        this.distributions[minIndex].value += value;
        count--;
      }
    }
  }
}
