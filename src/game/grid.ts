// Grid geometry for the track. Pure functions only: no DOM, no randomness.
//
// Directions are travel directions of the train: 0 = North (up), 1 = East,
// 2 = South, 3 = West. Screen coordinates: x grows right, y grows down.

export type Dir = 0 | 1 | 2 | 3;

export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

/** The three shapes a player can lay, relative to the train's current heading. */
export type TileKind = 'straight' | 'left' | 'right';
export const TILE_KINDS: readonly TileKind[] = ['left', 'straight', 'right'];

export interface Cell {
  x: number;
  y: number;
}

export interface BoardSize {
  cols: number;
  rows: number;
}

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;

export function step(c: Cell, d: Dir): Cell {
  return { x: c.x + DX[d], y: c.y + DY[d] };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

export function inBounds(c: Cell, size: BoardSize): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < size.cols && c.y < size.rows;
}

/** Heading after the train passes through a tile of `kind` while travelling `heading`. */
export function exitHeading(heading: Dir, kind: TileKind): Dir {
  if (kind === 'left') return turnLeft(heading);
  if (kind === 'right') return turnRight(heading);
  return heading;
}

/**
 * Is there a self-avoiding path of `length` free cells starting at `start`?
 * Any grid path can be built from straight and curve tiles, so this is exactly
 * "can the remaining turns (plus the depot) still fit on the board".
 * `occupied` is used as scratch space and is restored before returning.
 */
export function pathFits(occupied: Set<string>, start: Cell, length: number, size: BoardSize): boolean {
  if (length <= 0) return true;
  if (!inBounds(start, size)) return false;
  const key = cellKey(start);
  if (occupied.has(key)) return false;
  if (length === 1) return true;
  occupied.add(key);
  try {
    for (const d of [N, E, S, W]) {
      if (pathFits(occupied, step(start, d), length - 1, size)) return true;
    }
    return false;
  } finally {
    occupied.delete(key);
  }
}

/** Number of free cells reachable from `start` (flood fill). Used to pick friendlier layouts. */
export function reachableFree(occupied: Set<string>, start: Cell, size: BoardSize): number {
  if (!inBounds(start, size) || occupied.has(cellKey(start))) return 0;
  const seen = new Set<string>([cellKey(start)]);
  const queue: Cell[] = [start];
  while (queue.length > 0) {
    const c = queue.pop()!;
    for (const d of [N, E, S, W]) {
      const n = step(c, d);
      const k = cellKey(n);
      if (inBounds(n, size) && !occupied.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size;
}
