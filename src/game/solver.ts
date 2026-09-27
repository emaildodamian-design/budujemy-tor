// Depth-first solver. Pure; used by the tests, the hints, the ghost path and the metrics.
//
// It walks from the start shed with the same stepping rules as `trace`. Fixed track,
// stations and any pieces it is told to keep are followed as they are (one-way pieces
// only in their direction, ordered stations only in order); on an empty buildable cell
// it tries every piece kind still in hand that the terrain accepts, in every orientation
// that opens towards the train. Boards are ≤ 42 cells with branching ≤ 3; a lower bound
// (the fewest pieces still needed to reach the depot door) prunes paths the hand cannot
// finish, which keeps full counts fast on 6 × 7 boards.

import { type Dir, opposite } from './grid';
import {
  type Counts,
  type Level,
  type PieceKind,
  type Placed,
  type Side,
  PIECE_KINDS,
  boardOf,
  hasOpening,
  isBuildable,
  orientationsFor,
  otherOpening,
  sideDir,
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
  /** Only solutions that lay at most this many new pieces. */
  maxLen?: number;
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
  const occupant: ({ piece: PieceKind | 'station'; openings: Placed['openings']; oneWay?: Side; order?: number } | null)[] = Array(n).fill(null);
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
  // need[i]: fewest new pieces on any path from cell i (inclusive) to the depot door (0-1 BFS
  // backwards from the goal; occupied cells cost 0, buildable cells 1). The same for every
  // station: a route still has to visit each station it has not passed, then the door.
  const passable = (i: number) =>
    occupant[i] !== null ||
    terrain[i] === 'grass' ||
    (terrain[i] === 'river' && hand.bridge > 0) ||
    (terrain[i] === 'mountain' && hand.tunnel > 0);
  const distTo = (gx: number, gy: number): number[] => {
    const d = new Array<number>(n).fill(Infinity);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || !passable(idx(gx, gy))) return d;
    const g0 = idx(gx, gy);
    d[g0] = occupant[g0] ? 0 : 1;
    const dq = [g0];
    while (dq.length > 0) {
      const c = dq.shift()!;
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let k = 0; k < 4; k++) {
        const x2 = cx + DX[k];
        const y2 = cy + DY[k];
        if (x2 < 0 || y2 < 0 || x2 >= cols || y2 >= rows) continue;
        const j = idx(x2, y2);
        if (!passable(j)) continue;
        const w = occupant[j] ? 0 : 1;
        if (d[c] + w < d[j]) {
          d[j] = d[c] + w;
          if (w === 0) dq.unshift(j);
          else dq.push(j);
        }
      }
    }
    return d;
  };
  const need = distTo(b.depot.x + DX[b.depotEntry], b.depot.y + DY[b.depotEntry]);
  const stIdx = b.stations.map((c) => idx(c.x, c.y));
  const toStation = stIdx.map((si) => distTo(si % cols, Math.floor(si / cols)));
  const seenSt = new Uint8Array(stIdx.length);
  /** Lower bound on new pieces from cell i (inclusive) to the end, given the stations passed. */
  const lowerFrom = (i: number): number => {
    let lb = need[i];
    for (let k = 0; k < stIdx.length; k++) if (!seenSt[k]) lb = Math.max(lb, toStation[k][i] + need[stIdx[k]]);
    return lb;
  };
  const maxLen = opts.maxLen ?? Infinity;
  let handLeft = hand.straight + hand.curve + hand.bridge + hand.tunnel;

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
      const exit = otherOpening(occ.openings, entry);
      if (occ.oneWay && sideDir(occ.oneWay) !== exit) return false;
      if (b.ordered && isStation[i] && occ.order !== stationsSeen + 1) return false;
      const sk = isStation[i] ? stIdx.indexOf(i) : -1;
      visited[i] = 1;
      ridesUsed++;
      if (sk >= 0) seenSt[sk] = 1;
      const stop = dfs(nx, ny, exit, stationsSeen + (isStation[i] ? 1 : 0));
      if (sk >= 0) seenSt[sk] = 0;
      ridesUsed--;
      visited[i] = 0;
      return stop;
    }
    if (!isBuildable(terrain[i])) return false;
    // This cell and every buildable cell from here to the door (via the stations left) need a piece.
    const lb = lowerFrom(i);
    if (lb > handLeft || laid.length + lb > maxLen) return false;
    if (opts.shortest) {
      // Every cell strictly between here and the depot needs a piece, except cells
      // with track already on them.
      const lower = laid.length + Math.max(lb, 1 + Math.max(0, Math.abs(nx - dX) + Math.abs(ny - dY) - 1 - (freeRides - ridesUsed)));
      if (lower >= best) return false;
    }
    visited[i] = 1;
    handLeft--;
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
          handLeft++;
          visited[i] = 0;
          return true;
        }
      }
      hand[kind]++;
    }
    handLeft++;
    visited[i] = 0;
    return false;
  };

  dfs(b.start.x, b.start.y, b.startExit, 0);
  if (nodes > nodeLimit) solverStats.truncated++;
  return out;
}

/** Searches that hit their node limit (their result may be incomplete). Tests assert 0. */
export const solverStats = { truncated: 0 };

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
