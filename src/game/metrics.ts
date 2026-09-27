// Difficulty metrics, measured by the solver. Pure and deterministic.
//
// Everything is computed from the initial state. Repair levels are measured on the
// empty board with the pre-laid pieces returned to the hand. "Inventory" = tray +
// pre-laid pieces. The definitions follow the v3 brief exactly (see README).

import { type Cell, type Dir, opposite } from './grid';
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
  isRepair,
  otherOpening,
  sideDir,
  terrainAccepts,
  terrainAt,
} from './level';
import { countsOf, solve } from './solver';
import { trace } from './trace';

export const SOLUTION_CAP = 50;
const PLAN_MAX = 8;
const PLAN_STEPS = 200;

export interface Metrics {
  minLen: number;
  solutions: number;
  distractors: number;
  naiveLen: number;
  detour: number;
  freeLen: number;
  countSlack: number;
  planDepth: number;
  lures: number;
  /** Repair levels only (0 otherwise). */
  faults: number;
  arrowMatters: boolean;
  orderMatters: boolean;
}

const total = (c: Counts) => c.straight + c.curve + c.bridge + c.tunnel;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** The level as metrics see it: empty board, pre-laid pieces back in the hand. */
function emptied(level: Level): Level {
  if (!isRepair(level)) return level;
  const tray = PIECE_KINDS.map((piece) => ({ piece, count: boardOf(level).inventory[piece] })).filter((t) => t.count > 0);
  return { ...level, preplaced: undefined, tray };
}

/** Shortest solution from the empty board (route order), or null. */
export function shortestSolution(level: Level): Placed[] | null {
  return solve(emptied(level), { shortest: true })[0] ?? null;
}

export function minLenOf(level: Level): number {
  return shortestSolution(level)?.length ?? Infinity;
}

export function solutionsOf(level: Level): number {
  return solve(emptied(level), { cap: SOLUTION_CAP }).length;
}

/**
 * Fewest pieces from the cell in front of the start to any cell next to the depot:
 * 0-1 BFS through grass, river (only with a bridge in the inventory), mountain (only
 * with a tunnel) and fixed/station cells. Fixed and station cells cost 0, the others 1
 * (the first cell included). Ignores counts, turning, the depot side, arrows and stations.
 */
export function naiveLenOf(level: Level): number {
  const b = boardOf(level);
  const inv = b.inventory;
  const { cols, rows } = b;
  const cost = (c: Cell): number | null => {
    if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) return null;
    if (b.fixed.has(`${c.x},${c.y}`)) return 0;
    const t = terrainAt(level, c);
    if (t === 'grass') return 1;
    if (t === 'river') return inv.bridge > 0 ? 1 : null;
    if (t === 'mountain') return inv.tunnel > 0 ? 1 : null;
    return null;
  };
  const first = { x: b.start.x + DX[b.startExit], y: b.start.y + DY[b.startExit] };
  const c0 = cost(first);
  if (c0 === null) return Infinity;
  const isGoal = (c: Cell) => Math.abs(c.x - b.depot.x) + Math.abs(c.y - b.depot.y) === 1;
  const dist = new Map<string, number>([[`${first.x},${first.y}`, c0]]);
  const dq: [Cell, number][] = [[first, c0]];
  while (dq.length > 0) {
    const [c, d] = dq.shift()!;
    if (d > (dist.get(`${c.x},${c.y}`) ?? Infinity)) continue;
    if (isGoal(c)) return d;
    for (let k = 0; k < 4; k++) {
      const n = { x: c.x + DX[k], y: c.y + DY[k] };
      const w = cost(n);
      if (w === null) continue;
      const key = `${n.x},${n.y}`;
      if (d + w < (dist.get(key) ?? Infinity)) {
        dist.set(key, d + w);
        if (w === 0) dq.unshift([n, d + w]);
        else dq.push([n, d + w]);
      }
    }
  }
  return Infinity;
}

/** minLen with unlimited straights and curves (bridge and tunnel counts unchanged). */
export function freeLenOf(level: Level): number {
  const inv = boardOf(level).inventory;
  const hand: Counts = { straight: 99, curve: 99, bridge: inv.bridge, tunnel: inv.tunnel };
  return solve(emptied(level), { shortest: true, hand })[0]?.length ?? Infinity;
}

export function luresOf(level: Level, shortest: readonly Placed[] | null): number {
  if (!shortest) return 0;
  const inv = boardOf(level).inventory;
  const used = countsOf(shortest);
  const g = level.grid.join('');
  let n = 0;
  if (g.includes('~')) n += inv.bridge - used.bridge;
  if (g.includes('^')) n += inv.tunnel - used.tunnel;
  return n;
}

/** Repair levels: the fewest pre-laid pieces that are wrong for some solution (cap 50). */
export function faultsOf(level: Level): number {
  if (!isRepair(level)) return 0;
  const sols = solve(emptied(level), { cap: SOLUTION_CAP });
  let best = Infinity;
  for (const sol of sols) {
    const wrong = (level.preplaced ?? []).filter(
      (p) => !sol.some((q) => q.at[0] === p.at[0] && q.at[1] === p.at[1] && q.piece === p.piece && q.openings === p.openings),
    ).length;
    best = Math.min(best, wrong);
  }
  return best;
}

export type FaultType = 'orientation' | 'kind' | 'offRoute';

/** Fault types of the pre-laid pieces against the solution with the fewest faults. */
export function faultTypes(level: Level): FaultType[] {
  if (!isRepair(level)) return [];
  const sols = solve(emptied(level), { cap: SOLUTION_CAP });
  let best: FaultType[] | null = null;
  for (const sol of sols) {
    const types: FaultType[] = [];
    for (const p of level.preplaced ?? []) {
      const q = sol.find((x) => x.at[0] === p.at[0] && x.at[1] === p.at[1]);
      if (!q) types.push('offRoute');
      else if (q.piece !== p.piece) types.push('kind');
      else if (q.openings !== p.openings) types.push('orientation');
    }
    if (!best || types.length < best.length) best = types;
  }
  return best ?? [];
}

// ---------- planDepth: a greedy player with a k-placement look-ahead ----------

interface PState {
  x: number;
  y: number;
  dir: Dir;
  hand: Counts;
  visited: Set<number>;
  passed: number;
  /** Indices (into level.stations) of stations passed. */
  passedSet: Set<number>;
  nextOrder: number;
}

type Move = { done: true } | { done: false; cost: 0 | 1; next: PState };

const ORIENT: Record<PieceKind, readonly ('NS' | 'EW' | 'NE' | 'ES' | 'SW' | 'NW')[]> = {
  straight: ['NS', 'EW'],
  curve: ['NE', 'ES', 'SW', 'NW'],
  bridge: ['NS', 'EW'],
  tunnel: ['NS', 'EW'],
};

function planner(level: Level) {
  const L = emptied(level);
  const b = boardOf(L);
  const { cols, rows } = b;
  const stations = L.stations ?? [];
  const stationIdx = new Map<number, number>();
  stations.forEach((s, i) => stationIdx.set(s.at[1] * cols + s.at[0], i));
  const door = { x: b.depot.x + DX[b.depotEntry], y: b.depot.y + DY[b.depotEntry] };
  const terrain = Array.from({ length: cols * rows }, (_, i) => terrainAt(L, { x: i % cols, y: Math.floor(i / cols) }));

  const nextCell = (s: PState) => ({ x: s.x + DX[s.dir], y: s.y + DY[s.dir] });

  function target(s: PState, nc: Cell): Cell {
    const remaining = stations.map((st, i) => ({ st, i })).filter(({ i }) => !s.passedSet.has(i));
    if (remaining.length === 0) return door;
    if (b.ordered) {
      const nxt = remaining.find(({ st }) => st.order === s.nextOrder) ?? remaining[0];
      return { x: nxt.st.at[0], y: nxt.st.at[1] };
    }
    let best = remaining[0];
    let bd = Infinity;
    for (const r of remaining) {
      const d = Math.abs(r.st.at[0] - nc.x) + Math.abs(r.st.at[1] - nc.y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return { x: best.st.at[0], y: best.st.at[1] };
  }

  function score(s: PState): number {
    const nc = nextCell(s);
    const t = target(s, nc);
    return Math.abs(nc.x - t.x) + Math.abs(nc.y - t.y) + 10 * (stations.length - s.passed);
  }

  function moves(s: PState): Move[] {
    const nc = nextCell(s);
    if (nc.x < 0 || nc.y < 0 || nc.x >= cols || nc.y >= rows) return [];
    const i = nc.y * cols + nc.x;
    if (s.visited.has(i)) return [];
    const entry = opposite(s.dir);
    if (nc.x === b.depot.x && nc.y === b.depot.y) {
      return entry === b.depotEntry && s.passed === stations.length ? [{ done: true }] : [];
    }
    const fx = b.fixed.get(`${nc.x},${nc.y}`);
    const advance = (dir: Dir, hand: Counts): PState => {
      const visited = new Set(s.visited);
      visited.add(i);
      const si = stationIdx.get(i);
      const passedSet = si === undefined ? s.passedSet : new Set(s.passedSet).add(si);
      return { x: nc.x, y: nc.y, dir, hand, visited, passed: passedSet.size, passedSet, nextOrder: si === undefined ? s.nextOrder : s.nextOrder + 1 };
    };
    if (fx) {
      if (!hasOpening(fx.openings, entry)) return [];
      const exit = otherOpening(fx.openings, entry);
      if (fx.oneWay && sideDir(fx.oneWay as Side) !== exit) return [];
      if (b.ordered && fx.piece === 'station' && fx.order !== s.nextOrder) return [];
      return [{ done: false, cost: 0, next: advance(exit, s.hand) }];
    }
    const t = terrain[i];
    if (!isBuildable(t)) return [];
    const out: Move[] = [];
    for (const kind of PIECE_KINDS) {
      if (s.hand[kind] <= 0 || !terrainAccepts(t, kind)) continue;
      for (const o of ORIENT[kind]) {
        if (!hasOpening(o, entry)) continue;
        out.push({ done: false, cost: 1, next: advance(otherOpening(o, entry), { ...s.hand, [kind]: s.hand[kind] - 1 }) });
      }
    }
    return out;
  }

  function best(s: PState, d: number): number {
    const ms = moves(s);
    if (ms.some((m) => m.done)) return -1000;
    if (ms.length === 0) return score(s) + 50;
    if (d <= 0) return score(s);
    let v = Infinity;
    for (const m of ms) if (!m.done) v = Math.min(v, best(m.next, d - m.cost));
    return v;
  }

  function play(k: number): boolean {
    let s: PState = {
      x: b.start.x,
      y: b.start.y,
      dir: b.startExit,
      hand: { ...b.inventory },
      visited: new Set([b.start.y * cols + b.start.x]),
      passed: 0,
      passedSet: new Set(),
      nextOrder: 1,
    };
    for (let stepN = 0; stepN < PLAN_STEPS; stepN++) {
      const ms = moves(s);
      if (ms.some((m) => m.done)) return true;
      if (ms.length === 0) return false;
      if (ms.length === 1) {
        s = (ms[0] as Extract<Move, { done: false }>).next;
        continue;
      }
      let pick: PState | null = null;
      let pv = Infinity;
      for (const m of ms) {
        if (m.done) continue;
        const v = best(m.next, k - m.cost);
        if (v < pv) {
          pv = v;
          pick = m.next;
        }
      }
      s = pick!;
    }
    return false;
  }

  return { play };
}

/** Smallest look-ahead k in 1..8 with which the greedy player reaches the depot; 9 if none. */
export function planDepthOf(level: Level): number {
  const p = planner(level);
  for (let k = 1; k <= PLAN_MAX; k++) if (p.play(k)) return k;
  return PLAN_MAX + 1;
}

/** The level without its one-way arrows. */
export function withoutArrows(level: Level): Level {
  return { ...level, fixed: level.fixed?.map(({ oneWay: _drop, ...p }) => p) };
}

/** The level without station order. */
export function withoutOrder(level: Level): Level {
  return { ...level, stations: level.stations?.map(({ order: _drop, ...s }) => s) };
}

function matters(level: Level, strip: (l: Level) => Level, has: boolean): boolean {
  if (!has) return false;
  const loose = strip(level);
  return solutionsOf(loose) > solutionsOf(level) || minLenOf(loose) !== minLenOf(level);
}

export function metricsOf(level: Level): Metrics {
  const inv = boardOf(level).inventory;
  const sol = shortestSolution(level);
  const minLen = sol?.length ?? Infinity;
  const naiveLen = naiveLenOf(level);
  const freeLen = freeLenOf(level);
  return {
    minLen,
    solutions: solutionsOf(level),
    distractors: total(inv) - minLen,
    naiveLen,
    detour: minLen - naiveLen,
    freeLen,
    countSlack: minLen - freeLen,
    planDepth: planDepthOf(level),
    lures: luresOf(level, sol),
    faults: faultsOf(level),
    arrowMatters: matters(level, withoutArrows, (level.fixed ?? []).some((p) => p.oneWay)),
    orderMatters: matters(level, withoutOrder, boardOf(level).ordered),
  };
}

export type Mechanic = 'bridge' | 'tunnel' | 'station' | 'arrow' | 'order';

/** Mechanics the shortest solution rides through (stations and arrows are fixed cells on its path). */
export function mechanicsOf(level: Level, sol: readonly Placed[] | null = shortestSolution(level)): Mechanic[] {
  if (!sol) return [];
  const out: Mechanic[] = [];
  const used = countsOf(sol);
  const b = boardOf(level);
  const path = trace(emptied(level), sol).path;
  const rides = path.map((c) => b.fixed.get(`${c.x},${c.y}`)).filter((p) => p !== undefined);
  if (used.bridge > 0) out.push('bridge');
  if (used.tunnel > 0) out.push('tunnel');
  if (rides.some((p) => p.piece === 'station')) out.push('station');
  if (rides.some((p) => p.oneWay)) out.push('arrow');
  if (b.ordered && rides.some((p) => p.piece === 'station')) out.push('order');
  return out;
}
