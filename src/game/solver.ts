// Depth-first solver. Pure; used by the tests, the hints and the ghost path.
//
// It walks from the start shed with the same stepping rules as `trace`. Fixed track,
// stations and any pieces it is told to keep are followed as they are; on an empty
// buildable cell it tries every piece kind still in hand that the terrain accepts,
// in every orientation that opens towards the train. Boards are ≤ 30 cells with
// branching ≤ 3, so plain DFS with a visited set is fast enough.

import { type Dir, opposite } from './grid';
import {
  type Counts,
  type Level,
  type PieceKind,
  type Placed,
  PIECE_KINDS,
  boardOf,
  hasOpening,
  isBuildable,
  orientationsFor,
  otherOpening,
  terrainAccepts,
  terrainAt,
  zeroCounts,
} from './level';

export interface SolveOptions {
  /** Stop after this many distinct solutions (default 1). */
  cap?: number;
  /** Movable pieces that stay where they are (followed if the route reaches them). */
  keep?: readonly Placed[];
  /** Pieces available to lay. Default: the level's whole inventory minus `keep`. */
  hand?: Counts;
  /** Return only the solutions that lay the fewest new pieces (branch and bound). */
  shortest?: boolean;
  /** Safety valve against pathological searches. */
  nodeLimit?: number;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Pieces left in hand: the whole inventory minus what is on the board. */
export function handFor(level: Level, onBoard: readonly Placed[]): Counts {
  const hand = { ...boardOf(level).inventory };
  for (const p of onBoard) hand[p.piece] -= 1;
  return hand;
}

/**
 * Finds up to `cap` solutions. Each solution is the list of NEW pieces to lay, in
 * route order. With `shortest`, returns one solution with the fewest new pieces.
 */
export function solve(level: Level, opts: SolveOptions = {}): Placed[][] {
  const b = boardOf(level);
  const { cols, rows } = b;
  const cap = opts.cap ?? 1;
  const nodeLimit = opts.nodeLimit ?? 2_000_000;
  const keep = opts.keep ?? [];
  const hand = opts.hand ? { ...opts.hand } : handFor(level, keep);
  const idx = (x: number, y: number) => y * cols + x;
  const n = cols * rows;

  const terrain = Array.from({ length: n }, (_, i) => terrainAt(level, { x: i % cols, y: Math.floor(i / cols) }));
  const occupant: ({ piece: PieceKind | 'station'; openings: Placed['openings'] } | null)[] = Array(n).fill(null);
  for (const p of keep) occupant[idx(p.at[0], p.at[1])] = p;
  for (const p of b.fixed.values()) occupant[idx(p.at[0], p.at[1])] = p;
  const isStation = terrain.map((t) => t === 'station');
  const stationTotal = b.stations.length;
  const depotIdx = idx(b.depot.x, b.depot.y);
  const startIdx = idx(b.start.x, b.start.y);
  const dX = b.depot.x;
  const dY = b.depot.y;
  // Cells the route can pass without laying a piece: used for a safe lower bound.
  const freeRides = occupant.filter(Boolean).length;

  const visited = new Uint8Array(n);
  visited[startIdx] = 1;
  const laid: Placed[] = [];
  const out: Placed[][] = [];
  let best = Infinity;
  let nodes = 0;
  let ridesUsed = 0;

  const dfs = (x: number, y: number, dir: Dir, stationsSeen: number): boolean => {
    if (++nodes > nodeLimit) return true;
    const nx = x + DX[dir];
    const ny = y + DY[dir];
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;
    const i = idx(nx, ny);
    if (i === depotIdx) {
      if (opposite(dir) === b.depotEntry && stationsSeen === stationTotal) {
        if (opts.shortest) {
          if (laid.length < best) {
            best = laid.length;
            out.length = 0;
            out.push(laid.slice());
          }
        } else {
          out.push(laid.slice());
          if (out.length >= cap) return true;
        }
      }
      return false;
    }
    if (visited[i]) return false;
    const entry = opposite(dir);
    const occ = occupant[i];
    if (occ) {
      if (!hasOpening(occ.openings, entry) || !terrainAccepts(terrain[i], occ.piece)) return false;
      visited[i] = 1;
      ridesUsed++;
      const stop = dfs(nx, ny, otherOpening(occ.openings, entry), stationsSeen + (isStation[i] ? 1 : 0));
      ridesUsed--;
      visited[i] = 0;
      return stop;
    }
    if (!isBuildable(terrain[i])) return false;
    if (opts.shortest) {
      // Every cell strictly between here and the depot needs a piece, except cells
      // with track already on them.
      const lower = laid.length + 1 + Math.max(0, Math.abs(nx - dX) + Math.abs(ny - dY) - 1 - (freeRides - ridesUsed));
      if (lower >= best) return false;
    }
    visited[i] = 1;
    for (const kind of PIECE_KINDS) {
      if (hand[kind] <= 0 || !terrainAccepts(terrain[i], kind)) continue;
      hand[kind]--;
      for (const o of orientationsFor(kind)) {
        if (!hasOpening(o, entry)) continue;
        laid.push({ at: [nx, ny], piece: kind, openings: o });
        const stop = dfs(nx, ny, otherOpening(o, entry), stationsSeen);
        laid.pop();
        if (stop) {
          hand[kind]++;
          visited[i] = 0;
          return true;
        }
      }
      hand[kind]++;
    }
    visited[i] = 0;
    return false;
  };

  dfs(b.start.x, b.start.y, b.startExit, 0);
  return out;
}

export function countSolutions(level: Level, cap = 50, keep: readonly Placed[] = []): number {
  return solve(level, { cap, keep }).length;
}

/** Fewest-pieces completion that keeps `keep` in place, or null. */
export function shortestCompletion(level: Level, keep: readonly Placed[], hand?: Counts): Placed[] | null {
  return solve(level, { keep, hand, shortest: true })[0] ?? null;
}

export function countsOf(pieces: readonly { piece: PieceKind }[]): Counts {
  const c = zeroCounts();
  for (const p of pieces) c[p.piece]++;
  return c;
}
