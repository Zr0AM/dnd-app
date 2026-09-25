import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import { Item, ItemsService } from '../core/items/items.service';
import { Icon } from '../shared/icon/icon';
import { Skeleton } from '../shared/skeleton/skeleton';
import { EmptyState } from '../shared/empty-state/empty-state';

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

const SORT_COLUMNS: readonly SortColumn[] = [
  'itemName',
  'itemType',
  'itemRarity',
  'itemCost',
  'itemSource',
];

function toPositiveInt(value: string | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function toPageSize(value: string | undefined): number {
  const n = Math.floor(Number(value));
  return [10, 25, 50].includes(n) ? n : 25;
}

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
  imports: [DecimalPipe, Icon, Skeleton, EmptyState],
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketComponent {
  private readonly itemsService = inject(ItemsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly pageSizes = [10, 25, 50];
  protected readonly catalog = this.itemsService.catalog;

  // ---- URL-synced state (query params bound via withComponentInputBinding) --
  // Absent query params arrive as `undefined`, so every input coerces back to a
  // sane default and rejects malformed values from hand-edited URLs.
  readonly q = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly rarity = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly type = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly attunement = input('', { transform: (v: string | undefined) => v ?? '' });
  readonly sort = input('itemName', {
    transform: (v: string | undefined): SortColumn =>
      v && (SORT_COLUMNS as readonly string[]).includes(v) ? (v as SortColumn) : 'itemName',
  });
  readonly dir = input('asc', {
    transform: (v: string | undefined): SortDirection => (v === 'desc' ? 'desc' : 'asc'),
  });
  readonly page = input(1, { transform: toPositiveInt });
  readonly size = input(25, { transform: toPageSize });

  // Local draft for the search box: instant to type into, resets when the URL
  // changes (shared links, back/forward), and is debounced back into the URL.
  protected readonly searchDraft = linkedSignal(() => this.q());

  protected readonly expandedId = signal<number | null>(null);

  protected readonly items = computed(() => this.catalog.value());

  // Dropdown options derive from the data, so new rarities/types/attunement
  // values appear without code changes.
  protected readonly rarityOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemRarity))].sort(
      (a, b) => (RARITY_RANK[a] ?? 99) - (RARITY_RANK[b] ?? 99),
    ),
  );
  protected readonly typeOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemType))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly attunementOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemAttunement))].sort((a, b) => a.localeCompare(b)),
  );

  protected readonly hasActiveFilters = computed(
    () => !!(this.searchDraft().trim() || this.rarity() || this.type() || this.attunement()),
  );

  protected readonly filtered = computed(() => {
    const term = this.searchDraft().trim().toLowerCase();
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
    const column = this.sort();
    const dir = this.dir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * compareItems(a, b, column));
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.sorted().length / this.size())));
  // The URL page may exceed the available pages after filtering; clamp for display.
  protected readonly currentPage = computed(() =>
    Math.min(Math.max(1, this.page()), this.totalPages()),
  );
  protected readonly pagedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.size();
    return this.sorted().slice(start, start + this.size());
  });
  protected readonly rangeStart = computed(() =>
    this.sorted().length === 0 ? 0 : (this.currentPage() - 1) * this.size() + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.size(), this.sorted().length),
  );

  constructor() {
    // Mirror the (debounced) search draft into the URL. The guard skips the
    // initial seed and the echo of our own navigations / back-forward.
    toObservable(this.searchDraft)
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((value) => {
        if (value === this.q()) {
          return;
        }
        this.patch({ q: value.trim() || null, page: null });
      });
  }

  private patch(params: Record<string, string | number | null>) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload() {
    this.catalog.reload();
  }

  protected setRarity(value: string) {
    this.patch({ rarity: value || null, page: null });
  }

  protected setType(value: string) {
    this.patch({ type: value || null, page: null });
  }

  protected setAttunement(value: string) {
    this.patch({ attunement: value || null, page: null });
  }

  protected setPageSize(value: string) {
    this.patch({ size: Number(value), page: null });
  }

  protected clearFilters() {
    this.searchDraft.set('');
    this.patch({ q: null, rarity: null, type: null, attunement: null, page: null });
  }

  protected sortBy(column: SortColumn) {
    if (this.sort() === column) {
      this.patch({ dir: this.dir() === 'asc' ? 'desc' : 'asc', page: null });
    } else {
      this.patch({ sort: column, dir: 'asc', page: null });
    }
  }

  protected ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sort() !== column) {
      return 'none';
    }
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  protected isSorted(column: SortColumn): boolean {
    return this.sort() === column;
  }

  protected goToPage(page: number) {
    const target = Math.min(Math.max(1, page), this.totalPages());
    this.patch({ page: target === 1 ? null : target });
  }

  protected toggleExpand(id: number) {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected raritySlug(rarity: string): string {
    return rarity.toLowerCase().replace(/\s+/g, '-');
  }

  protected readonly columns = SORT_COLUMNS;
}
