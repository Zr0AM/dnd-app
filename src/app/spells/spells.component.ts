import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toText, oneOf, sortedUnique } from '../core/browse/browse-params';
import { GameDataService, SpellListRow } from '../core/game-data/game-data.service';
import { formatSpellLevel, splitList } from '../core/game-data/game-format';
import { matchesSearch, toSearchText } from '../core/game-data/spell-search';
import { BrowseList } from '../shared/browse/browse-list';
import { BrowseSkeleton } from '../shared/browse/browse-skeleton';
import { ExpandToggle } from '../shared/browse/expand-toggle';
import { LoadError } from '../shared/browse/load-error';
import { NoResults } from '../shared/browse/no-results';
import { SearchBox } from '../shared/browse/search-box';
import { SortButton } from '../shared/browse/sort-button';
import { Icon } from '../shared/icon/icon';
import { Pager } from '../shared/pager/pager';
import { SpellDetails } from './spell-details';

type SortColumn = 'spellName' | 'spellLevel' | 'schoolName';
type FilterKey = 'level' | 'school' | 'spellClass' | 'concentration';

const SORT_COLUMNS: readonly SortColumn[] = ['spellName', 'spellLevel', 'schoolName'];

function compareSpells(a: SpellListRow, b: SpellListRow, column: SortColumn): number {
  const result =
    column === 'spellLevel' ? a.spellLevel - b.spellLevel : a[column].localeCompare(b[column]);
  // Tie-break by name so equal-valued rows keep a predictable order.
  return result !== 0 ? result : a.spellName.localeCompare(b.spellName);
}

@Component({
  selector: 'app-spells',
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
    SpellDetails,
  ],
  templateUrl: './spells.component.html',
  styleUrl: '../shared/browse/browse.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpellsComponent extends BrowseList<SpellListRow, SortColumn, FilterKey> {
  private readonly data = inject(GameDataService);

  protected readonly catalog = this.data.spells;
  protected readonly filterKeys: readonly FilterKey[] = [
    'level',
    'school',
    'spellClass',
    'concentration',
  ];

  readonly level = input('', { transform: toText });
  readonly school = input('', { transform: toText });
  readonly spellClass = input('', { transform: toText });
  readonly concentration = input(false, { transform: (v: string | undefined) => v === 'true' });
  readonly sort = input('spellName', { transform: oneOf(SORT_COLUMNS, 'spellName') });

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

  protected compare(a: SpellListRow, b: SpellListRow, column: SortColumn): number {
    return compareSpells(a, b, column);
  }

  protected setConcentration(checked: boolean) {
    this.setFilter('concentration', checked ? 'true' : '');
  }

  protected readonly formatSpellLevel = formatSpellLevel;
  protected readonly columns = SORT_COLUMNS;
  protected readonly columnLabels: Record<SortColumn, string> = {
    spellName: 'Name',
    spellLevel: 'Level',
    schoolName: 'School',
  };
}
