// The catalog stores itemCost = 0 for Artifacts: "priceless / no fixed price",
// not "free". These helpers keep that meaning consistent in the UI and sorting.

export const PRICELESS = 'Priceless';
const NO_COST = '—';

// Display text for a cost in gp, without the unit (for a column titled "Cost (gp)").
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) return NO_COST;
  if (cost === 0) return PRICELESS;
  return cost.toLocaleString('en-US');
}

// As formatCost, with the "gp" unit on real prices only ("Priceless" and "—" stay bare).
export function formatCostGp(cost: number | null | undefined): string {
  const text = formatCost(cost);
  return text === PRICELESS || text === NO_COST ? text : `${text} gp`;
}

// Sort key for cost: priceless (0) ranks above every priced item, so it sorts
// last ascending and first descending. Missing/NaN costs rank below everything.
export function costSortValue(cost: number | null | undefined): number {
  if (cost === null || cost === undefined || Number.isNaN(cost)) return -Infinity;
  return cost === 0 ? Infinity : cost;
}

// Comparator over costSortValue. Avoids subtraction, since Infinity - Infinity is NaN.
export function compareCost(a: number | null | undefined, b: number | null | undefined): number {
  const x = costSortValue(a);
  const y = costSortValue(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
