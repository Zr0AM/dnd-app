import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toText, oneOf, sortedUnique } from '../core/browse/browse-params';
import { Item, ItemsService, raritySlug } from '../core/items/items.service';
import { compareCost, formatCost, formatCostGp } from '../core/items/item-cost';
import { matchesSearch, toSearchText } from '../core/items/item-search';
import { BrowseList } from '../shared/browse/browse-list';
import { Icon } from '../shared/icon/icon';
import { Skeleton } from '../shared/skeleton/skeleton';
import { EmptyState } from '../shared/empty-state/empty-state';
import { ItemDetails } from '../shared/item-details/item-details';

type SortColumn = 'itemName' | 'itemType' | 'itemRarity' | 'itemCost' | 'itemSource';
type FilterKey = 'rarity' | 'type' | 'attunement';

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

function compareItems(a: Item, b: Item, column: SortColumn): number {
  let result: number;
  switch (column) {
    case 'itemCost':
      result = compareCost(a.itemCost, b.itemCost);
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
  imports: [DecimalPipe, Icon, Skeleton, EmptyState, ItemDetails],
  templateUrl: './market-component.html',
  styleUrl: './market-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketComponent extends BrowseList<Item, SortColumn, FilterKey> {
  private readonly itemsService = inject(ItemsService);

  protected readonly pageSizes = [10, 25, 50];
  protected readonly catalog = this.itemsService.catalog;
  protected readonly filterKeys: readonly FilterKey[] = ['rarity', 'type', 'attunement'];

  readonly rarity = input('', { transform: toText });
  readonly type = input('', { transform: toText });
  readonly attunement = input('', { transform: toText });
  readonly sort = input('itemName', { transform: oneOf(SORT_COLUMNS, 'itemName') });

  // Dropdown options derive from the data, so new rarities/types/attunement
  // values appear without code changes.
  protected readonly rarityOptions = computed(() =>
    [...new Set(this.items().map((i) => i.itemRarity))].sort(
      (a, b) => (RARITY_RANK[a] ?? 99) - (RARITY_RANK[b] ?? 99),
    ),
  );
  protected readonly typeOptions = computed(() =>
    sortedUnique(this.items().map((i) => i.itemType)),
  );
  protected readonly attunementOptions = computed(() =>
    sortedUnique(this.items().map((i) => i.itemAttunement)),
  );

  protected readonly hasActiveFilters = computed(
    () => !!(this.searchDraft().trim() || this.rarity() || this.type() || this.attunement()),
  );

  // Names are normalized once per catalog load, not on every keystroke.
  private readonly searchIndex = computed(() =>
    this.items().map((item) => ({ item, name: toSearchText(item.itemName) })),
  );

  protected readonly filtered = computed(() => {
    const query = toSearchText(this.searchDraft());
    const rarity = this.rarity();
    const type = this.type();
    const attunement = this.attunement();
    return this.searchIndex()
      .filter(
        ({ item, name }) =>
          matchesSearch(name, query) &&
          (!rarity || item.itemRarity === rarity) &&
          (!type || item.itemType === type) &&
          (!attunement || item.itemAttunement === attunement),
      )
      .map(({ item }) => item);
  });

  protected compare(a: Item, b: Item, column: SortColumn): number {
    return compareItems(a, b, column);
  }

  protected readonly raritySlug = raritySlug;
  protected readonly formatCost = formatCost;
  protected readonly formatCostGp = formatCostGp;

  protected readonly columns = SORT_COLUMNS;
}
