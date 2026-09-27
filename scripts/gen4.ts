// v4 level generator: seeded and program-first. `npm run gen4 -- <chapter> [seed] [--write]`
//
// For each level slot of a chapter:
//  1. draw a target program from the chapter's grammar;
//  2. expand it to a route on an empty board (fixed stations / one-way pieces are dropped in
//     front of the engine on chapter 4 and the finale) and put the depot at the route's end;
//  3. add terrain that kills competing programs (the most-used off-route cell of the
//     competitors' routes, one at a time) until `solutions` ≤ 3 and every band rule passes;
//  4. dress the board: grow the terrain into clusters where that keeps every rule.
// Bounded: at most 2,000 candidate programs per level (accept or skip). Among the accepted
// candidates the best-looking board wins (clustered terrain, a route that keeps off the edge).
// Levels are then ordered by (routeLen, slots) inside the chapter; the anchor levels (P01,
// P06, P21) are kept exactly as they are.

import { readFileSync, writeFileSync } from 'node:fs';
import { BANDS4, MAX_BLOCKED, isolatedCount, levelId4, levelProblems4, plannedKind4 } from '../src/game/bands4';
import { type Dir, opposite, turnLeft, turnRight } from '../src/game/grid';
import { type Openings, type PieceAt, type Side, type Station, SIDES, openingsOf } from '../src/game/level';
import { type ProgMetrics, bugsOf, enumerate, grammarOf, metricsOf, tokensOf } from '../src/game/progMetrics';
import {
  type Count,
  type Family,
  type ProgLevel,
  type Program,
  type Tok,
  COUNTS,
  depthOf,
  formatProgram,
  hasRepeat,
  movesOf,
  runProgram,
} from '../src/game/program';

// ---------- seeded randomness ----------

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rnd = () => number;
const pick = <T>(xs: readonly T[], rnd: Rnd): T => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number, rnd: Rnd) => lo + Math.floor(rnd() * (hi - lo + 1));

// ---------- the plan ----------

interface Spec {
  n: number;
  chapter: number;
  kind: ProgLevel['kind'];
  commands: Family;
  repeat: boolean;
  nesting: boolean;
  slots: [number, number];
  fslots: [number, number];
  boards: [number, number][];
  routeLen: [number, number];
  /** Fixed pieces dropped on the route: stations (ordered) and / or one-way pieces. */
  extras?: 'ch4' | 'finale';
  /** Target programs must pass this. */
  want?: (p: Program) => boolean;
}

const repeats = (row: readonly Tok[]): number => row.reduce((n, t) => n + (t.t === 'repeat' ? 1 + repeats(t.body) : 0), 0);
const longestBody = (row: readonly Tok[]): number => row.reduce((n, t) => (t.t === 'repeat' ? Math.max(n, t.body.length, longestBody(t.body)) : n), 0);
/** Some Repeat body holds a pattern (2+ tokens), not just one straight line. */
const patterned = (row: readonly Tok[]): boolean => row.some((t) => t.t === 'repeat' && (t.body.length >= 2 || patterned(t.body)));
const staticCalls = (row: readonly Tok[]): number => row.reduce((n, t) => n + (t.t === 'call' ? 1 : t.t === 'repeat' ? staticCalls(t.body) : 0), 0);

function plan(n: number): Spec {
  const chapter = Math.ceil(n / 5);
  const b = BANDS4[chapter - 1];
  const base = { n, chapter, kind: plannedKind4(n), repeat: b.repeat, fslots: [0, 0] as [number, number] };
  switch (chapter) {
    case 1:
      return { ...base, commands: 'absolute', nesting: false, slots: [8, 10], boards: [[5, 5], [6, 5], [5, 6]], routeLen: [8, 10] };
    case 2:
      return { ...base, commands: 'absolute', nesting: false, slots: [5, 6], boards: [[5, 5], [6, 5], [6, 6]], routeLen: [10, 12], want: (p) => hasRepeat(p.main) && patterned(p.main) };
    case 3:
      return {
        ...base, commands: 'absolute', nesting: false, slots: [5, 7], boards: [[6, 5], [6, 6]], routeLen: [11, 16],
        want: (p) => (repeats(p.main) >= 2 || longestBody(p.main) >= 3) && patterned(p.main),
      };
    case 4:
      return { ...base, commands: 'absolute', nesting: false, slots: [5, 8], boards: [[6, 5], [6, 6]], routeLen: [11, 16], extras: 'ch4', want: (p) => hasRepeat(p.main) && patterned(p.main) };
    case 5:
      return { ...base, commands: 'relative', nesting: false, slots: [4, 7], boards: [[6, 5], [6, 6]], routeLen: [13, 16], want: (p) => hasRepeat(p.main) && patterned(p.main) };
    case 6:
      return { ...base, commands: 'relative', nesting: true, slots: [5, 7], boards: [[6, 6]], routeLen: [13, 20], want: (p) => depthOf(p.main) === 2 };
    case 7:
      return {
        ...base, commands: 'relative', nesting: false, slots: [4, 5], fslots: [2, 3], boards: [[6, 6]], routeLen: [14, 22],
        want: (p) => staticCalls(p.main) >= 2 && hasRepeat([...p.main, ...p.p]),
      };
    default: {
      if (n === 40)
        return {
          ...base, commands: 'relative', nesting: true, slots: [6, 8], boards: [[6, 6]], routeLen: [17, 22], extras: 'finale',
          want: (p) => depthOf(p.main) === 2,
        };
      // Debug levels: one of each earlier grammar.
      const k = n - 36;
      if (k === 0) return { ...base, commands: 'absolute', nesting: false, slots: [5, 7], boards: [[6, 6], [6, 5]], routeLen: [16, 16], want: (p) => repeats(p.main) >= 2 };
      if (k === 1) return { ...base, commands: 'relative', nesting: false, slots: [5, 7], boards: [[6, 6], [6, 5]], routeLen: [15, 18], want: (p) => repeats(p.main) >= 2 };
      if (k === 2) return { ...base, commands: 'relative', nesting: true, slots: [5, 7], boards: [[6, 6]], routeLen: [14, 20], want: (p) => depthOf(p.main) === 2 };
      return { ...base, commands: 'relative', nesting: false, slots: [4, 5], fslots: [2, 3], boards: [[6, 6]], routeLen: [14, 22], want: (p) => staticCalls(p.main) >= 2 };
    }
  }
}

// ---------- programs ----------

/** The same program up to rotating / mirroring the board (absolute) or mirroring (relative). */
export function shapeKey(src: string): string {
  const maps = [
    ['NESW', 'ESWN'], ['NESW', 'SWNE'], ['NESW', 'WNES'], ['NESW', 'NESW'],
    ['NESW', 'NWSE'], ['NESW', 'ENWS'], ['NESW', 'SENW'], ['NESW', 'WSEN'],
  ];
  const keys = maps.map(([a, b]) => [...src].map((c) => (a.includes(c) ? b[a.indexOf(c)] : c)).join(''));
  keys.push([...src].map((c) => (c === 'L' ? 'R' : c === 'R' ? 'L' : c)).join(''), src);
  return keys.sort()[0];
}

function randomRow(pl: ProgLevel, row: 'main' | 'p', s: number, rnd: Rnd): Tok[] {
  const g = grammarOf(pl, row);
  const fam = movesOf(pl.commands);
  const out: Tok[] = [];
  let left = s;
  while (left > 0) {
    const costs = [];
    for (let c = 1; c <= left; c++) if (tokensOf(g, fam, c).length) costs.push(c);
    // Favour Repeats a little: they are what the chapter is about.
    const c = rnd() < 0.55 && costs.length > 1 ? pick(costs.slice(1), rnd) : pick(costs, rnd);
    out.push(pick(tokensOf(g, fam, c), rnd));
    left -= c;
  }
  return out;
}

// ---------- expansion on an empty board ----------

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const side = (d: Dir): Side => SIDES[d];

interface Expanded {
  route: [number, number][];
  depot: [number, number];
  depotEntry: Side;
  fixed: PieceAt[];
  stations: Station[];
}

/** Run `prog` from `start` on an empty cols × rows board, dropping fixed pieces before the chosen moves. */
function expand(pl: ProgLevel, prog: Program, start: [number, number], exit: Dir, drops: Map<number, 'station' | 'arrow'>, rnd: Rnd): Expanded | null {
  const cols = pl.grid[0].length;
  const rows = pl.grid.length;
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  let [x, y] = start;
  let h = exit;
  let moves = 0;
  let order = 0;
  const route: [number, number][] = [];
  const fixed: PieceAt[] = [];
  const stations: Station[] = [];
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && !seen.has(`${cx},${cy}`);
  const enter = (cx: number, cy: number, nh: Dir) => {
    seen.add(`${cx},${cy}`);
    route.push([cx, cy]);
    x = cx;
    y = cy;
    h = nh;
  };
  const move = (m: string): boolean => {
    const drop = drops.get(moves);
    if (drop) {
      const fx = x + DX[h];
      const fy = y + DY[h];
      if (!free(fx, fy)) return false;
      const entry = opposite(h);
      if (drop === 'station') {
        stations.push({ at: [fx, fy], openings: openingsOf(entry, h) as 'NS' | 'EW', order: (++order) as 1 | 2 | 3 });
        enter(fx, fy, h);
      } else {
        const out = pick([h, turnLeft(h), turnRight(h)], rnd);
        const o: Openings = openingsOf(entry, out);
        fixed.push({ at: [fx, fy], piece: out === h ? 'straight' : 'curve', openings: o, oneWay: side(out) });
        enter(fx, fy, out);
      }
    }
    moves++;
    const fx = x + DX[h];
    const fy = y + DY[h];
    if (!free(fx, fy)) return false;
    let nh: Dir;
    if (pl.commands === 'relative') nh = m === 'L' ? turnLeft(h) : m === 'R' ? turnRight(h) : h;
    else {
      nh = 'NESW'.indexOf(m) as Dir;
      if (nh === opposite(h)) return false;
    }
    enter(fx, fy, nh);
    return true;
  };
  const run = (row: readonly Tok[]): boolean => {
    for (const t of row) {
      if (t.t === 'move' && !move(t.m)) return false;
      if (t.t === 'repeat') for (let k = 0; k < t.n; k++) if (!run(t.body)) return false;
      if (t.t === 'call' && !run(prog.p)) return false;
    }
    return true;
  };
  if (!run(prog.main)) return null;
  const dx = x + DX[h];
  const dy = y + DY[h];
  if (!free(dx, dy)) return null;
  return { route, depot: [dx, dy], depotEntry: side(opposite(h)), fixed, stations };
}

function countMoves(prog: Program): number {
  const run = (row: readonly Tok[]): number => row.reduce((n, t) => n + (t.t === 'move' ? 1 : t.t === 'repeat' ? t.n * run(t.body) : t.t === 'call' ? run(prog.p) : 0), 0);
  return run(prog.main);
}

// ---------- terrain ----------

const setCell = (grid: string[], x: number, y: number, ch: string) => {
  grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1);
};

/** Give each 4-connected blocked cluster one kind of terrain (lakes only as 2+ cells). */
function paint(grid: string[], rnd: Rnd): string[] {
  const out = [...grid];
  const cols = grid[0].length;
  const rows = grid.length;
  const seen = new Set<string>();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (out[y][x] !== '#' || seen.has(`${x},${y}`)) continue;
      const comp: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        comp.push([cx, cy]);
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d];
          const ny = cy + DY[d];
          if (out[ny]?.[nx] === '#' && !seen.has(`${nx},${ny}`)) {
            seen.add(`${nx},${ny}`);
            stack.push([nx, ny]);
          }
        }
      }
      const ch = comp.length >= 2 ? pick(['L', 'L', 'T', 'H', 'R'], rnd) : pick(['T', 'H', 'R'], rnd);
      for (const [cx, cy] of comp) setCell(out, cx, cy, ch);
    }
  return out;
}

interface Built {
  level: ProgLevel;
  m: ProgMetrics;
  problems: string[];
}

function measure(level: ProgLevel): Built {
  const m = metricsOf(level);
  return { level, m, problems: levelProblems4(level, m) };
}

const KILL_CAP = 120;
const MAX_KILLS = 14;

/** Block the most-used off-route cell of competing solutions until the level passes (or cannot). */
function killCompetitors(level: ProgLevel, target: Set<string>, rnd: Rnd, protect: Set<string> = new Set()): ProgLevel | null {
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  let grid = [...level.grid];
  for (let k = 0; k <= MAX_KILLS; k++) {
    const cur = { ...level, grid };
    const e = enumerate(cur, KILL_CAP);
    if (!e.solutions.length) return null;
    const blockedNow = [...grid.join('')].filter((c) => c === '#').length;
    if (e.solutions.length <= 3) return cur;
    const freq = new Map<number, number>();
    for (const s of e.solutions) {
      for (const c of s.route.split(',').map(Number)) {
        const key = `${c % cols},${Math.floor(c / cols)}`;
        if (target.has(key)) continue;
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
    if (freq.size === 0) return null; // the competitors ride the target's own route
    if (blockedNow + 1 > MAX_BLOCKED * cols * rows) return null;
    let best = -1;
    let bestScore = -1;
    for (const [c, f] of freq) {
      const x = c % cols;
      const y = Math.floor(c / cols);
      if (grid[y][x] !== '.') continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grid[y + dy]?.[x + dx] === '#') near = 1;
      const score = (f * (1 + 0.35 * near) + rnd() * 0.5) * (protect.has(`${x},${y}`) ? 0.01 : 1);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) return null;
    grid = [...grid];
    setCell(grid, best % cols, Math.floor(best / cols), '#');
  }
  return null;
}

/** Grow clusters: add blocked cells next to lonely ones, up to a target share of the board. */
function dress(grid: string[], target: Set<string>, rnd: Rnd): string[] {
  const out = [...grid];
  const cols = grid[0].length;
  const rows = grid.length;
  const share = 0.16 + rnd() * 0.12;
  const blocked = () => [...out.join('')].filter((c) => c === '#').length;
  // Seed a few clusters on an open board (off the route and not next to the start or depot doors).
  const free: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (out[y][x] === '.' && !target.has(`${x},${y}`)) free.push([x, y]);
  const clusters = () => {
    let n = 0;
    const seen = new Set<string>();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (out[y][x] !== '#' || seen.has(`${x},${y}`)) continue;
        n++;
        const st = [[x, y]];
        seen.add(`${x},${y}`);
        while (st.length) {
          const [cx, cy] = st.pop()!;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (out[cy + dy]?.[cx + dx] === '#' && !seen.has(`${cx + dx},${cy + dy}`)) {
                seen.add(`${cx + dx},${cy + dy}`);
                st.push([cx + dx, cy + dy]);
              }
        }
      }
    return n;
  };
  const wantClusters = 2 + Math.floor(rnd() * 2);
  for (let k = 0; k < 10 && clusters() < wantClusters && free.length; k++) {
    const [x, y] = free.splice(Math.floor(rnd() * free.length), 1)[0];
    if (out[y][x] === '.') setCell(out, x, y, '#');
  }
  for (let tries = 0; tries < 60 && blocked() < share * cols * rows; tries++) {
    const cands: [number, number, number][] = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (out[y][x] !== '.' || target.has(`${x},${y}`)) continue;
        let near = 0;
        let lonely = 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (out[ny]?.[nx] === '#') {
            near++;
            let others = 0;
            for (let e = 0; e < 4; e++) if (out[ny + DY[e]]?.[nx + DX[e]] === '#') others++;
            if (others === 0) lonely++;
          }
        }
        if (near > 0) cands.push([x, y, lonely * 3 + near + rnd()]);
      }
    if (!cands.length) break;
    cands.sort((a, b) => b[2] - a[2]);
    const [x, y] = cands[0];
    setCell(out, x, y, '#');
  }
  return out;
}

/** Share of route cells on the board's edge (lower looks better). */
function edgeShare(level: ProgLevel, route: [number, number][]): number {
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  return route.filter(([x, y]) => x === 0 || y === 0 || x === cols - 1 || y === rows - 1).length / route.length;
}

// ---------- one level ----------

const MAX_CANDIDATES = 2000;
const WANT_ACCEPTED = 3;

export interface GenStats {
  candidates: number;
  unwanted: number;
  noPlacement: number;
  noKill: number;
  bands: number;
  noLure: number;
  accepted: number;
}

/** `k` one-way fixed pieces on grass cells next to the route (not on it). */
function withOffRouteArrows(level: ProgLevel, target: Set<string>, k: number, rnd: Rnd): ProgLevel | null {
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  const taken = new Set([...target, ...(level.fixed ?? []).map((p) => `${p.at[0]},${p.at[1]}`)]);
  const cells: [number, number][] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (level.grid[y][x] !== '.' || taken.has(`${x},${y}`)) continue;
      if ([0, 1, 2, 3].some((d) => target.has(`${x + DX[d]},${y + DY[d]}`))) cells.push([x, y]);
    }
  if (cells.length < k) return null;
  const fixed = [...(level.fixed ?? [])];
  for (let i = 0; i < k; i++) {
    const at = cells.splice(Math.floor(rnd() * cells.length), 1)[0];
    const a = int(0, 3, rnd) as Dir;
    const b = pick([opposite(a), turnLeft(a), turnRight(a)], rnd);
    const o = openingsOf(a, b);
    fixed.push({ at, piece: b === opposite(a) ? 'straight' : 'curve', openings: o, oneWay: pick([side(a), side(b)], rnd) });
  }
  return { ...level, fixed };
}

/** Route cells of one program that solves the level without station order / arrows but not with them. */
function luresOf(level: ProgLevel, rnd: Rnd): Set<string> | null {
  const cols = level.grid[0].length;
  const stripped: ProgLevel = {
    ...level,
    stations: level.stations?.map(({ order: _o, ...s }) => s),
    fixed: level.fixed?.map(({ oneWay: _w, ...p }) => p),
  };
  const found = enumerate(stripped, 400).solutions.filter((s) => !runProgram(level, s.program).success);
  if (!found.length) return null;
  const lure = pick(found, rnd);
  return new Set(lure.route.split(',').map(Number).map((c) => `${c % cols},${Math.floor(c / cols)}`));
}

/** Every edge start cell and inward exit of a cols × rows board, shuffled. */
function placements(boards: [number, number][], rnd: Rnd): { cols: number; rows: number; start: [number, number]; exit: Dir }[] {
  const out: { cols: number; rows: number; start: [number, number]; exit: Dir; k: number }[] = [];
  for (const [cols, rows] of boards)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) continue;
        for (const d of [0, 1, 2, 3] as Dir[]) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push({ cols, rows, start: [x, y], exit: d, k: rnd() });
        }
      }
  return out.sort((a, b) => a.k - b.k);
}

export function generateLevel(spec: Spec, seed: number, used: Set<string>, log = (_: string) => {}, stats?: GenStats): Built | null {
  const rnd = seeded(seed);
  const st: GenStats = stats ?? { candidates: 0, unwanted: 0, noPlacement: 0, noKill: 0, bands: 0, noLure: 0, accepted: 0 };
  const accepted: (Built & { score: number })[] = [];
  for (let cand = 0; cand < MAX_CANDIDATES && accepted.length < WANT_ACCEPTED; cand++) {
    st.candidates++;
    const slots = int(spec.slots[0], spec.slots[1], rnd);
    const fslots = int(spec.fslots[0], spec.fslots[1], rnd);
    const shellOf = (cols: number, rows: number): ProgLevel => ({
      id: levelId4(spec.n),
      chapter: spec.chapter,
      kind: spec.kind,
      grid: Array.from({ length: rows }, () => '.'.repeat(cols)),
      start: { exit: 'E' },
      depot: { entry: 'W' },
      commands: spec.commands,
      repeat: spec.repeat,
      nesting: spec.nesting,
      slots,
      fslots,
      solution: '',
    });
    // 1. a target program
    let prog: Program;
    const shell0 = shellOf(6, 6);
    if (!spec.repeat) {
      const moves: string[] = [];
      let h = int(0, 3, rnd);
      for (let i = 0; i < slots; i++) {
        h = pick([0, 1, 2, 3].filter((d) => d !== (h + 2) % 4), rnd);
        moves.push('NESW'[h]);
      }
      prog = { main: moves.map((m) => ({ t: 'move', m }) as Tok), p: [] };
    } else {
      // Relative programs that turn a lot curl up and hit themselves: draw a few and keep
      // the straightest (still a program of the chapter's grammar).
      const draws: Program[] = [];
      for (let k = 0; k < (spec.commands === 'relative' ? (fslots > 0 ? 12 : 4) : 1); k++) {
        if (fslots > 0) {
          // P row levels: the main row calls P at least twice (two Calls placed first).
          const p = randomRow(shell0, 'p', fslots, rnd);
          const main = randomRow(shell0, 'main', slots - 2, rnd);
          for (let c = 0; c < 2; c++) main.splice(int(0, main.length, rnd), 0, { t: 'call' });
          draws.push({ main, p });
        } else draws.push({ main: randomRow(shell0, 'main', slots, rnd), p: [] });
      }
      const straight = (q: Program) => {
        const src = formatProgram(q);
        return (src.split('F').length - 1) / Math.max(1, src.replace(/[^FLR]/g, '').length) + rnd() * 0.2;
      };
      prog = draws.sort((a, b) => straight(b) - straight(a))[0];
    }
    if (used.has(shapeKey(formatProgram(prog)))) {
      st.unwanted++;
      continue;
    }
    if (spec.want && !spec.want(prog)) {
      st.unwanted++;
      continue;
    }
    const drops = new Map<number, 'station' | 'arrow'>();
    if (spec.extras) {
      const total = countMoves(prog);
      const kinds: ('station' | 'arrow')[] =
        spec.extras === 'finale' ? ['station', 'station'] : pick([['station', 'station'], ['arrow'], ['arrow', 'arrow'], ['station', 'station', 'arrow']] as const, rnd).slice();
      const at = new Set<number>();
      while (at.size < kinds.length && at.size < total - 1) at.add(int(1, total - 1, rnd));
      [...at].sort((a, b) => a - b).forEach((i, k) => drops.set(i, kinds[k]));
    }
    // 2. expand: every edge start and exit of the chapter's boards, first fit wins
    let placed: { shell: ProgLevel; ex: Expanded; start: [number, number]; exit: Dir } | null = null;
    for (const pc of placements(spec.boards, rnd)) {
      const shell = shellOf(pc.cols, pc.rows);
      const ex = expand(shell, prog, pc.start, pc.exit, drops, rnd);
      if (!ex) continue;
      const laid = ex.route.length - ex.fixed.length - ex.stations.length;
      if (laid < spec.routeLen[0] || laid > spec.routeLen[1]) continue;
      placed = { shell, ex, start: pc.start, exit: pc.exit };
      break;
    }
    if (!placed) {
      st.noPlacement++;
      continue;
    }
    const { shell, ex } = placed;
    const [sx, sy] = placed.start;
    // 3. the board
    const grid = [...shell.grid];
    setCell(grid, sx, sy, 'A');
    setCell(grid, ex.depot[0], ex.depot[1], 'B');
    for (const s of ex.stations) setCell(grid, s.at[0], s.at[1], 'S');
    const level: ProgLevel = {
      ...shell,
      grid,
      start: { exit: side(placed.exit) },
      depot: { entry: ex.depotEntry },
      ...(ex.stations.length ? { stations: ex.stations } : {}),
      ...(ex.fixed.length ? { fixed: ex.fixed } : {}),
      solution: formatProgram(prog),
    };
    if (!runProgram(level, prog).success) continue;
    const target = new Set([`${sx},${sy}`, `${ex.depot[0]},${ex.depot[1]}`, ...ex.route.map(([x, y]) => `${x},${y}`)]);
    // Chapter 4: keep one lure alive (a program that works only if order / arrows are ignored).
    let protect = new Set<string>();
    let base = level;
    if (spec.extras === 'ch4') {
      let lure = luresOf(level, rnd);
      // No lure yet: try one-way track beside the route (it may only be ridden one way).
      for (let k = 0; k < 25 && !lure; k++) {
        const tryLevel = withOffRouteArrows(level, target, int(1, 2, rnd), rnd);
        if (!tryLevel || !runProgram(tryLevel, prog).success) continue;
        lure = luresOf(tryLevel, rnd);
        if (lure) base = tryLevel;
      }
      if (!lure) {
        st.noLure++;
        continue;
      }
      protect = lure;
    }
    const killed = killCompetitors(base, target, rnd, protect);
    if (!killed) {
      st.noKill++;
      continue;
    }
    // 4. dress, paint, measure
    let done: Built | null = null;
    for (const g of [dress(killed.grid, target, rnd), killed.grid]) {
      const lv: ProgLevel = { ...killed, grid: paint(g, rnd) };
      if (spec.kind === 'debug') {
        const given = makeGiven(lv, prog, rnd);
        if (!given) break;
        lv.given = given;
      }
      const b = measure(lv);
      if (b.problems.length === 0) {
        done = b;
        break;
      }
      log(`  cand ${cand}: ${b.problems.join('; ')}`);
    }
    if (!done) {
      st.bands++;
      continue;
    }
    st.accepted++;
    const score = edgeShare(done.level, ex.route) + 0.15 * isolatedCount(done.level.grid) + (done.m.solutions - 1) * 0.1;
    log(`  accepted cand ${cand}: ${done.level.solution} routeLen ${done.m.routeLen} sols ${done.m.solutions} score ${score.toFixed(2)}`);
    accepted.push({ ...done, score });
  }
  log(`  stats ${JSON.stringify(st)}`);
  if (!accepted.length) return null;
  accepted.sort((a, b) => a.score - b.score);
  return accepted[0];
}

/** Debug levels: the solution with 1–3 tokens changed so that it fails (bugs = changes needed). */
function makeGiven(level: ProgLevel, prog: Program, rnd: Rnd): string | null {
  for (let tries = 0; tries < 40; tries++) {
    const p: Program = JSON.parse(JSON.stringify(prog));
    const sites: (() => void)[] = [];
    const walk = (row: Tok[]) => {
      for (const t of row) {
        if (t.t === 'move') sites.push(() => (t.m = pick(movesOf(level.commands).filter((m) => m !== t.m), rnd)));
        if (t.t === 'repeat') {
          sites.push(() => (t.n = pick(COUNTS.filter((c) => c !== t.n), rnd) as Count));
          walk(t.body);
        }
      }
    };
    walk(p.main);
    walk(p.p);
    const k = int(2, 3, rnd);
    const chosen = new Set<number>();
    while (chosen.size < Math.min(k, sites.length)) chosen.add(int(0, sites.length - 1, rnd));
    for (const i of chosen) sites[i]();
    const r = runProgram(level, p);
    // The given program should get somewhere before it stops.
    if (r.success || r.path.length < 3) continue;
    const bugs = bugsOf(level, p);
    if (bugs >= 1 && bugs <= 3) return formatProgram(p);
  }
  return null;
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(3);
  const write = args.includes('--write');
  const nums = args.filter((a) => !a.startsWith('--'));
  const chapter = Number(nums[0]);
  const seed = Number(nums[1] ?? 1);
  const only = nums[2] ? Number(nums[2]) : null;
  if (args.includes('--reorder')) return reorder(chapter);
  const file = 'src/game/levels4.json';
  const levels: ProgLevel[] = JSON.parse(readFileSync(file, 'utf8'));
  const anchors = new Set(['P01', 'P06', 'P21']);
  const band = BANDS4[chapter - 1];
  const out: Built[] = [];
  // No program twice in the set.
  const used = new Set(levels.filter((l) => l.chapter !== chapter || anchors.has(l.id)).map((l) => shapeKey(l.solution)));
  for (let n = band.levels[0]; n <= band.levels[1]; n++) {
    const id = levelId4(n);
    if (only !== null && n !== only) continue;
    if (anchors.has(id)) {
      const a = levels.find((l) => l.id === id);
      if (a) out.push(measure(a));
      continue;
    }
    const t0 = Date.now();
    console.error(`${id}: generating (seed ${seed})`);
    const b = generateLevel(plan(n), seed * 1000 + n, used, (s) => console.error(s));
    if (!b) {
      console.error(`${id}: no level within ${MAX_CANDIDATES} candidates`);
      continue;
    }
    used.add(shapeKey(b.level.solution));
    console.error(`${id}: ${b.level.solution} | routeLen ${b.m.routeLen} slots ${b.level.slots} sols ${b.m.solutions} ratio ${Math.floor(b.m.guessRatio)} (${Date.now() - t0} ms)`);
    out.push(b);
  }
  if (only === null) {
    // Order by (routeLen, slots), anchors first on ties; then renumber.
    out.sort((a, b) => a.m.routeLen - b.m.routeLen || a.level.slots - b.level.slots || +anchors.has(b.level.id) - +anchors.has(a.level.id));
    const wantKinds = out.map((_, i) => plannedKind4(band.levels[0] + i));
    if (chapter === 8) {
      // Keep the finale last and the debug levels in front of it.
      out.sort((a, b) => +(a.level.kind === 'finale') - +(b.level.kind === 'finale') || a.m.routeLen - b.m.routeLen || a.level.slots - b.level.slots);
    }
    out.forEach((b, i) => {
      if (!anchors.has(b.level.id)) b.level.id = levelId4(band.levels[0] + i);
      if (b.level.kind !== wantKinds[i]) console.error(`warning: ${b.level.id} kind ${b.level.kind}, planned ${wantKinds[i]}`);
    });
  }
  for (const b of out) console.log(JSON.stringify(b.level));
  if (write) {
    const merged = [...levels.filter((l) => !out.some((b) => b.level.id === l.id)), ...out.map((b) => b.level)].sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(file, `[\n${merged.map((l) => ' ' + JSON.stringify(l)).join(',\n')}\n]\n`);
    console.error(`wrote ${file}`);
  }
}

/** Re-sort one chapter of levels4.json by (routeLen, slots) and renumber it (anchors stay first on ties). */
function reorder(chapter: number) {
  const file = 'src/game/levels4.json';
  const levels: ProgLevel[] = JSON.parse(readFileSync(file, 'utf8'));
  const band = BANDS4[chapter - 1];
  const anchors = new Set(['P01', 'P06', 'P21']);
  const mine = levels.filter((l) => l.chapter === chapter).map((l) => ({ l, m: metricsOf(l) }));
  mine.sort(
    (a, b) =>
      +(a.l.kind === 'finale') - +(b.l.kind === 'finale') ||
      a.m.routeLen - b.m.routeLen ||
      a.l.slots - b.l.slots ||
      +anchors.has(b.l.id) - +anchors.has(a.l.id),
  );
  mine.forEach((x, i) => (x.l.id = levelId4(band.levels[0] + i)));
  const merged = [...levels.filter((l) => l.chapter !== chapter), ...mine.map((x) => x.l)].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(file, `[\n${merged.map((l) => ' ' + JSON.stringify(l)).join(',\n')}\n]\n`);
  for (const x of mine) console.error(`${x.l.id}: ${x.l.solution} routeLen ${x.m.routeLen} slots ${x.l.slots}`);
}

if (process.argv[1]?.endsWith('run-ts.mjs')) main();
