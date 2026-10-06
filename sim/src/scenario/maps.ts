// Battle maps for the scenario library. Each returns a grid with terrain plus the
// starting cells for the hero and the enemies. Maps are intentionally varied so a
// build cannot win everywhere by one trick (the scenario spec's reason for a map
// set). Terrain is read-only during a fight, so one grid instance is safely shared
// across runs.

import { Grid, cell, type Cell } from '../grid/grid';

export interface MapLayout {
  readonly id: string;
  readonly grid: Grid;
  readonly heroStart: Cell;
  /** Enemy deployment cells, in placement order (enough for a small pack). */
  readonly enemyStarts: readonly Cell[];
}

/** Open ground: no cover, full mobility. The neutral baseline. */
export function openField(): MapLayout {
  const grid = new Grid(16, 12);
  return {
    id: 'open-field',
    grid,
    heroStart: cell(1, 6),
    enemyStarts: [cell(14, 6), cell(14, 4), cell(14, 8), cell(13, 5), cell(13, 7), cell(12, 6)],
  };
}

/**
 * A corridor with a central wall leaving a one-cell doorway, forcing single-file
 * approaches and rewarding a frontline that holds the choke.
 */
export function corridorChokepoint(): MapLayout {
  const grid = new Grid(16, 9);
  // A vertical wall at x=8 with a gap at y=4.
  for (let y = 0; y < 9; y++) {
    if (y !== 4) grid.setTerrain(cell(8, y), { wall: true });
  }
  return {
    id: 'corridor-chokepoint',
    grid,
    heroStart: cell(6, 4), // just inside the doorway on the hero's side
    enemyStarts: [cell(12, 4), cell(13, 3), cell(13, 5), cell(14, 4), cell(12, 3), cell(12, 5)],
  };
}

export const MAPS: Readonly<Record<string, () => MapLayout>> = {
  'open-field': openField,
  'corridor-chokepoint': corridorChokepoint,
};
