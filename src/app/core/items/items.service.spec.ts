import { ApplicationRef } from '@angular/core';
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

  // The resource issues its request on the next application tick; flush the
  // testing backend, then await stability so the result propagates into signals.
  async function load(items: Item[], status?: { status: number; statusText: string }) {
    TestBed.tick();
    const req = httpMock.expectOne('/api/items');
    req.flush(status ? { success: false } : { success: true, results: items }, status);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('exposes an empty default before the request resolves', async () => {
    expect(service.catalog.value()).toEqual([]);
    await load([]);
  });

  it('parses the results array from the API response', async () => {
    await load([item]);
    expect(service.catalog.value()).toEqual([item]);
  });

  it('reports an error status when the request fails and can reload', async () => {
    await load([], { status: 500, statusText: 'Server Error' });
    expect(service.catalog.error()).toBeTruthy();

    service.catalog.reload();
    await load([item]);
    expect(service.catalog.value()).toEqual([item]);
  });
});
