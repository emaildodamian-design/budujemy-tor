// Geometry of a test run: the polyline the train follows, in board units. Pure.

import { type Cell, type Dir, opposite } from '../game/grid';
import { type Level, type Placed, otherOpening } from '../game/level';
import type { TraceResult } from '../game/trace';
import { pieceAt } from '../game/trace';
import { CELL, type Pt, pointThrough, sideMid } from './art';

export interface RoutePt extends Pt {
  angle: number;
  /** Index into trace.path of the cell this point is in (-1: start shed, path.length: depot). */
  cell: number;
}

const STEPS = 10;

/** Points from the start shed centre through every path cell; into the depot on success. */
export function routePoints(level: Level, pieces: readonly Placed[], t: TraceResult, start: Cell, startExit: Dir, depot: Cell): RoutePt[] {
  const pts: RoutePt[] = [];
  const ox = (c: Cell) => c.x * CELL;
  const oy = (c: Cell) => c.y * CELL;
  const deg = (d: Dir) => [-90, 0, 90, 180][d];
  const m = sideMid(startExit);
  for (let i = 0; i <= STEPS / 2; i++) {
    const k = i / (STEPS / 2);
    pts.push({ x: ox(start) + 50 + (m.x - 50) * k, y: oy(start) + 50 + (m.y - 50) * k, angle: deg(startExit), cell: -1 });
  }
  let dir: Dir = startExit;
  t.path.forEach((c, idx) => {
    const p = pieceAt(level, pieces, c)!;
    const from = opposite(dir);
    const to = otherOpening(p.openings, from);
    for (let i = 1; i <= STEPS; i++) {
      const q = pointThrough(from, to, i / STEPS);
      pts.push({ x: ox(c) + q.x, y: oy(c) + q.y, angle: q.angle, cell: idx });
    }
    dir = to;
  });
  if (t.success) {
    const e = sideMid(opposite(dir));
    for (let i = 1; i <= STEPS / 2; i++) {
      const k = i / (STEPS / 2);
      pts.push({ x: ox(depot) + e.x + (50 - e.x) * k, y: oy(depot) + e.y + (50 - e.y) * k, angle: deg(dir), cell: t.path.length });
    }
  } else {
    // Stop a little before the break: pull back the last few points of the stop cell.
    const keep = Math.max(STEPS / 2 - 1, pts.length - 3);
    pts.length = keep;
  }
  return pts;
}

export function polylineLength(pts: readonly Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Point at arc length `len` along the polyline. */
export function pointAt(pts: readonly RoutePt[], len: number): RoutePt {
  if (pts.length === 0) return { x: 0, y: 0, angle: 0, cell: -1 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= len) {
      const k = seg === 0 ? 0 : (len - acc) / seg;
      const a = pts[i - 1];
      const b = pts[i];
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: b.angle, cell: b.cell };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}
