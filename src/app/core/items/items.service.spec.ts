import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Item, ItemsService } from './items.service';

const item = { itemID: 1, itemName: 'Bag of Holding' } as Item;

describe('ItemsService', () => {
  let service: ItemsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ItemsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should map the results array from the API response', () => {
    let received: Item[] | undefined;
    service.getItems().subscribe((items) => (received = items));

    httpMock.expectOne('/api/items').flush({ success: true, results: [item] });

    expect(received).toEqual([item]);
  });

  it('should cache the catalog and reuse it for later subscribers', () => {
    let first: Item[] | undefined;
    let second: Item[] | undefined;

    service.getItems().subscribe((items) => (first = items));
    httpMock.expectOne('/api/items').flush({ success: true, results: [item] });

    // No new request may be issued for the second subscription.
    service.getItems().subscribe((items) => (second = items));
    httpMock.expectNone('/api/items');

    expect(first).toEqual([item]);
    expect(second).toEqual([item]);
  });

  it('should retry the request after a failure instead of caching the error', () => {
    let failed = false;
    service.getItems().subscribe({ error: () => (failed = true) });
    httpMock
      .expectOne('/api/items')
      .flush({ success: false }, { status: 500, statusText: 'Server Error' });
    expect(failed).toBe(true);

    let received: Item[] | undefined;
    service.getItems().subscribe((items) => (received = items));
    httpMock.expectOne('/api/items').flush({ success: true, results: [item] });

    expect(received).toEqual([item]);
  });
});
