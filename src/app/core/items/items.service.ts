import { Injectable } from '@angular/core';
import { httpResource } from '@angular/common/http';

export interface Item {
  itemID: number;
  itemName: string;
  itemRarity: string;
  itemCost: number;
  itemType: string;
  itemRestrictions: string | null;
  itemAttunement: string;
  itemSource: string;
  itemUrl: string;
  itemVisualDesc: string;
  itemShopkeeperDesc: string;
  /** 1 = listed, 0 = retired. The API only returns active rows; see `catalog`. */
  active: number;
  /** Rules text. Flat single-line for SRD rows; D&D Beyond rows may hold newline paragraph breaks. */
  itemDescription: string | null;
  /** Provenance of `itemDescription`: 'SRD 5.2.1, CC-BY-4.0' or 'D&D Beyond'. Null with no description. */
  itemDescriptionSource: string | null;
}

// Maps a rarity to its CSS modifier, e.g. 'Very Rare' → 'very-rare' (.rarity--very-rare).
export function raritySlug(rarity: string): string {
  return rarity.toLowerCase().replace(/\s+/g, '-');
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
    // Belt and braces: the Pages Function already requests active=1, but a
    // retired row (active === 0) must never reach the UI even if that filter
    // is bypassed or an older cached response is served. Rows with no `active`
    // value at all (older API shape) are kept.
    parse: (raw) => ((raw as ItemsResponse).results ?? []).filter((item) => item.active !== 0),
    defaultValue: [],
  });
}
