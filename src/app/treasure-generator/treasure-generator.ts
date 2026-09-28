import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ItemsService, raritySlug } from '../core/items/items.service';
import { DENOMS, toGp, toQueryParams } from '../core/coins/coins';
import { Icon } from '../shared/icon/icon';
import { EmptyState } from '../shared/empty-state/empty-state';
import { randomSeed, seededRng } from '../core/random/random';
import { CR_BANDS, MAX_CR, bandForCr, clampCr } from './hoard-tables';
import { Hoard, coinScale, rollHoard, sumGp } from './hoard';
import { formatHoardCode, parseHoardCode } from './hoard-code';

@Component({
  selector: 'app-treasure-generator',
  imports: [DecimalPipe, LowerCasePipe, RouterLink, Icon, EmptyState],
  templateUrl: './treasure-generator.html',
  styleUrl: './treasure-generator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasureGenerator {
  protected readonly catalog = inject(ItemsService).catalog;
  protected readonly raritySlug = raritySlug;
  protected readonly maxCr = MAX_CR;

  // Labelled marks where each DMG table begins, as a fraction of the track.
  protected readonly ticks = [...CR_BANDS.map((b) => b.minCr), MAX_CR].map((cr) => ({
    cr,
    frac: cr / MAX_CR,
  }));

  protected readonly selectedCr = signal(3);
  protected readonly selectedBand = computed(() => bandForCr(this.selectedCr()));
  protected readonly selectedScale = computed(() => coinScale(this.selectedCr()));

  protected readonly hoard = signal<Hoard | null>(null);
  protected readonly seed = signal<number | null>(null);
  protected readonly rollId = signal(0);

  protected readonly code = computed(() => {
    const h = this.hoard();
    const seed = this.seed();
    return h && seed !== null ? formatHoardCode(h.cr, seed) : '';
  });
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly replayError = signal('');
  private copyTimer?: ReturnType<typeof setTimeout>;
  private readonly codeEl = viewChild<ElementRef<HTMLElement>>('codeEl');

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
    const coinText = `Rolled ${h.itemRoll}: ${this.totalGp().toLocaleString()} gp in coin, gems and art`;
    const items = this.magicCount();
    if (!items) {
      return `${coinText}.`;
    }
    const noun = items === 1 ? 'item' : 'items';
    return `${coinText}, plus ${items} magic ${noun}.`;
  });

  protected setCr(value: number | string) {
    this.selectedCr.set(clampCr(Number(value)));
  }

  protected roll(seed = randomSeed()) {
    this.seed.set(seed);
    this.hoard.set(rollHoard(this.selectedCr(), this.catalog.value(), seededRng(seed)));
    this.rollId.update((n) => n + 1);
    this.copyState.set('idle');
  }

  protected replay(raw: string) {
    const parsed = parseHoardCode(raw);
    if (!parsed) {
      this.replayError.set('That doesn’t look like a hoard code — it should resemble CR13-1K3F9QX.');
      return;
    }
    this.replayError.set('');
    this.selectedCr.set(parsed.cr);
    this.roll(parsed.seed);
  }

  protected async copyCode() {
    clearTimeout(this.copyTimer);
    try {
      await navigator.clipboard.writeText(this.code());
      this.copyState.set('copied');
    } catch {
      // Clipboard can be blocked (permissions, insecure origin); pre-select
      // the code so a manual copy is one keystroke away.
      const el = this.codeEl()?.nativeElement;
      if (el) {
        getSelection()?.selectAllChildren(el);
      }
      this.copyState.set('failed');
    }
    this.copyTimer = setTimeout(() => this.copyState.set('idle'), 2000);
  }
}
