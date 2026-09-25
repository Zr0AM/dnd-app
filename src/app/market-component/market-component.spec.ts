import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarketComponent } from './market-component';
import { Item } from '../core/items/items.service';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    itemID: 1,
    itemName: 'Test Item',
    itemRarity: 'Common',
    itemCost: 100,
    itemType: 'Armor',
    itemRestrictions: 'None',
    itemAttunement: 'No',
    itemSource: 'Dungeon Master’s Guide',
    itemUrl: 'https://example.com/item',
    itemVisualDesc: 'Shiny.',
    itemShopkeeperDesc: 'A fine piece of work, this one.',
    ...overrides,
  };
}

describe('MarketComponent', () => {
  let httpMock: HttpTestingController;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'market', component: MarketComponent }], withComponentInputBinding()),
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

  // Navigate to `url`, then flush the single catalog request and render.
  async function render(items: Item[], url = '/market') {
    harness = await RouterTestingHarness.create(url);
    TestBed.tick();
    httpMock.expectOne('/api/items').flush({ success: true, results: items });
    await stable();
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  function rowNames(): string[] {
    return [...el.querySelectorAll('.market-table__row .market-table__name')].map((cell) =>
      (cell as HTMLElement).textContent!.trim(),
    );
  }

  it('renders the catalog sorted by name', async () => {
    await render([
      makeItem({ itemID: 1, itemName: 'Zephyr Blade' }),
      makeItem({ itemID: 2, itemName: 'Amulet of Health' }),
    ]);

    expect(rowNames()).toEqual(['Amulet of Health', 'Zephyr Blade']);
    expect(el.textContent).toContain('Showing 1–2 of 2 items');
  });

  it('filters by name search instantly', async () => {
    await render([
      makeItem({ itemID: 1, itemName: 'Bag of Holding' }),
      makeItem({ itemID: 2, itemName: 'Cloak of Protection' }),
    ]);

    const search: HTMLInputElement = el.querySelector('.market-filters__input')!;
    search.value = 'cloak';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();

    expect(rowNames()).toEqual(['Cloak of Protection']);
  });

  it('reflects the rarity filter carried in the URL', async () => {
    await render(
      [
        makeItem({ itemID: 1, itemName: 'Common Thing', itemRarity: 'Common' }),
        makeItem({ itemID: 2, itemName: 'Rare Thing', itemRarity: 'Rare' }),
      ],
      '/market?rarity=Rare',
    );

    expect(rowNames()).toEqual(['Rare Thing']);
  });

  it('sorts rarity by tier when the URL requests it', async () => {
    await render(
      [
        makeItem({ itemID: 1, itemName: 'A', itemRarity: 'Rare' }),
        makeItem({ itemID: 2, itemName: 'B', itemRarity: 'Uncommon' }),
        makeItem({ itemID: 3, itemName: 'C', itemRarity: 'Common' }),
      ],
      '/market?sort=itemRarity&dir=asc',
    );

    // Tier order: Common < Uncommon < Rare (alphabetical would put Rare second).
    expect(rowNames()).toEqual(['C', 'B', 'A']);
  });

  it('applies a descending name sort from the URL', async () => {
    await render(
      [makeItem({ itemID: 1, itemName: 'Aaa' }), makeItem({ itemID: 2, itemName: 'Zzz' })],
      '/market?sort=itemName&dir=desc',
    );

    expect(rowNames()).toEqual(['Zzz', 'Aaa']);
  });

  it('paginates from the URL and reports the range', async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ itemID: i + 1, itemName: `Item ${String(i + 1).padStart(2, '0')}` }),
    );
    await render(items, '/market?page=2');

    expect(rowNames()).toHaveLength(5);
    expect(el.textContent).toContain('Showing 26–30 of 30 items');
  });

  it('honours the page size from the URL', async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ itemID: i + 1, itemName: `Item ${String(i + 1).padStart(2, '0')}` }),
    );
    await render(items, '/market?size=10');

    expect(rowNames()).toHaveLength(10);
    expect(el.textContent).toContain('Page 1 of 3');
  });

  it('pushes control changes into the URL and resets the page', async () => {
    await render(
      [
        makeItem({ itemID: 1, itemName: 'Common Thing', itemRarity: 'Common' }),
        makeItem({ itemID: 2, itemName: 'Rare Thing', itemRarity: 'Rare' }),
      ],
      '/market?page=2',
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    const raritySelect: HTMLSelectElement = el.querySelectorAll('.market-filters select')[0];
    raritySelect.value = 'Rare';
    raritySelect.dispatchEvent(new Event('change'));

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ rarity: 'Rare', page: null }),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }),
    );
  });

  it('toggles the sort direction via the header control', async () => {
    await render([makeItem({ itemID: 1, itemName: 'Aaa' })], '/market?sort=itemName&dir=asc');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    const nameHeader: HTMLButtonElement = el.querySelectorAll('thead .market-table__sortbtn')[0];
    nameHeader.click();

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ dir: 'desc' }) }),
    );
  });

  it('shows an empty state and clears filters', async () => {
    await render([makeItem({ itemID: 1, itemName: 'Bag of Holding' })]);

    const search: HTMLInputElement = el.querySelector('.market-filters__input')!;
    search.value = 'no such item';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();

    expect(el.textContent).toContain('No treasures match');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const clearBtn = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Clear filters'),
    ) as HTMLButtonElement;
    clearBtn.click();

    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ q: null, rarity: null, type: null }),
      }),
    );
  });

  it('expands a row to show shopkeeper details', async () => {
    await render([makeItem({ itemID: 7, itemShopkeeperDesc: 'Only the finest adamantine.' })]);

    const expand: HTMLButtonElement = el.querySelector('.market-table__expand')!;
    expand.click();
    harness.detectChanges();

    const details = el.querySelector('.market-table__details');
    expect(details!.textContent).toContain('Only the finest adamantine.');

    expand.click();
    harness.detectChanges();
    expect(el.querySelector('.market-table__details')).toBeNull();
  });

  it('shows an error state and retries on demand', async () => {
    harness = await RouterTestingHarness.create('/market');
    TestBed.tick();
    httpMock
      .expectOne('/api/items')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });
    await stable();
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;

    expect(el.textContent).toContain('The ledger is unreachable');

    const retry = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Try again'),
    ) as HTMLButtonElement;
    retry.click();
    TestBed.tick();
    httpMock
      .expectOne('/api/items')
      .flush({ success: true, results: [makeItem({ itemID: 1, itemName: 'Bag of Holding' })] });
    await stable();
    harness.detectChanges();

    expect(rowNames()).toEqual(['Bag of Holding']);
  });
});
