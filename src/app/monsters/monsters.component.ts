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
import { GameDataService, MonsterListRow } from '../core/game-data/game-data.service';
import { splitList } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/game-data/monster-search';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { Skeleton } from '../shared/skeleton/skeleton';
import { MonsterDetails } from './monster-details';

type SortColumn = 'monsterName' | 'creatureTypeName' | 'crValue' | 'monsterAc' | 'monsterHpAvg';

const SORT_COLUMNS: readonly SortColumn[] = [
  'monsterName',
  'creatureTypeName',
  'crValue',
  'monsterAc',
  'monsterHpAvg',
];

// Sizes sort by physical size, not alphabetically.
const SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function compareMonsters(a: MonsterListRow, b: MonsterListRow, column: SortColumn): number {
  const result =
    column === 'creatureTypeName' || column === 'monsterName'
      ? a[column].localeCompare(b[column])
      : a[column] - b[column];
  // Tie-break by name so equal-valued rows keep a predictable order.
  return result !== 0 ? result : a.monsterName.localeCompare(b.monsterName);
}

@Component({
  selector: 'app-monsters',
  imports: [DecimalPipe, Icon, Skeleton, EmptyState, Pager, MonsterDetails],
  templateUrl: './monsters.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonstersComponent {
  private readonly data = inject(GameDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly catalog = this.data.monsters;

  // ---- URL-synced state (query params bound via withComponentInputBinding) --
  // `size` is the page size (as on the other screens), so the monster-size
  // filter uses the `creatureSize` param.
  readonly q = input('', { transform: toText });
  readonly type = input('', { transform: toText });
  readonly creatureSize = input('', { transform: toText });
  readonly cr = input('', { transform: toText });
  readonly sort = input('monsterName', {
    transform: oneOf(SORT_COLUMNS, 'monsterName'),
  });
  readonly dir = input('asc', { transform: toDirection });
  readonly page = input(1, { transform: toPositiveInt });
  readonly size = input(25, { transform: toPageSize });

  protected readonly searchDraft = linkedSignal(() => this.q());

  protected readonly expandedId = signal<number | null>(null);

  protected readonly items = computed(() => this.catalog.value());

  protected readonly typeOptions = computed(() =>
    sortedUnique(this.items().map((m) => m.creatureTypeName)),
  );
  protected readonly sizeOptions = computed(() =>
    [...new Set(this.items().flatMap((m) => splitList(m.monsterSizes, ' or ')))].sort(
      (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
    ),
  );
  protected readonly crOptions = computed(() => {
    const byValue = new Map(this.items().map((m) => [m.crValue, m.crLabel]));
    return [...byValue].sort((a, b) => a[0] - b[0]).map(([value, label]) => ({ value, label }));
  });

  protected readonly hasActiveFilters = computed(
    () => !!(this.searchDraft().trim() || this.type() || this.creatureSize() || this.cr()),
  );

  private readonly searchIndex = computed(() =>
    this.items().map((monster) => ({
      monster,
      name: toSearchText(monster.monsterName),
      sizes: splitList(monster.monsterSizes, ' or '),
    })),
  );

  protected readonly filtered = computed(() => {
    const query = toSearchText(this.searchDraft());
    const type = this.type();
    const size = this.creatureSize();
    const cr = this.cr();
    return this.searchIndex()
      .filter(
        ({ monster, name, sizes }) =>
          matchesSearch(name, query) &&
          (!type || monster.creatureTypeName === type) &&
          (!size || sizes.includes(size)) &&
          (!cr || String(monster.crValue) === cr),
      )
      .map(({ monster }) => monster);
  });

  protected readonly sorted = computed(() => {
    const column = this.sort();
    const dir = this.dir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * compareMonsters(a, b, column));
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

  protected setType(value: string) {
    this.patch({ type: value || null, page: null });
  }

  protected setCreatureSize(value: string) {
    this.patch({ creatureSize: value || null, page: null });
  }

  protected setCr(value: string) {
    this.patch({ cr: value || null, page: null });
  }

  protected setPageSize(size: number) {
    this.patch({ size, page: null });
  }

  protected clearFilters() {
    this.searchDraft.set('');
    this.patch({ q: null, type: null, creatureSize: null, cr: null, page: null });
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

  protected readonly columns = SORT_COLUMNS;
  protected readonly columnLabels: Record<SortColumn, string> = {
    monsterName: 'Name',
    creatureTypeName: 'Type',
    crValue: 'CR',
    monsterAc: 'AC',
    monsterHpAvg: 'HP',
  };
}
