import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toText, oneOf, sortedUnique } from '../core/browse/browse-params';
import { GameDataService, MonsterListRow } from '../core/game-data/game-data.service';
import { splitList } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/game-data/monster-search';
import { BrowseList } from '../shared/browse/browse-list';
import { BrowseSkeleton } from '../shared/browse/browse-skeleton';
import { ExpandToggle } from '../shared/browse/expand-toggle';
import { LoadError } from '../shared/browse/load-error';
import { NoResults } from '../shared/browse/no-results';
import { SearchBox } from '../shared/browse/search-box';
import { SortButton } from '../shared/browse/sort-button';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { MonsterDetails } from './monster-details';

type SortColumn = 'monsterName' | 'creatureTypeName' | 'crValue' | 'monsterAc' | 'monsterHpAvg';
type FilterKey = 'type' | 'creatureSize' | 'cr';

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
  imports: [
    DecimalPipe,
    Icon,
    Pager,
    BrowseSkeleton,
    LoadError,
    NoResults,
    SearchBox,
    SortButton,
    ExpandToggle,
    MonsterDetails,
  ],
  templateUrl: './monsters.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonstersComponent extends BrowseList<MonsterListRow, SortColumn, FilterKey> {
  private readonly data = inject(GameDataService);

  protected readonly catalog = this.data.monsters;
  protected readonly filterKeys: readonly FilterKey[] = ['type', 'creatureSize', 'cr'];

  // `size` is the page size (as on the other screens), so the monster-size
  // filter uses the `creatureSize` param.
  readonly type = input('', { transform: toText });
  readonly creatureSize = input('', { transform: toText });
  readonly cr = input('', { transform: toText });
  readonly sort = input('monsterName', {
    transform: oneOf(SORT_COLUMNS, 'monsterName'),
  });

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

  protected compare(a: MonsterListRow, b: MonsterListRow, column: SortColumn): number {
    return compareMonsters(a, b, column);
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
