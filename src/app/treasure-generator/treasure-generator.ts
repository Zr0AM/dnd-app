import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ItemsService, raritySlug } from '../core/items/items.service';
import { DENOMS, toGp, toQueryParams } from '../core/coins/coins';
import { Icon } from '../shared/icon/icon';
import { EmptyState } from '../shared/empty-state/empty-state';
import { CR_BANDS, CrBand } from './hoard-tables';
import { Hoard, rollHoard, sumGp } from './hoard';

@Component({
  selector: 'app-treasure-generator',
  imports: [DecimalPipe, LowerCasePipe, RouterLink, Icon, EmptyState],
  templateUrl: './treasure-generator.html',
  styleUrl: './treasure-generator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasureGenerator {
  protected readonly catalog = inject(ItemsService).catalog;
  protected readonly bands = CR_BANDS;
  protected readonly raritySlug = raritySlug;

  protected readonly selectedBand = signal<CrBand>(CR_BANDS[0]);
  protected readonly hoard = signal<Hoard | null>(null);
  protected readonly rollId = signal(0);

  protected readonly bandLabel = computed(
    () => CR_BANDS.find((b) => b.id === this.hoard()?.band)?.label ?? '',
  );

  protected readonly coinChips = computed(() => {
    const coins = this.hoard()?.coins;
    return coins
      ? DENOMS.filter((d) => coins[d.key] > 0).map((d) => ({ ...d, count: coins[d.key] }))
      : [];
  });

  protected readonly coinsGp = computed(() => {
    const h = this.hoard();
    return h ? toGp(h.coins) : 0;
  });
  protected readonly gemsGp = computed(() => sumGp(this.hoard()?.gems ?? []));
  protected readonly artGp = computed(() => sumGp(this.hoard()?.art ?? []));
  protected readonly totalGp = computed(() => this.coinsGp() + this.gemsGp() + this.artGp());

  protected readonly magicCount = computed(() =>
    (this.hoard()?.magic ?? []).reduce((n, m) => n + m.count, 0),
  );

  protected readonly onlyCoin = computed(() => {
    const h = this.hoard();
    return !!h && !h.gems.length && !h.art.length && !h.magic.length;
  });

  protected readonly splitParams = computed(() => {
    const h = this.hoard();
    return h ? toQueryParams(h.coins) : {};
  });

  protected readonly summary = computed(() => {
    const h = this.hoard();
    if (!h) {
      return '';
    }
    const items = this.magicCount();
    const magic = items ? `, plus ${items} magic item${items === 1 ? '' : 's'}` : '';
    return `Rolled ${h.itemRoll}: ${this.totalGp().toLocaleString()} gp in coin, gems and art${magic}.`;
  });

  protected roll() {
    this.hoard.set(rollHoard(this.selectedBand(), this.catalog.value()));
    this.rollId.update((n) => n + 1);
  }
}
