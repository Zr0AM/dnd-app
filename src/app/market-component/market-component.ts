import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Item, ItemsService } from '../core/items/items.service';

type SortColumn = 'itemName' | 'itemType' | 'itemRarity' | 'itemCost' | 'itemSource';
type SortDirection = 'asc' | 'desc';

// Rarity sorts by power tier, not alphabetically.
const RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Very Rare': 3,
  Legendary: 4,
  Artifact: 5,
};

function compareItems(a: Item, b: Item, column: SortColumn): number {
  let result: number;
  switch (column) {
    case 'itemCost':
      result = a.itemCost - b.itemCost;
      break;
    case 'itemRarity':
      result = (RARITY_RANK[a.itemRarity] ?? 99) - (RARITY_RANK[b.itemRarity] ?? 99);
      break;
    default:
      result = String(a[column]).localeCompare(String(b[column]));
  }
  // Tie-break by name so equal-valued rows keep a predictable order.
  return result !== 0 ? result : a.itemName.localeCompare(b.itemName);
}

@Component({
  selector: 'app-market-component',
  imports: [DecimalPipe],
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketComponent implements OnInit {
  private readonly itemsService = inject(ItemsService);

  protected readonly pageSizes = [10, 25, 50];

  protected readonly items = signal<Item[]>([]);
  protected readonly status = signal<'loading' | 'loaded' | 'error'>('loading');

  protected readonly search = signal('');
  protected readonly rarity = signal('');
  protected readonly type = signal('');
  protected readonly attunement = signal('');

  protected readonly sortColumn = signal<SortColumn>('itemName');
  protected readonly sortDir = signal<SortDirection>('asc');

  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  protected readonly expandedId = signal<number | null>(null);

  // Dropdown options come from the data itself, so new rarities/types/
  // attunement values in the database show up without code changes.
  protected readonly rarityOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemRarity))].sort(
      (a, b) => (RARITY_RANK[a] ?? 99) - (RARITY_RANK[b] ?? 99),
    ),
  );
  protected readonly typeOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemType))].sort(),
  );
  protected readonly attunementOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemAttunement))].sort(),
  );

  protected readonly hasActiveFilters = computed(
    () => !!(this.search().trim() || this.rarity() || this.type() || this.attunement()),
  );

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rarity = this.rarity();
    const type = this.type();
    const attunement = this.attunement();
    return this.items().filter(
      (item) =>
        (!term || item.itemName.toLowerCase().includes(term)) &&
        (!rarity || item.itemRarity === rarity) &&
        (!type || item.itemType === type) &&
        (!attunement || item.itemAttunement === attunement),
    );
  });

  protected readonly sorted = computed(() => {
    const column = this.sortColumn();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * compareItems(a, b, column));
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sorted().length / this.pageSize())),
  );
  protected readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });
  protected readonly rangeStart = computed(() =>
    this.sorted().length === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.page() * this.pageSize(), this.sorted().length),
  );

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.status.set('loading');
    this.itemsService.getItems().subscribe({
      next: (items) => {
        this.items.set(items);
        this.status.set('loaded');
      },
      error: () => this.status.set('error'),
    });
  }

  protected setSearch(value: string) {
    this.search.set(value);
    this.page.set(1);
  }

  protected setRarity(value: string) {
    this.rarity.set(value);
    this.page.set(1);
  }

  protected setType(value: string) {
    this.type.set(value);
    this.page.set(1);
  }

  protected setAttunement(value: string) {
    this.attunement.set(value);
    this.page.set(1);
  }

  protected setPageSize(value: string) {
    this.pageSize.set(Number(value));
    this.page.set(1);
  }

  protected clearFilters() {
    this.search.set('');
    this.rarity.set('');
    this.type.set('');
    this.attunement.set('');
    this.page.set(1);
  }

  protected sortBy(column: SortColumn) {
    if (this.sortColumn() === column) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDir.set('asc');
    }
    this.page.set(1);
  }

  protected ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) {
      return '';
    }
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  protected goToPage(page: number) {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  protected toggleExpand(id: number) {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected raritySlug(rarity: string): string {
    return rarity.toLowerCase().replace(/\s+/g, '-');
  }
}
