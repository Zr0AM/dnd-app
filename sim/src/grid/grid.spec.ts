import { describe, it, expect } from 'vitest';
import {
  Grid,
  cell,
  cellsEqual,
  cellsWithin,
  distanceFt,
  isAdjacent,
  stepDistance,
  withinRange,
  withinReach,
} from './grid';

describe('distance (simple grid method)', () => {
  it('counts diagonals as one step, like the 2024 SRD', () => {
    expect(stepDistance(cell(0, 0), cell(3, 0))).toBe(3);
    expect(stepDistance(cell(0, 0), cell(3, 3))).toBe(3); // diagonal, not 6 or ~4.24
    expect(stepDistance(cell(0, 0), cell(3, 1))).toBe(3);
  });

  it('converts to feet with the cell size', () => {
    expect(distanceFt(cell(0, 0), cell(3, 3))).toBe(15);
    expect(distanceFt(cell(0, 0), cell(2, 0), 10)).toBe(20);
  });

  it('cellsEqual and same-cell distance', () => {
    expect(cellsEqual(cell(1, 2), cell(1, 2))).toBe(true);
    expect(distanceFt(cell(4, 4), cell(4, 4))).toBe(0);
  });
});

describe('adjacency, reach and range', () => {
  it('orthogonal and diagonal neighbors are adjacent', () => {
    expect(isAdjacent(cell(5, 5), cell(5, 6))).toBe(true);
    expect(isAdjacent(cell(5, 5), cell(6, 6))).toBe(true);
    expect(isAdjacent(cell(5, 5), cell(5, 5))).toBe(false);
    expect(isAdjacent(cell(5, 5), cell(7, 5))).toBe(false);
  });

  it('reach excludes the attacker own cell and respects reach feet', () => {
    expect(withinReach(cell(0, 0), cell(0, 0))).toBe(false);
    expect(withinReach(cell(0, 0), cell(1, 0))).toBe(true); // 5 ft reach
    expect(withinReach(cell(0, 0), cell(2, 0))).toBe(false); // 10 ft away, 5 ft reach
    expect(withinReach(cell(0, 0), cell(2, 0), 10)).toBe(true); // reach weapon
  });

  it('range is distance-bounded', () => {
    expect(withinRange(cell(0, 0), cell(0, 12), 60)).toBe(true); // 60 ft
    expect(withinRange(cell(0, 0), cell(0, 13), 60)).toBe(false); // 65 ft
  });
});

describe('cellsWithin', () => {
  it('returns a square area of the right size', () => {
    // radius 10 ft on a 5 ft grid = 2 steps => 5x5 = 25 cells
    expect(cellsWithin(cell(0, 0), 10)).toHaveLength(25);
    // radius 5 ft = 1 step => 3x3 = 9 cells
    expect(cellsWithin(cell(0, 0), 5)).toHaveLength(9);
  });

  it('includes the center', () => {
    expect(cellsWithin(cell(3, 3), 5).some((c) => cellsEqual(c, cell(3, 3)))).toBe(true);
  });
});

describe('Grid terrain', () => {
  it('rejects bad dimensions', () => {
    expect(() => new Grid(0, 5)).toThrow(RangeError);
    expect(() => new Grid(5, 2.5)).toThrow(RangeError);
  });

  it('treats out-of-bounds as wall and in-bounds as open by default', () => {
    const g = new Grid(10, 10);
    expect(g.inBounds(cell(-1, 0))).toBe(false);
    expect(g.isWall(cell(-1, 0))).toBe(true);
    expect(g.isWall(cell(5, 5))).toBe(false);
    expect(g.isPassable(cell(5, 5))).toBe(true);
    expect(g.isPassable(cell(10, 10))).toBe(false);
  });

  it('sets and reads terrain flags', () => {
    const g = new Grid(10, 10);
    g.setTerrain(cell(3, 3), { wall: true });
    expect(g.isWall(cell(3, 3))).toBe(true);
    expect(g.isPassable(cell(3, 3))).toBe(false);

    g.setTerrain(cell(4, 4), { difficult: true });
    expect(g.isDifficult(cell(4, 4))).toBe(true);
    expect(g.isWall(cell(4, 4))).toBe(false);
  });

  it('fillRect clips to bounds and does not throw at the edge', () => {
    const g = new Grid(5, 5);
    g.fillRect(3, 3, 10, 10, { wall: true }); // extends past the edge
    expect(g.isWall(cell(4, 4))).toBe(true);
    expect(g.isWall(cell(3, 3))).toBe(true);
    expect(g.isWall(cell(2, 2))).toBe(false);
  });

  it('setTerrain out of bounds throws', () => {
    const g = new Grid(5, 5);
    expect(() => g.setTerrain(cell(9, 9), { wall: true })).toThrow(RangeError);
  });

  it('uses its cell size for distance', () => {
    const g = new Grid(10, 10, 10);
    expect(g.distanceFt(cell(0, 0), cell(3, 0))).toBe(30);
  });
});
