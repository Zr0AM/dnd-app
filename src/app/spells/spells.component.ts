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
import { GameDataService, SpellListRow } from '../core/game-data/game-data.service';
import { formatSpellLevel, splitList } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/game-data/spell-search';
import { EmptyState } from '../shared/empty-state/empty-state';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { Skeleton } from '../shared/skeleton/skeleton';
import { SpellDetails } from './spell-details';

type SortColumn = 'spellName' | 'spellLevel' | 'schoolName';

const SORT_COLUMNS: readonly SortColumn[] = ['spellName', 'spellLevel', 'schoolName'];

function compareSpells(a: SpellListRow, b: SpellListRow, column: SortColumn): number {
  const result =
    column === 'spellLevel' ? a.spellLevel - b.spellLevel : a[column].localeCompare(b[column]);
  // Tie-break by name so equal-valued rows keep a predictable order.
  return result !== 0 ? result : a.spellName.localeCompare(b.spellName);
}

@Component({
  selector: 'app-spells',
  imports: [DecimalPipe, Icon, Skeleton, EmptyState, Pager, SpellDetails],
  templateUrl: './spells.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpellsComponent {
  private readonly data = inject(GameDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly catalog = this.data.spells;

  // ---- URL-synced state (query params bound via withComponentInputBinding) --
  readonly q = input('', { transform: toText });
  readonly level = input('', { transform: toText });
  readonly school = input('', { transform: toText });
  readonly spellClass = input('', { transform: toText });
  readonly concentration = input(false, { transform: (v: string | undefined) => v === 'true' });
  readonly sort = input('spellName', { transform: oneOf(SORT_COLUMNS, 'spellName') });
  readonly dir = input('asc', { transform: toDirection });
  readonly page = input(1, { transform: toPositiveInt });
  readonly size = input(25, { transform: toPageSize });

  // Local draft for the search box: instant to type into, resets when the URL
  // changes (shared links, back/forward), and is debounced back into the URL.
  protected readonly searchDraft = linkedSignal(() => this.q());

  protected readonly expandedId = signal<number | null>(null);

  protected readonly items = computed(() => this.catalog.value());

  // Dropdown options derive from the data, so new schools or classes appear
  // without code changes.
  protected readonly levelOptions = computed(() =>
    [...new Set(this.items().map((s) => s.spellLevel))].sort((a, b) => a - b),
  );
  protected readonly schoolOptions = computed(() =>
    sortedUnique(this.items().map((s) => s.schoolName)),
  );
  protected readonly classOptions = computed(() =>
    sortedUnique(this.items().flatMap((s) => splitList(s.spellClasses, ','))),
  );

  protected readonly hasActiveFilters = computed(
    () =>
      !!(
        this.searchDraft().trim() ||
        this.level() ||
        this.school() ||
        this.spellClass() ||
        this.concentration()
      ),
  );

  // Names are normalized once per catalog load, not on every keystroke.
  private readonly searchIndex = computed(() =>
    this.items().map((spell) => ({
      spell,
      name: toSearchText(spell.spellName),
      classes: splitList(spell.spellClasses, ','),
    })),
  );

  protected readonly filtered = computed(() => {
    const query = toSearchText(this.searchDraft());
    const level = this.level();
    const school = this.school();
    const className = this.spellClass();
    const concentration = this.concentration();
    return this.searchIndex()
      .filter(
        ({ spell, name, classes }) =>
          matchesSearch(name, query) &&
          (!level || String(spell.spellLevel) === level) &&
          (!school || spell.schoolName === school) &&
          (!className || classes.includes(className)) &&
          (!concentration || spell.spellConcentration === 1),
      )
      .map(({ spell }) => spell);
  });

  protected readonly sorted = computed(() => {
    const column = this.sort();
    const dir = this.dir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * compareSpells(a, b, column));
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.sorted().length / this.size())),
  );
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

  protected setLevel(value: string) {
    this.patch({ level: value || null, page: null });
  }

  protected setSchool(value: string) {
    this.patch({ school: value || null, page: null });
  }

  protected setClass(value: string) {
    this.patch({ spellClass: value || null, page: null });
  }

  protected setConcentration(checked: boolean) {
    this.patch({ concentration: checked ? 'true' : null, page: null });
  }

  protected setPageSize(size: number) {
    this.patch({ size, page: null });
  }

  protected clearFilters() {
    this.searchDraft.set('');
    this.patch({
      q: null,
      level: null,
      school: null,
      spellClass: null,
      concentration: null,
      page: null,
    });
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

  protected readonly formatSpellLevel = formatSpellLevel;
  protected readonly columns = SORT_COLUMNS;
  protected readonly columnLabels: Record<SortColumn, string> = {
    spellName: 'Name',
    spellLevel: 'Level',
    schoolName: 'School',
  };
}
