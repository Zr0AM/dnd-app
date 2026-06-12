import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, shareReplay, throwError } from 'rxjs';

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
  private readonly http = inject(HttpClient);
  private items$?: Observable<Item[]>;

  // Fetches the full catalog once and replays it to every subscriber;
  // filtering, sorting, and paging happen client-side on the cached list.
  // A failed request clears the cache so the next call retries.
  getItems(): Observable<Item[]> {
    this.items$ ??= this.http.get<ItemsResponse>('/api/items').pipe(
      map((res) => res.results ?? []),
      catchError((err) => {
        this.items$ = undefined;
        return throwError(() => err);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.items$;
  }
}
