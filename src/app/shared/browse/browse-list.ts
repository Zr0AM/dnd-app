import { Directive, Signal, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import { toDirection, toPageSize, toPositiveInt, toText } from '../../core/browse/browse-params';
import { SortState } from './sort-button';

type QueryParams = Record<string, string | number | null>;

interface Catalog<T> {
  readonly value: Signal<readonly T[]>;
  reload(): unknown;
}

// Shared state for the catalog screens: URL-synced search, sorting and paging
// over a client-side list. Subclasses supply the catalog, the filter params
// they own, the `sort` input and how rows are filtered and compared.
@Directive()
export abstract class BrowseList<T, C extends string, F extends string> {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected abstract readonly catalog: Catalog<T>;
  // URL params reset by "Clear filters" (the search `q` is always cleared).
  protected abstract readonly filterKeys: readonly F[];
  protected abstract readonly filtered: Signal<readonly T[]>;
  abstract readonly sort: Signal<C>;
  protected abstract compare(a: T, b: T, column: C): number;

  // ---- URL-synced state (query params bound via withComponentInputBinding) --
  // Absent query params arrive as `undefined`, so every input coerces back to a
  // sane default and rejects malformed values from hand-edited URLs.
  readonly q = input('', { transform: toText });
  readonly dir = input('asc', { transform: toDirection });
  readonly page = input(1, { transform: toPositiveInt });
  readonly size = input(25, { transform: toPageSize });

  // Local draft for the search box: instant to type into, resets when the URL
  // changes (shared links, back/forward), and is debounced back into the URL.
  protected readonly searchDraft = linkedSignal(() => this.q());

  protected readonly expandedId = signal<number | null>(null);

  protected readonly items = computed(() => this.catalog.value());

  protected readonly sorted = computed(() => {
    const column = this.sort();
    const dir = this.dir() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((a, b) => dir * this.compare(a, b, column));
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

  protected patch(params: QueryParams) {
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

  protected setFilter(key: F, value: string) {
    this.patch({ [key]: value || null, page: null });
  }

  protected setPageSize(size: number) {
    this.patch({ size, page: null });
  }

  protected clearFilters() {
    this.searchDraft.set('');
    const cleared: QueryParams = { q: null, page: null };
    for (const key of this.filterKeys) {
      cleared[key] = null;
    }
    this.patch(cleared);
  }

  protected sortBy(column: C) {
    if (this.sort() === column) {
      this.patch({ dir: this.dir() === 'asc' ? 'desc' : 'asc', page: null });
    } else {
      this.patch({ sort: column, dir: 'asc', page: null });
    }
  }

  protected ariaSort(column: C): SortState {
    if (this.sort() !== column) {
      return 'none';
    }
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  protected isSorted(column: C): boolean {
    return this.sort() === column;
  }

  protected goToPage(page: number) {
    const target = Math.min(Math.max(1, page), this.totalPages());
    this.patch({ page: target === 1 ? null : target });
  }

  protected toggleExpand(id: number) {
    this.expandedId.update((current) => (current === id ? null : id));
  }
}
