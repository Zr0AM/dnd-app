import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  let component: MarketComponent;
  let fixture: ComponentFixture<MarketComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushItems(items: Item[]) {
    httpMock.expectOne('/api/items').flush({ success: true, results: items });
    fixture.detectChanges();
  }

  function rowNames(): string[] {
    return [...fixture.nativeElement.querySelectorAll('tbody tr:not(.market-table__details) td:nth-child(2)')].map(
      (cell) => (cell as HTMLElement).textContent!.trim(),
    );
  }

  it('should create', () => {
    expect(component).toBeTruthy();
    httpMock.expectOne('/api/items');
  });

  it('should render the catalog sorted by name', () => {
    flushItems([
      makeItem({ itemID: 1, itemName: 'Zephyr Blade' }),
      makeItem({ itemID: 2, itemName: 'Amulet of Health' }),
    ]);

    expect(rowNames()).toEqual(['Amulet of Health', 'Zephyr Blade']);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–2 of 2 items');
  });

  it('should filter by name search', () => {
    flushItems([
      makeItem({ itemID: 1, itemName: 'Bag of Holding' }),
      makeItem({ itemID: 2, itemName: 'Cloak of Protection' }),
    ]);

    const search: HTMLInputElement = fixture.nativeElement.querySelector('.market-filters__search');
    search.value = 'cloak';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Cloak of Protection']);
  });

  it('should filter by rarity', () => {
    flushItems([
      makeItem({ itemID: 1, itemName: 'Common Thing', itemRarity: 'Common' }),
      makeItem({ itemID: 2, itemName: 'Rare Thing', itemRarity: 'Rare' }),
    ]);

    const raritySelect: HTMLSelectElement =
      fixture.nativeElement.querySelectorAll('.market-filters select')[0];
    raritySelect.value = 'Rare';
    raritySelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Rare Thing']);
  });

  it('should sort rarity by tier rather than alphabetically', () => {
    flushItems([
      makeItem({ itemID: 1, itemName: 'A', itemRarity: 'Rare' }),
      makeItem({ itemID: 2, itemName: 'B', itemRarity: 'Uncommon' }),
      makeItem({ itemID: 3, itemName: 'C', itemRarity: 'Common' }),
    ]);

    const rarityHeader: HTMLButtonElement =
      fixture.nativeElement.querySelectorAll('thead button')[2];
    rarityHeader.click();
    fixture.detectChanges();

    // Tier order: Common < Uncommon < Rare (alphabetical would put Rare second).
    expect(rowNames()).toEqual(['C', 'B', 'A']);
  });

  it('should toggle sort direction when the same header is clicked twice', () => {
    flushItems([
      makeItem({ itemID: 1, itemName: 'Aaa' }),
      makeItem({ itemID: 2, itemName: 'Zzz' }),
    ]);

    const nameHeader: HTMLButtonElement = fixture.nativeElement.querySelectorAll('thead button')[0];
    nameHeader.click();
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Zzz', 'Aaa']);
  });

  it('should paginate and reset to the first page when filters change', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ itemID: i + 1, itemName: `Item ${String(i + 1).padStart(2, '0')}` }),
    );
    flushItems(items);

    expect(rowNames().length).toBe(25);
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 2');

    const next: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Next page"]');
    next.click();
    fixture.detectChanges();

    expect(rowNames().length).toBe(5);
    expect(fixture.nativeElement.textContent).toContain('Showing 26–30 of 30 items');

    // Changing a filter must jump back to page 1.
    const search: HTMLInputElement = fixture.nativeElement.querySelector('.market-filters__search');
    search.value = 'Item';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Page 1 of 2');
    expect(rowNames().length).toBe(25);
  });

  it('should change the page size', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ itemID: i + 1, itemName: `Item ${i + 1}` }),
    );
    flushItems(items);

    const pageSize: HTMLSelectElement =
      fixture.nativeElement.querySelector('.market-pagination select');
    pageSize.value = '10';
    pageSize.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(rowNames().length).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 3');
  });

  it('should show an empty state and clear filters', () => {
    flushItems([makeItem({ itemID: 1, itemName: 'Bag of Holding' })]);

    const search: HTMLInputElement = fixture.nativeElement.querySelector('.market-filters__search');
    search.value = 'no such item';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No items match your filters');

    const clear: HTMLButtonElement = fixture.nativeElement.querySelector('.market-filters__clear');
    clear.click();
    fixture.detectChanges();

    expect(rowNames()).toEqual(['Bag of Holding']);
  });

  it('should expand a row to show shopkeeper details', () => {
    flushItems([makeItem({ itemID: 7, itemShopkeeperDesc: 'Only the finest adamantine.' })]);

    const expand: HTMLButtonElement = fixture.nativeElement.querySelector('.market-table__expand');
    expand.click();
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('.market-table__details');
    expect(details.textContent).toContain('Only the finest adamantine.');

    expand.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.market-table__details')).toBeNull();
  });

  it('should show an error state and retry on demand', () => {
    httpMock
      .expectOne('/api/items')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load items');

    const retry: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.market-status--error button',
    );
    retry.click();
    fixture.detectChanges();

    flushItems([makeItem({ itemID: 1, itemName: 'Bag of Holding' })]);
    expect(rowNames()).toEqual(['Bag of Holding']);
  });
});
