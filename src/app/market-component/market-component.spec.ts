import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarketComponent } from './market-component';
import { Item } from '../core/items/items.service';

const mockItems: Item[] = [
  {
    itemID: 1,
    itemName: 'Adamantine Armor (Chain Shirt)',
    itemRarity: 'Uncommon',
    itemCost: 450,
    itemType: 'Armor',
    itemRestrictions: 'Medium Armor Proficiency',
    itemAttunement: 'No',
    itemSource: 'Dungeon Master’s Guide',
    itemUrl: 'https://www.dndbeyond.com/magic-items/5370-adamantine-armor',
    itemVisualDesc: 'This chain shirt is reinforced with adamantine.',
    itemShopkeeperDesc: 'Forged with adamantine to protect your vital bits.',
  },
];

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

  it('should create', () => {
    expect(component).toBeTruthy();
    httpMock.expectOne((req) => req.url === '/api/items');
  });

  it('should show a loading state before items arrive', () => {
    expect(fixture.nativeElement.textContent).toContain('Loading items');
    httpMock.expectOne((req) => req.url === '/api/items');
  });

  it('should render items returned by the API', () => {
    const req = httpMock.expectOne((req) => req.url === '/api/items');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('sort_by')).toBe('itemName');

    req.flush({ success: true, results: mockItems });
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Adamantine Armor (Chain Shirt)');
    expect(fixture.nativeElement.textContent).toContain('1 items available');
  });

  it('should show an error state when the API call fails', () => {
    const req = httpMock.expectOne((req) => req.url === '/api/items');
    req.flush({ success: false, error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load items');
  });
});
