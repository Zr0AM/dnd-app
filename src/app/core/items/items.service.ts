import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

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

export interface ItemQuery {
  sortBy?: keyof Item;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface ItemsResponse {
  success: boolean;
  results: Item[];
}

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly http = inject(HttpClient);

  getItems(query: ItemQuery = {}): Observable<Item[]> {
    let params = new HttpParams();
    if (query.sortBy) {
      params = params.set('sort_by', query.sortBy).set('order', query.order ?? 'asc');
    }
    if (query.limit != null) {
      params = params.set('limit', query.limit);
    }
    if (query.offset != null) {
      params = params.set('offset', query.offset);
    }

    return this.http
      .get<ItemsResponse>('/api/items', { params })
      .pipe(map((res) => res.results ?? []));
  }
}
