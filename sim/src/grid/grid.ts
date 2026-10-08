// The battlefield grid for the full tactical model.
//
// Distance uses the 2024 SRD's simple grid method: every square counts as 5 feet
// of movement, diagonals included. That is Chebyshev distance (max of the axis
// deltas) times the cell size — not Euclidean, and not the older 5-10-5 variant.
//
// This module is geometry and terrain only: coordinates, distance, reach/range
// tests, and a terrain grid (walls and difficult terrain). Pathfinding, cover
// line-of-effect and movement costs build on these later.

/** An integer cell coordinate on the grid. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export function cell(x: number, y: number): Cell {
  return { x, y };
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Chebyshev step count between two cells (diagonals count as one step). */
export function stepDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Distance in feet between two cells under the simple grid method. Defaults to a
 * 5-foot grid. This is the number the SRD's range and movement rules use.
 */
export function distanceFt(a: Cell, b: Cell, cellFt = 5): number {
  return stepDistance(a, b) * cellFt;
}

/** Two cells are adjacent if they touch, including diagonally (not the same cell). */
export function isAdjacent(a: Cell, b: Cell): boolean {
  const d = stepDistance(a, b);
  return d === 1;
}

/** Whether `target` is within `reachFt` of `from` for a melee attack of that reach. */
export function withinReach(from: Cell, target: Cell, reachFt = 5, cellFt = 5): boolean {
  if (cellsEqual(from, target)) return false;
  return distanceFt(from, target, cellFt) <= reachFt;
}

/** Whether `target` is within `rangeFt` of `from` for a ranged effect. */
export function withinRange(from: Cell, target: Cell, rangeFt: number, cellFt = 5): boolean {
  return distanceFt(from, target, cellFt) <= rangeFt;
}

/** The cells within `radiusFt` of `center` (a square "radius" under the grid method). */
export function cellsWithin(center: Cell, radiusFt: number, cellFt = 5): Cell[] {
  const steps = Math.floor(radiusFt / cellFt);
  const out: Cell[] = [];
  for (let dy = -steps; dy <= steps; dy++) {
    for (let dx = -steps; dx <= steps; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= steps) {
        out.push(cell(center.x + dx, center.y + dy));
      }
    }
  }
  return out;
}

/** Per-cell terrain flags. */
export interface TerrainCell {
  readonly wall: boolean;
  readonly difficult: boolean;
}

const OPEN: TerrainCell = { wall: false, difficult: false };

/**
 * A rectangular terrain grid. Out-of-bounds cells read as walls, so callers can
 * treat the map edge as impassable without special-casing.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cellFt: number;
  private readonly terrain: TerrainCell[];

  constructor(width: number, height: number, cellFt = 5) {
    if (width < 1 || height < 1 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RangeError(`grid dimensions must be positive integers, got ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.cellFt = cellFt;
    this.terrain = Array.from({ length: width * height }, () => OPEN);
  }

  inBounds(c: Cell): boolean {
    return c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height;
  }

  private index(c: Cell): number {
    return c.y * this.width + c.x;
  }

  at(c: Cell): TerrainCell {
    return this.inBounds(c) ? this.terrain[this.index(c)] : { wall: true, difficult: false };
  }

  isWall(c: Cell): boolean {
    return this.at(c).wall;
  }

  isDifficult(c: Cell): boolean {
    return this.at(c).difficult;
  }

  /** A cell a creature may stand in: in bounds and not a wall. */
  isPassable(c: Cell): boolean {
    return this.inBounds(c) && !this.at(c).wall;
  }

  setTerrain(c: Cell, flags: Partial<TerrainCell>): void {
    if (!this.inBounds(c)) {
      throw new RangeError(`cell (${c.x}, ${c.y}) is out of bounds`);
    }
    const prev = this.terrain[this.index(c)];
    this.terrain[this.index(c)] = {
      wall: flags.wall ?? prev.wall,
      difficult: flags.difficult ?? prev.difficult,
    };
  }

  /** Fill a rectangle of cells with terrain flags (clipped to bounds). */
  fillRect(x: number, y: number, w: number, h: number, flags: Partial<TerrainCell>): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const c = cell(xx, yy);
        if (this.inBounds(c)) this.setTerrain(c, flags);
      }
    }
  }

  distanceFt(a: Cell, b: Cell): number {
    return distanceFt(a, b, this.cellFt);
  }
}
