import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toText, oneOf, sortedUnique } from '../core/browse/browse-params';
import { EquipmentListRow, GameDataService } from '../core/game-data/game-data.service';
import { formatCp, formatWeight, titleCase } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/items/item-search';
import { BrowseList } from '../shared/browse/browse-list';
import { BrowseSkeleton } from '../shared/browse/browse-skeleton';
import { ExpandToggle } from '../shared/browse/expand-toggle';
import { LoadError } from '../shared/browse/load-error';
import { NoResults } from '../shared/browse/no-results';
import { SearchBox } from '../shared/browse/search-box';
import { SortButton } from '../shared/browse/sort-button';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { EquipmentDetails } from './equipment-details';

type SortColumn = 'equipmentName' | 'equipmentKind' | 'costCp' | 'weightLb';
type FilterKey = 'kind';

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
    EquipmentDetails,
  ],
  templateUrl: './equipment.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentComponent extends BrowseList<EquipmentListRow, SortColumn, FilterKey> {
  private readonly data = inject(GameDataService);

  protected readonly catalog = this.data.equipment;
  protected readonly filterKeys: readonly FilterKey[] = ['kind'];

  readonly kind = input('', { transform: toText });
  readonly sort = input('equipmentName', {
    transform: oneOf(SORT_COLUMNS, 'equipmentName'),
  });

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

  protected compare(a: EquipmentListRow, b: EquipmentListRow, column: SortColumn): number {
    return compareEquipment(a, b, column);
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
