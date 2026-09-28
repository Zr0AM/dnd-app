import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { items } from '../../dev/items.fixture';
import { LootSplitter } from '../loot-splitter/loot-splitter';
import { TreasureGenerator } from './treasure-generator';
import { Hoard } from './hoard';

const KNOWN_HOARD: Hoard = {
  band: 'cr0-4',
  itemRoll: 40,
  coins: { pp: 0, gp: 20, sp: 300, cp: 600 },
  gems: [{ name: 'Azurite', valueGp: 10, count: 2 }],
  art: [],
  magic: [
    { key: 'item-12', table: 'A', rarity: 'Common', item: items[11], count: 2 },
    { key: 'table-G', table: 'G', rarity: 'Rare', item: null, count: 1 },
  ],
};

describe('TreasureGenerator', () => {
  let httpMock: HttpTestingController;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'treasure', component: TreasureGenerator },
            { path: 'loot-splitter', component: LootSplitter },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const stable = () => TestBed.inject(ApplicationRef).whenStable();

  async function render(flush = true) {
    harness = await RouterTestingHarness.create('/treasure');
    TestBed.tick();
    if (flush) {
      httpMock.expectOne('/api/items').flush({ success: true, results: items });
      await stable();
    }
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  function rollButton(): HTMLButtonElement {
    return el.querySelector('.hoard-roll') as HTMLButtonElement;
  }

  function setHoard(hoard: Hoard) {
    const cmp = harness.routeDebugElement!.componentInstance as unknown as {
      hoard: { set(h: Hoard): void };
    };
    cmp.hoard.set(hoard);
    harness.detectChanges();
  }

  it('shows a sealed vault before the first roll', async () => {
    await render();
    expect(el.textContent).toContain('The vault is sealed');
    expect(el.querySelector('.hoard-result')).toBeNull();
  });

  it('disables rolling until the catalog has loaded', async () => {
    await render(false);
    expect(rollButton().disabled).toBe(true);
    expect(rollButton().textContent).toContain('Stocking the vault');
    httpMock.expectOne('/api/items').flush({ success: true, results: items });
    await stable();
    harness.detectChanges();
    expect(rollButton().disabled).toBe(false);
  });

  it('rolls a hoard for the selected challenge rating', async () => {
    await render();
    const band = el.querySelectorAll<HTMLInputElement>('input[name="cr-band"]')[3];
    band.click();
    harness.detectChanges();
    rollButton().click();
    harness.detectChanges();

    expect(el.querySelector('.hoard-result')).not.toBeNull();
    expect(el.querySelector('.hoard-result__head')?.textContent).toContain('CR 17+');
    // CR 17+ always yields gold and platinum.
    expect(el.querySelector('.coin--gold')).not.toBeNull();
    expect(el.querySelector('.coin--platinum')).not.toBeNull();
    expect(rollButton().textContent).toContain('Roll again');
  });

  it('totals coin, gems and art but lists magic items separately', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    // 600 cp + 300 sp + 20 gp = 56 gp, plus 2 × 10 gp gems.
    expect(el.querySelector('.hoard-total__value')?.textContent).toContain('76 gp');
    expect(el.querySelector('.hoard-total__sub')?.textContent).toContain('3 magic items');
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('2 × Azurite');
    expect(text).toContain('2 × Potion of Healing');
    expect(el.textContent).toContain('Potion of Healing');
    expect(el.textContent).toContain('Unnamed rare item');
    expect(el.textContent).toContain('Table G');
  });

  it('links catalog items to their market search', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    const link = el.querySelector('.hoard-list a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/market?q=Potion%20of%20Healing');
  });

  it('hands the coins to the loot splitter', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    const split = el.querySelector('.hoard-total a') as HTMLAnchorElement;
    expect(split.getAttribute('href')).toBe('/loot-splitter?gp=20&sp=300&cp=600');

    split.click();
    await stable();
    harness.detectChanges();
    const splitter = harness.routeNativeElement as HTMLElement;
    expect(splitter.querySelector('.loot-pool__value')?.textContent).toContain('56 gp');
  });
});
