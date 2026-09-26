// Seeded level generator (offline tool, not run in CI). Pure functions of (spec, rnd).
//
// Method (per candidate):
//  1. Pick a board size from the chapter band, place the start shed and the depot
//     (random depot entry).
//  2. Add terrain as clustered blobs (rivers as full lines), then obstacles, then stations.
//  3. Hand: unlimited straights and curves plus the chapter's bridge / tunnel counts.
//  4. Find the shortest legal route, then a random route of length shortest + 0..2
//     (ordered levels: the counter-intuitive order, i.e. the one whose shortest route is longer).
//  5. Tray = exactly that route's pieces; distractors are added LAST (bridges / tunnels
//     weighted where their terrain exists).
//  6. Arrows are blockers: on a straight cell of a competing solution that is off the
//     intended route, a fixed one-way straight points against that route's travel
//     (up to 2 arrows, until solutions ≤ 2).
//  7. Repair levels pre-lay part of the route with 2–3 faults of ≥ 2 types.
//  8. Accept only if every band rule in src/game/bands.ts passes.

import { type Band, type Measured, bandOf, levelProblems, plannedPlacement, plannedRotate } from '../../src/game/bands';
import { type Dir, opposite } from '../../src/game/grid';
import {
  type Counts,
  type Level,
  type LevelKind,
  type Openings,
  type PieceAt,
  type PieceKind,
  type Placed,
  type Side,
  PIECE_KINDS,
  boardOf,
  dirSide,
  initialPieces,
  openingDirs,
  orientationsFor,
  validateLevel,
} from '../../src/game/level';
import { type Metrics, faultTypes, mechanicsOf, metricsOf, shortestSolution } from '../../src/game/metrics';
import { countsOf, solve } from '../../src/game/solver';
import { trace } from '../../src/game/trace';

export type Rnd = () => number;

/** Why the last candidate was dropped early (debug statistics for --why). */
export const rejects = new Map<string, number>();

function reject(why: string): null {
  rejects.set(why, (rejects.get(why) ?? 0) + 1);
  return null;
}

/** Mulberry32: small, fast, reproducible. */
export function seeded(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rnd: Rnd, lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pickOne = <T>(rnd: Rnd, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
function shuffle<T>(rnd: Rnd, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export interface Spec {
  /** Main level number (1..48); siblings use their main level's number. */
  n: number;
  chapter: number;
  kind: LevelKind;
  intro?: Level['intro'];
  /** Siblings: the main level's metrics. */
  main?: Metrics;
  /** Chapter 8 finale: aim for a unique solution. */
  unique?: boolean;
}

export interface Candidate extends Measured {
  problems: string[];
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

type Grid = string[][];
const inb = (g: Grid, x: number, y: number) => y >= 0 && x >= 0 && y < g.length && x < g[0].length;
const blockedCount = (g: Grid) => g.flat().filter((c) => 'RHTL'.includes(c)).length;

/** A clustered blob of `size` cells of char `ch` on grass. */
function blob(rnd: Rnd, g: Grid, ch: string, size: number, shape?: [number, number]): boolean {
  const rows = g.length;
  const cols = g[0].length;
  if (shape) {
    const [w, h] = rnd() < 0.5 ? shape : [shape[1], shape[0]];
    for (let tries = 0; tries < 20; tries++) {
      const x0 = int(rnd, 0, cols - w);
      const y0 = int(rnd, 0, rows - h);
      let ok = true;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g[y][x] !== '.') ok = false;
      if (!ok) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = ch;
      return true;
    }
    return false;
  }
  for (let tries = 0; tries < 20; tries++) {
    const cells: [number, number][] = [[int(rnd, 0, cols - 1), int(rnd, 0, rows - 1)]];
    if (g[cells[0][1]][cells[0][0]] !== '.') continue;
    let guard = 0;
    while (cells.length < size && guard++ < 50) {
      const [x, y] = pickOne(rnd, cells);
      const d = int(rnd, 0, 3);
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!inb(g, nx, ny) || g[ny][nx] !== '.' || cells.some((c) => c[0] === nx && c[1] === ny)) continue;
      cells.push([nx, ny]);
    }
    if (cells.length < size) continue;
    for (const [x, y] of cells) g[y][x] = ch;
    return true;
  }
  return false;
}

/** A full-line river: one whole row or column (the train must bridge it). */
function river(rnd: Rnd, g: Grid, horizontal: boolean): boolean {
  const rows = g.length;
  const cols = g[0].length;
  if (horizontal) {
    const y = int(rnd, 1, rows - 2);
    if (g[y].some((c) => c !== '.')) return false;
    for (let x = 0; x < cols; x++) g[y][x] = '~';
  } else {
    const x = int(rnd, 1, cols - 2);
    if (g.some((r) => r[x] !== '.')) return false;
    for (let y = 0; y < rows; y++) g[y][x] = '~';
  }
  return true;
}

interface Features {
  lakes: [number, number];
  obstacles: [number, number];
  river: number; // probability of a full-line river
  mountain: number; // probability of a mountain blob
  mountainShapes: [number, number][];
  stations: [number, number];
  ordered: boolean;
  arrows: boolean;
  bridges: [number, number];
  tunnels: [number, number];
}

function features(spec: Spec): Features {
  const c = spec.chapter;
  const base: Features = { lakes: [0, 1], obstacles: [1, 3], river: 0, mountain: 0, mountainShapes: [[2, 2]], stations: [0, 0], ordered: false, arrows: false, bridges: [0, 0], tunnels: [0, 0] };
  switch (c) {
    case 1:
      return { ...base, lakes: [1, 2], obstacles: [1, 3] };
    case 2:
      return { ...base, lakes: spec.n >= 9 ? [1, 2] : [0, 1], river: 1, bridges: [1, 1] };
    case 3:
      return { ...base, mountain: 1, mountainShapes: [[2, 2], [2, 3], [2, 4]], tunnels: [2, 2], lakes: [0, 1] };
    case 4:
      return { ...base, stations: [1, 2], river: 0.3, bridges: [1, 1], mountain: 0.2, mountainShapes: [[2, 1], [3, 1]], tunnels: [1, 1] };
    case 5:
      return { ...base, river: 1, mountain: 1, mountainShapes: [[2, 1], [3, 1], [2, 2]], bridges: [1, 1], tunnels: [1, 1] };
    case 6:
      return { ...base, arrows: true, river: 0.3, bridges: [1, 1], mountain: 0.3, mountainShapes: [[2, 1], [3, 1]], tunnels: [1, 1], lakes: [0, 2] };
    case 7:
      return { ...base, stations: [2, 3], ordered: true, lakes: [0, 2], river: 0.2, bridges: [1, 1] };
    default:
      return { ...base, river: 1, mountain: 1, mountainShapes: [[2, 1], [3, 1], [2, 2]], bridges: [1, 1], tunnels: [1, 2], stations: [1, 2], ordered: rnd8(spec), arrows: false, lakes: [0, 1] };
  }
}
const rnd8 = (spec: Spec) => spec.n % 2 === 0;

/** Pick the board size. Intro levels use the chapter's smallest size. */
function sizeFor(rnd: Rnd, spec: Spec, band: Band): [number, number] {
  if (spec.kind === 'intro') return [band.cols[0], band.rows[0]];
  return [int(rnd, band.cols[0], band.cols[1]), int(rnd, band.rows[0], band.rows[1])];
}

function freeCells(g: Grid): [number, number][] {
  const out: [number, number][] = [];
  g.forEach((r, y) => r.forEach((c, x) => c === '.' && out.push([x, y])));
  return out;
}

/** Build a random board (terrain, sheds, stations). */
function makeBoard(rnd: Rnd, spec: Spec): Level | null {
  const band = bandOf(spec.chapter);
  const f = features(spec);
  const [cols, rows] = sizeFor(rnd, spec, band);
  const g: Grid = Array.from({ length: rows }, () => Array<string>(cols).fill('.'));
  const cap = Math.floor(0.3 * cols * rows);
  if (rnd() < f.river && !river(rnd, g, rnd() < 0.5)) return null;
  if (rnd() < f.mountain) {
    const shape = pickOne(rnd, f.mountainShapes);
    if (!blob(rnd, g, '^', shape[0] * shape[1], shape)) return null;
  }
  const lakes = int(rnd, f.lakes[0], f.lakes[1]);
  for (let i = 0; i < lakes; i++) if (!blob(rnd, g, 'L', int(rnd, 2, 3))) return null;
  const obst = int(rnd, f.obstacles[0], f.obstacles[1]);
  for (let i = 0; i < obst && blockedCount(g) < cap; i++) {
    const free = freeCells(g);
    const [x, y] = pickOne(rnd, free);
    g[y][x] = pickOne(rnd, ['R', 'H', 'T']);
  }
  if (blockedCount(g) > cap) return null;

  // Sheds: the start exit and the depot door must open onto grass.
  const openOnto = (x: number, y: number, d: number) => inb(g, x + DX[d], y + DY[d]) && g[y + DY[d]][x + DX[d]] === '.';
  const free = shuffle(rnd, freeCells(g));
  let A: [number, number, Dir] | null = null;
  let B: [number, number, Dir] | null = null;
  for (const [x, y] of free) {
    const dirs = shuffle(rnd, [0, 1, 2, 3] as Dir[]).filter((d) => openOnto(x, y, d));
    if (!A && dirs.length) {
      A = [x, y, dirs[0]];
      continue;
    }
    if (A && !B && dirs.length && Math.abs(x - A[0]) + Math.abs(y - A[1]) >= 2) {
      // Door must not be the start's front cell.
      const d = dirs.find((dd) => !(x + DX[dd] === A![0] + DX[A![2]] && y + DY[dd] === A![1] + DY[A![2]]));
      if (d === undefined) continue;
      B = [x, y, d];
      break;
    }
  }
  if (!A || !B) return null;
  g[A[1]][A[0]] = 'A';
  g[B[1]][B[0]] = 'B';
  const reserved = new Set([`${A[0] + DX[A[2]]},${A[1] + DY[A[2]]}`, `${B[0] + DX[B[2]]},${B[1] + DY[B[2]]}`]);

  const stations: { at: [number, number]; openings: 'NS' | 'EW'; order?: 1 | 2 | 3 }[] = [];
  // Ordered levels: 2 stations, 3 only now and then (3 rarely keeps solutions ≤ 2).
  const ns = f.ordered ? (rnd() < 0.2 ? 3 : 2) : int(rnd, f.stations[0], f.stations[1]);
  const open2 = (x: number, y: number) => [0, 1, 2, 3].filter((d) => openOnto(x, y, d)).length;
  for (const [x, y] of shuffle(rnd, freeCells(g))) {
    if (stations.length >= ns) break;
    if (reserved.has(`${x},${y}`)) continue;
    // Keep stations off the border so both platform sides lead somewhere.
    if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) continue;
    if (stations.some((s) => Math.abs(s.at[0] - x) + Math.abs(s.at[1] - y) < 2)) continue;
    const o = pickOne(rnd, ['NS', 'EW'] as const);
    const [a, b] = openingDirs(o);
    if (!openOnto(x, y, a) || !openOnto(x, y, b)) continue;
    if (open2(x + DX[a], y + DY[a]) < 2 || open2(x + DX[b], y + DY[b]) < 2) continue;
    g[y][x] = 'S';
    stations.push({ at: [x, y], openings: o });
  }
  if (stations.length < ns) return null;

  return {
    id: `L${String(spec.n).padStart(2, '0')}${spec.kind === 'sibling' ? 's' : ''}`,
    chapter: spec.chapter,
    kind: spec.kind,
    ...(spec.kind === 'sibling' ? { siblingOf: `L${String(spec.n).padStart(2, '0')}` } : {}),
    grid: g.map((r) => r.join('')),
    start: { exit: dirSide(A[2]) },
    depot: { entry: dirSide(B[2]) },
    ...(stations.length ? { stations } : {}),
    tray: [],
    rotate: plannedRotate(spec.n),
    placement: plannedPlacement(spec.chapter, spec.kind),
    solution: [],
  };
}

const withTray = (level: Level, c: Counts): Level => ({
  ...level,
  tray: PIECE_KINDS.filter((k) => c[k] > 0).map((piece) => ({ piece, count: c[piece] })),
});

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Ordered stations: the order whose shortest route is LONGER (counter-intuitive). */
function assignOrder(rnd: Rnd, level: Level, hand: Counts): Level | null {
  const st = level.stations ?? [];
  const options = permutations(st.map((_, i) => i)).map((perm) => {
    const l: Level = { ...level, stations: st.map((s, i) => ({ ...s, order: (perm.indexOf(i) + 1) as 1 | 2 | 3 })) };
    const len = solve(l, { shortest: true, hand, nodeLimit: 300_000 })[0]?.length ?? Infinity;
    return { l, len };
  });
  const ok = options.filter((o) => o.len < Infinity);
  if (ok.length < 2) return reject(`order-feasible-${ok.length}`);
  const shortest = Math.min(...ok.map((o) => o.len));
  const longer = ok.filter((o) => o.len > shortest);
  // Equal lengths: any order may still matter (checked later with orderMatters).
  if (longer.length === 0) return pickOne(rnd, ok).l;
  const minLonger = Math.min(...longer.map((o) => o.len));
  return pickOne(rnd, longer.filter((o) => o.len === minLonger)).l;
}

/** Block competing solutions with one-way straights, up to 2 arrows. */
function addArrows(rnd: Rnd, level: Level, route: Placed[], maxArrows = 2): Level {
  let l = level;
  const onRoute = new Set(route.map((p) => `${p.at[0]},${p.at[1]}`));
  for (let k = 0; k < maxArrows; k++) {
    const sols = solve(l, { cap: 50, nodeLimit: 400_000 });
    const hasArrow = (l.fixed ?? []).some((p) => p.oneWay);
    if (sols.length <= 2 && hasArrow) break;
    const rivals = sols.filter((s) => JSON.stringify(s) !== JSON.stringify(route));
    const cands: { at: [number, number]; openings: Openings; oneWay: Side }[] = [];
    for (const s of rivals) {
      const tr = trace(l, s);
      let dir: Dir = boardOf(l).startExit;
      for (const c of tr.path) {
        const piece = s.find((p) => p.at[0] === c.x && p.at[1] === c.y);
        const fx = boardOf(l).fixed.get(`${c.x},${c.y}`);
        const o = (piece ?? fx)!.openings;
        const entry = opposite(dir);
        const exit = openingDirs(o).find((d) => d !== entry)!;
        if (piece && piece.piece === 'straight' && !onRoute.has(`${c.x},${c.y}`)) cands.push({ at: [c.x, c.y], openings: o, oneWay: dirSide(entry) });
        dir = exit;
      }
    }
    if (cands.length === 0) break;
    const a = pickOne(rnd, cands);
    const fixed: PieceAt[] = [...(l.fixed ?? []), { at: a.at, piece: 'straight', openings: a.openings, oneWay: a.oneWay }];
    l = { ...l, fixed };
  }
  return l;
}

/** Turn a finished board into a repair level: pre-lay part of the route with faults. */
function makeRepair(rnd: Rnd, level: Level, route: Placed[], chapter: number): Level | null {
  const inv = { ...boardOf(level).inventory };
  const routeCounts = countsOf(route);
  const spare: Counts = { straight: inv.straight - routeCounts.straight, curve: inv.curve - routeCounts.curve, bridge: inv.bridge - routeCounts.bridge, tunnel: inv.tunnel - routeCounts.tunnel };
  const nFaults = chapter === 2 ? int(rnd, 1, 2) : int(rnd, 2, 3);
  const types = shuffle(rnd, ['orientation', 'kind', 'offRoute'] as const);
  const plan: ('orientation' | 'kind' | 'offRoute')[] = [];
  for (let i = 0; i < nFaults; i++) plan.push(chapter === 2 ? pickOne(rnd, types) : types[i % (i < 2 ? 2 : 3)]);
  const cells = shuffle(rnd, route.map((_, i) => i));
  const pre: Placed[] = [];
  const used = new Set<number>();
  const b = boardOf(level);
  for (const t of plan) {
    if (t === 'orientation') {
      const i = cells.find((j) => !used.has(j) && (route[j].piece === 'curve' || route[j].piece === 'straight'));
      if (i === undefined) return null;
      used.add(i);
      const p = route[i];
      const others = orientationsFor(p.piece).filter((o) => o !== p.openings);
      pre.push({ ...p, openings: pickOne(rnd, others) });
    } else if (t === 'kind') {
      const i = cells.find((j) => !used.has(j) && (route[j].piece === 'curve' || route[j].piece === 'straight'));
      if (i === undefined) return null;
      const other: PieceKind = route[i].piece === 'curve' ? 'straight' : 'curve';
      if (spare[other] <= 0) return null;
      spare[other]--;
      used.add(i);
      pre.push({ at: route[i].at, piece: other, openings: pickOne(rnd, orientationsFor(other)) });
    } else {
      const kinds = PIECE_KINDS.filter((k) => spare[k] > 0 && (k === 'straight' || k === 'curve'));
      if (kinds.length === 0) return null;
      const k = pickOne(rnd, kinds);
      const free: [number, number][] = [];
      for (let y = 0; y < b.rows; y++)
        for (let x = 0; x < b.cols; x++) {
          if (level.grid[y][x] !== '.') continue;
          if (route.some((p) => p.at[0] === x && p.at[1] === y) || pre.some((p) => p.at[0] === x && p.at[1] === y)) continue;
          free.push([x, y]);
        }
      if (free.length === 0) return null;
      spare[k]--;
      pre.push({ at: pickOne(rnd, free), piece: k, openings: pickOne(rnd, orientationsFor(k)) });
    }
  }
  // Most of the rest of the route is already laid, correctly.
  for (const i of cells) {
    if (used.has(i) || rnd() < 0.3) continue;
    pre.push({ ...route[i] });
  }
  const preCounts = countsOf(pre);
  const tray: Counts = { straight: inv.straight - preCounts.straight, curve: inv.curve - preCounts.curve, bridge: inv.bridge - preCounts.bridge, tunnel: inv.tunnel - preCounts.tunnel };
  if (PIECE_KINDS.some((k) => tray[k] < 0)) return null;
  const out = withTray({ ...level, preplaced: pre }, tray);
  if (out.tray.length === 0) return null;
  return out;
}

/** Evaluate a finished level against every rule. */
export function measure(level: Level, main?: Metrics): Candidate {
  const m = metricsOf(level);
  const sol = shortestSolution(level);
  const mech = mechanicsOf(level, sol);
  const x: Candidate = { level, m, mech, problems: [] };
  if ((level.preplaced ?? []).length) {
    x.faultTypes = faultTypes(level);
    x.initialFails = !trace(level, initialPieces(level)).success;
  }
  x.problems = [...validateLevel(level), ...levelProblems(x, main)];
  return x;
}

/** Cheap pre-checks before the full metrics. */
function quickReject(level: Level, spec: Spec): boolean {
  const band = bandOf(spec.chapter);
  const n = solve(level, { cap: 3, nodeLimit: 400_000 }).length;
  if (n === 0 || n > band.maxSolutions) return true;
  return false;
}

/** One candidate for `spec`, or null. */
export function candidate(rnd: Rnd, spec: Spec): Candidate | null {
  const band = bandOf(spec.chapter);
  const f = features(spec);
  let level = makeBoard(rnd, spec);
  if (!level) return reject('board');
  const g = level.grid.join('');
  const hand: Counts = {
    straight: 99,
    curve: 99,
    bridge: g.includes('~') ? int(rnd, f.bridges[0], f.bridges[1]) : 0,
    tunnel: g.includes('^') ? int(rnd, f.tunnels[0], f.tunnels[1]) : 0,
  };
  if (f.ordered && (level.stations ?? []).length >= 2) {
    const o = assignOrder(rnd, level, hand);
    if (!o) return reject('order');
    level = o;
  }
  const first = solve(level, { shortest: true, hand, nodeLimit: 300_000 })[0];
  if (!first) return reject('no-route');
  const m = first.length;
  const lenCap = spec.kind === 'sibling' && spec.main ? Math.max(5, spec.main.minLen - 2) : band.minLen[1];
  if (m > lenCap + 1) return reject('too-long');
  const target = Math.min(m + int(rnd, 0, 2), spec.kind === 'intro' ? band.minLen[0] + 2 : 99);
  const routes = solve(level, { cap: 200, hand, maxLen: target, nodeLimit: 300_000 }).filter((r) => r.length >= Math.min(target, m));
  if (routes.length === 0) return reject('no-route-of-length');
  let route = pickOne(rnd, routes);
  if (PIECE_KINDS.some((k) => countsOf(route)[k] > 9)) return reject('count>9');
  if (spec.intro === 'oneWay') {
    // The intro arrow sits ON the route, pointing the way the train goes.
    const tr = trace(level, route);
    const straights = route.filter((p) => p.piece === 'straight');
    if (straights.length === 0) return reject('no-straight');
    const p = pickOne(rnd, straights);
    let dir: Dir = boardOf(level).startExit;
    let exit: Dir = dir;
    for (const c of tr.path) {
      const q = route.find((r) => r.at[0] === c.x && r.at[1] === c.y) ?? boardOf(level).fixed.get(`${c.x},${c.y}`)!;
      exit = openingDirs(q.openings).find((d) => d !== opposite(dir))!;
      if (c.x === p.at[0] && c.y === p.at[1]) break;
      dir = exit;
    }
    level = { ...level, fixed: [...(level.fixed ?? []), { at: p.at, piece: 'straight', openings: p.openings, oneWay: dirSide(exit) }] };
    route = route.filter((r) => r !== p);
  }
  const counts = countsOf(route);

  // Distractors, added last.
  let dLo = band.distractors[0];
  let dHi = band.distractors[1];
  if (spec.n <= 6) [dLo, dHi] = [0, 1];
  if (spec.kind === 'intro') dLo = dHi = 0;
  if (spec.kind === 'sibling' && spec.main) {
    dHi = Math.max(0, spec.main.distractors - 2);
    dLo = spec.chapter === 5 ? Math.min(1, dHi) : 0;
  }
  const d = int(rnd, dLo, dHi);
  const weights: [PieceKind, number][] = [
    ['straight', 2],
    ['curve', 2],
    ['bridge', g.includes('~') ? 3 : 0],
    ['tunnel', g.includes('^') ? 3 : 0],
  ];
  if (spec.chapter === 5) {
    // Exactly one bridge and one tunnel in the inventory: the unused one is the lure.
    if (counts.bridge > 1 || counts.tunnel > 1) return reject('ch5-two-of-a-kind');
    const lure: PieceKind[] = [];
    if (counts.bridge === 0) lure.push('bridge');
    if (counts.tunnel === 0) lure.push('tunnel');
    if (lure.length === 0 || lure.length > d) return reject('ch5-no-lure');
    for (const k of lure) counts[k]++;
    for (let i = lure.length; i < d; i++) counts[pickOne(rnd, ['straight', 'curve'] as const)]++;
  } else {
    const totalW = weights.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < d; i++) {
      let r = rnd() * totalW;
      for (const [k, w] of weights) {
        r -= w;
        if (r < 0) {
          counts[k]++;
          break;
        }
      }
    }
  }
  level = withTray(level, counts);
  if (f.arrows) {
    if (spec.intro !== 'oneWay' || solve(level, { cap: 3 }).length > 2) level = addArrows(rnd, level, route, spec.intro === 'oneWay' ? 1 : 2);
    if (!(level.fixed ?? []).some((p) => p.oneWay)) return reject('no-arrow');
  }
  if (quickReject(level, spec)) return reject('solutions');
  if (spec.kind === 'repair') {
    const sol = solve(level, { shortest: true })[0];
    if (!sol) return reject('repair-no-route');
    const r = makeRepair(rnd, level, sol, spec.chapter);
    if (!r) return reject('repair-layout');
    level = r;
  }
  if (spec.intro) level = { ...level, intro: spec.intro };
  const sol = shortestSolution(level);
  if (!sol) return reject('no-solution');
  level = { ...level, solution: sol };
  return measure(level, spec.main);
}

/** Try up to `budget` candidates; return the accepted ones (problems = []). */
export function generate(spec: Spec, seed: number, count: number, budget = 4000, onTry?: (i: number, c: Candidate | null) => void): Candidate[] {
  const rnd = seeded(seed);
  const out: Candidate[] = [];
  for (let i = 0; i < budget && out.length < count; i++) {
    const c = candidate(rnd, spec);
    onTry?.(i, c);
    if (c && c.problems.length === 0) out.push(c);
  }
  return out;
}
