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
    active: 1,
    itemDescription: null,
    itemDescriptionSource: null,
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
        provideRouter(
          [{ path: 'market', component: MarketComponent }],
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

  it('forgives word order, punctuation and typos in the search', async () => {
    await render([
      makeItem({ itemID: 1, itemName: 'Armor, +1: Studded Leather' }),
      makeItem({ itemID: 2, itemName: 'Armor, +2: Studded Leather' }),
      makeItem({ itemID: 3, itemName: 'Cloak of Protection' }),
    ]);

    const search: HTMLInputElement = el.querySelector('.market-filters__input')!;
    search.value = 'studed leather +1';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();

    expect(rowNames()).toEqual(['Armor, +1: Studded Leather']);
  });

  it('applies the search from a shared URL', async () => {
    await render(
      [
        makeItem({ itemID: 1, itemName: 'Armor, +1: Studded Leather' }),
        makeItem({ itemID: 2, itemName: 'Bag of Holding' }),
      ],
      '/market?q=Armor,%20%2B1:%20Studded',
    );

    expect(rowNames()).toEqual(['Armor, +1: Studded Leather']);
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

  describe('cost column', () => {
    const priced = () => [
      makeItem({ itemID: 1, itemName: 'Cheap', itemRarity: 'Rare', itemCost: 500 }),
      makeItem({ itemID: 2, itemName: 'Pricey', itemRarity: 'Legendary', itemCost: 200000 }),
      makeItem({ itemID: 3, itemName: 'Zed Artifact', itemRarity: 'Artifact', itemCost: 0 }),
      makeItem({ itemID: 4, itemName: 'Alpha Artifact', itemRarity: 'Artifact', itemCost: 0 }),
    ];

    it('sorts priceless Artifacts last ascending, ties by name', async () => {
      await render(priced(), '/market?sort=itemCost&dir=asc');
      expect(rowNames()).toEqual(['Cheap', 'Pricey', 'Alpha Artifact', 'Zed Artifact']);
    });

    it('sorts priceless Artifacts first descending, ties by name descending', async () => {
      await render(priced(), '/market?sort=itemCost&dir=desc');
      expect(rowNames()).toEqual(['Zed Artifact', 'Alpha Artifact', 'Pricey', 'Cheap']);
    });

    it('shows Priceless, not 0 or gp, in the table and the card', async () => {
      await render([priced()[2], priced()[1]]);

      const cells = [...el.querySelectorAll('.market-table__row .market-table__cost')].map((c) =>
        c.textContent!.trim(),
      );
      expect(cells).toEqual(['200,000', 'Priceless']);

      const cards = [...el.querySelectorAll('.market-card__cost')].map((c) =>
        c.textContent!.trim(),
      );
      expect(cards).toEqual(['200,000 gp', 'Priceless']);
    });
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

    const raritySelect = el.querySelectorAll<HTMLSelectElement>('.market-filters select')[0];
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

    const nameHeader = el.querySelectorAll<HTMLButtonElement>('thead .market-table__sortbtn')[0];
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

    expect(el.textContent).toContain('No magic items match');

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

  it('expands a row to show the rules description and its source', async () => {
    await render([
      makeItem({
        itemID: 8,
        itemShopkeeperDesc: '',
        itemVisualDesc: '',
        itemDescription: 'While wearing this ring you have advantage on Dexterity saves.',
        itemDescriptionSource: 'SRD 5.2.1, CC-BY-4.0',
      }),
    ]);

    const expand: HTMLButtonElement = el.querySelector('.market-table__expand')!;
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expand.click();
    harness.detectChanges();

    const details = el.querySelector('.market-table__details')!;
    expect(details.textContent).toContain('advantage on Dexterity saves');
    expect(details.querySelector('.provenance')).toBeNull();
    expect(details.querySelector('a')).toBeNull();
    // Cost/type/source stay in the row; the description is not suppressed by that.
    expect(details.querySelector('dl')).toBeNull();
    // The toggle stays the focus target and points at the panel it controls.
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(expand.getAttribute('aria-controls')).toBe(details.querySelector('td')!.id);
  });

  it('never leaves an expanded row empty, even with no text at all', async () => {
    await render([
      makeItem({
        itemID: 9,
        itemShopkeeperDesc: '',
        itemVisualDesc: '',
        itemRestrictions: null,
      }),
    ]);

    (el.querySelector('.market-table__expand') as HTMLButtonElement).click();
    harness.detectChanges();

    const details = el.querySelector('.market-table__details')!;
    expect(details.textContent).toContain('No description available for this item yet.');
    // The name already links to the item, so the panel adds no second link.
    expect(details.querySelector('a')).toBeNull();
  });

  describe('D&D Beyond links', () => {
    const BEYOND = 'https://www.dndbeyond.com/magic-items/test-item';
    const beyondLinks = (root: ParentNode) => root.querySelectorAll(`a[href*="dndbeyond.com"]`);
    const variants = [
      ['with a description', { itemDescription: 'Rules.', itemDescriptionSource: 'D&D Beyond' }],
      ['with only flavour text', {}],
      [
        'with nothing to show',
        { itemShopkeeperDesc: '', itemVisualDesc: '', itemRestrictions: null },
      ],
    ] as const;

    it.each(variants)('table row: the name is the only link %s', async (_label, overrides) => {
      await render([makeItem({ itemID: 30, itemUrl: BEYOND, ...overrides })]);
      (el.querySelector('.market-table__expand') as HTMLButtonElement).click();
      harness.detectChanges();

      const row = el.querySelector('.market-table__row')!;
      const details = el.querySelector('.market-table__details')!;
      expect(beyondLinks(row)).toHaveLength(1);
      expect(row.querySelector('.market-table__name a')).toBe(beyondLinks(row)[0]);
      expect(beyondLinks(details)).toHaveLength(0);
    });

    it.each(variants)('mobile card: exactly one link %s', async (_label, overrides) => {
      await render([makeItem({ itemID: 31, itemUrl: BEYOND, ...overrides })]);
      const card = el.querySelector('.market-card')!;
      expect(beyondLinks(card)).toHaveLength(0);

      (el.querySelector('.market-card__head') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(beyondLinks(card)).toHaveLength(1);
      expect(beyondLinks(el.querySelector('.market-card__body')!)).toHaveLength(1);
    });
  });

  it('expands a mobile card to show the same description', async () => {
    await render([
      makeItem({
        itemID: 10,
        itemShopkeeperDesc: '',
        itemVisualDesc: '',
        itemDescription: 'First paragraph.\nSecond paragraph.',
        itemDescriptionSource: 'D&D Beyond',
      }),
    ]);
    expect(el.querySelector('.market-card__body')).toBeNull();

    const head: HTMLButtonElement = el.querySelector('.market-card__head')!;
    head.click();
    harness.detectChanges();

    const body = el.querySelector('.market-card__body')!;
    expect(body.querySelector('.description__text')!.textContent).toBe(
      'First paragraph.\nSecond paragraph.',
    );
    expect(body.querySelector('.provenance')!.textContent).toMatch(/Description:\s+D&D Beyond/);
    expect(body.textContent).toContain('Attunement');
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(head.getAttribute('aria-controls')).toBe(body.id);

    head.click();
    harness.detectChanges();
    expect(el.querySelector('.market-card__body')).toBeNull();
  });

  it('expands a mobile card with nothing to show to a fallback, not an empty body', async () => {
    await render([
      makeItem({ itemID: 11, itemShopkeeperDesc: '', itemVisualDesc: '', itemRestrictions: null }),
    ]);
    (el.querySelector('.market-card__head') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('.market-card__body')!.textContent).toContain(
      'No description available for this item yet.',
    );
  });

  it('never lists rows the API marks inactive', async () => {
    await render([
      makeItem({ itemID: 1, itemName: 'Live Item', active: 1 }),
      makeItem({ itemID: 2, itemName: 'Retired Item', active: 0 }),
    ]);
    expect(rowNames()).toEqual(['Live Item']);
    expect(el.textContent).toContain('Showing 1–1 of 1 items');
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

    expect(el.textContent).toContain('The Market is unreachable');

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
