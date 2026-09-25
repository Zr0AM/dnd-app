import { Injectable } from '@angular/core';
import { httpResource } from '@angular/common/http';

export interface Item {
  itemID: number;
  itemName: string;
  itemRarity: string;
  itemCost: number;
  itemType: string;
  itemRestrictions: string;
  itemAttunement: string;
  itemSource: string;
  itemUrl: string;
  itemVisualDesc: string;
  itemShopkeeperDesc: string;
}

interface ItemsResponse {
  success: boolean;
  results: Item[];
}

@Injectable({ providedIn: 'root' })
export class ItemsService {
  // A single, app-wide reactive resource: the catalog is fetched once when
  // first read and shared with every consumer. `.reload()` re-fetches on demand
  // (e.g. after an error). Filtering/sorting/paging happen client-side on this.
  readonly catalog = httpResource<Item[]>(() => '/api/items', {
    parse: (raw) => (raw as ItemsResponse).results ?? [],
    defaultValue: [],
  });
}
