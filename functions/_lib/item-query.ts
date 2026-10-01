// Dependency-free so it can be unit-tested from src/ (the test runner only
// covers src/**/*.spec.ts) and bundled into the Pages Function.

// Query keys /api/items accepts: paging/sorting/projection plus the Item
// columns usable as filters. `active` is accepted but always overridden
// (see withActiveOnly).
const ALLOWED_KEYS = [
  'sort_by',
  'order',
  'limit',
  'offset',
  'fields',
  'active',
  'itemID',
  'itemName',
  'itemRarity',
  'itemCost',
  'itemType',
  'itemRestrictions',
  'itemAttunement',
  'itemSource',
  'itemUrl',
  'itemVisualDesc',
  'itemShopkeeperDesc',
  'itemDescription',
  'itemDescriptionSource',
];

const CANONICAL_KEYS = new Map(ALLOWED_KEYS.map((key) => [key.toLowerCase(), key]));

// Returns the query string to forward upstream with every key renamed to its
// canonical spelling (matching is case-insensitive), or null when the caller
// sent a key that is not allowed. Values and repeated keys are kept as sent.
export function canonicalItemQuery(search: string): string | null {
  const canonical = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    const name = CANONICAL_KEYS.get(key.toLowerCase());
    if (name === undefined) {
      return null;
    }
    canonical.append(name, value);
  }
  return canonical.size === 0 ? '' : `?${canonical}`;
}
