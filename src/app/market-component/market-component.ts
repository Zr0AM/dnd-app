import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Item, ItemsService } from '../core/items/items.service';

@Component({
  selector: 'app-market-component',
  imports: [DecimalPipe],
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
})
export class MarketComponent implements OnInit {
  private readonly itemsService = inject(ItemsService);

  protected readonly items = signal<Item[]>([]);
  protected readonly status = signal<'loading' | 'loaded' | 'error'>('loading');

  ngOnInit() {
    this.itemsService.getItems({ sortBy: 'itemName', order: 'asc' }).subscribe({
      next: (items) => {
        this.items.set(items);
        this.status.set('loaded');
      },
      error: () => this.status.set('error'),
    });
  }
}
