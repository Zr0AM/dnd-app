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
import {
  toDirection,
  toPageSize,
  toPositiveInt,
  toText,
  oneOf,
  sortedUnique,
} from '../core/browse/browse-params';
import { EquipmentListRow, GameDataService } from '../core/game-data/game-data.service';
import { formatCp, formatWeight, titleCase } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/items/item-search';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { Skeleton } from '../shared/skeleton/skeleton';
import { EquipmentDetails } from './equipment-details';

type SortColumn = 'equipmentName' | 'equipmentKind' | 'costCp' | 'weightLb';

const SORT_COLUMNS: readonly SortColumn[] = [
  'equipmentName',
  'equipmentKind',
  'costCp',
  'weightLb',
];

// Rows with no price or weight sort after those that have one.
function compareEquipment(a: EquipmentListRow, b: EquipmentListRow, column: SortColumn): number {
  let result: number;
  if (column === 'costCp' || column === 'weightLb') {
    result = (a[column] ?? Infinity) - (b[column] ?? Infinity);
    if (Number.isNaN(result)) {
      result = 0;
    }
  } else {
    result = a[column].localeCompare(b[column]);
  }
  return result !== 0 ? result : a.equipmentName.localeCompare(b.equipmentName);
}

@Component({
  selector: 'app-equipment',
  imports: [DecimalPipe, Icon, Skeleton, EmptyState, Pager, EquipmentDetails],
  templateUrl: './equipment.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentComponent {
  private readonly data = inject(GameDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly catalog = this.data.equipment;

  // ---- URL-synced state (query params bound via withComponentInputBinding) --
  readonly q = input('', { transform: toText });
  readonly kind = input('', { transform: toText });
  readonly sort = input('equipmentName', {
    transform: oneOf(SORT_COLUMNS, 'equipmentName'),
  });
  readonly dir = input('asc', { transform: toDirection });
  readonly page = input(1, { transform: toPositiveInt });
  readonly size = input(25, { transform: toPageSize });

  protected readonly searchDraft = linkedSignal(() => this.q());

  protected readonly expandedId = signal<number | null>(null);

  protected readonly items = computed(() => this.catalog.value());

  protected readonly kindOptions = computed(() =>
    sortedUnique(this.items().map((e) => e.equipmentKind)),
  );

  protected readonly hasActiveFilters = computed(
    () => !!(this.searchDraft().trim() || this.kind()),
  );

  private readonly searchIndex = computed(() =>
    this.items().map((item) => ({ item, name: toSearchText(item.equipmentName) })),
  );

  protected readonly filtered = computed(() => {
    const query = toSearchText(this.searchDraft());
    const kind = this.kind();
    return this.searchIndex()
      .filter(
        ({ item, name }) => matchesSearch(name, query) && (!kind || item.equipmentKind === kind),
      )
      .map(({ item }) => item);
  });

  protected readonly sorted = computed(() => {
    const column = this.sort();
    const dir = this.dir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * compareEquipment(a, b, column));
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sorted().length / this.size())),
  );
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

  protected setKind(value: string) {
    this.patch({ kind: value || null, page: null });
  }

  protected setPageSize(size: number) {
    this.patch({ size, page: null });
  }

  protected clearFilters() {
    this.searchDraft.set('');
    this.patch({ q: null, kind: null, page: null });
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

  protected readonly formatCp = formatCp;
  protected readonly formatWeight = formatWeight;
  protected readonly titleCase = titleCase;
  protected readonly columns = SORT_COLUMNS;
  protected readonly columnLabels: Record<SortColumn, string> = {
    equipmentName: 'Name',
    equipmentKind: 'Kind',
    costCp: 'Cost',
    weightLb: 'Weight',
  };
}
