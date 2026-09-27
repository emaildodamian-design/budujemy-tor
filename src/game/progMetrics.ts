// v4 difficulty metrics: the program grammar, the candidate count in closed form, and a
// depth-first enumerator of every program that fits the rows. Pure and deterministic.
//
// Grammar of a level: its move family (4 absolute or 3 relative moves); Repeat with count
// 2–5 and a body of 1–3 tokens when the level has loops; a Repeat inside a body only when
// `nesting` (at most MAX_DEPTH deep); a Call in the main row when `fslots > 0` (P never
// calls P). Programs are token trees as written: no deduplication.

import { naiveLenOf, withoutArrows, withoutOrder } from './metrics';
import {
  type Count,
  type ProgLevel,
  type Program,
  type Row,
  type Tok,
  BODY_MAX,
  BODY_MIN,
  CALL,
  COUNTS,
  MAX_DEPTH,
  Machine,
  callsOf,
  depthOf,
  formatProgram,
  givenOf,
  hasRepeat,
  levelView,
  movesOf,
  mv,
  rep,
} from './program';

export const SOLUTION_CAP = 50;

export interface Grammar {
  moves: number;
  repeat: boolean;
  nesting: boolean;
  call: boolean;
}

export function grammarOf(pl: ProgLevel, row: Row): Grammar {
  return { moves: movesOf(pl.commands).length, repeat: pl.repeat, nesting: pl.nesting, call: row === 'main' && pl.fslots > 0 };
}

const canRepeatAt = (g: Grammar, depth: number) => g.repeat && (depth === 0 || (g.nesting && depth < MAX_DEPTH));

// ---------- closed form ----------

/** Number of tokens of cost `c` allowed at nesting depth `depth` (0 = a row). */
export function tokenCount(g: Grammar, c: number, depth = 0): number {
  if (c === 1) return g.moves + (g.call ? 1 : 0);
  if (c < 2 || !canRepeatAt(g, depth)) return 0;
  return COUNTS.length * bodyCount(g, c - 1, depth + 1);
}

/** Number of Repeat bodies (1–3 tokens at `depth`) of total cost k. */
export function bodyCount(g: Grammar, k: number, depth: number): number {
  // seq[j][s]: sequences of j tokens with total cost s.
  let prev = new Array(k + 1).fill(0);
  prev[0] = 1;
  let total = 0;
  for (let j = 1; j <= BODY_MAX; j++) {
    const cur = new Array(k + 1).fill(0);
    for (let s = 1; s <= k; s++) for (let c = 1; c <= s; c++) cur[s] += prev[s - c] * tokenCount(g, c, depth);
    if (j >= BODY_MIN) total += cur[k];
    prev = cur;
  }
  return total;
}

/** f(0) = 1, f(s) = Σ_c t(c)·f(s − c): rows of exactly s slots. */
export function rowCount(g: Grammar, s: number): number {
  const f = [1];
  for (let n = 1; n <= s; n++) {
    let v = 0;
    for (let c = 1; c <= n; c++) v += tokenCount(g, c) * f[n - c];
    f.push(v);
  }
  return f[s];
}

/** Syntactically valid programs that fit the rows exactly. */
export function candidatesOf(pl: ProgLevel): number {
  return rowCount(grammarOf(pl, 'main'), pl.slots) * (pl.fslots > 0 ? rowCount(grammarOf(pl, 'p'), pl.fslots) : 1);
}

// ---------- materialised tokens ----------

const tokCache = new Map<string, Tok[]>();
const gkey = (g: Grammar) => `${g.moves}${+g.repeat}${+g.nesting}${+g.call}`;

function leaves(g: Grammar, family: readonly string[]): Tok[] {
  const out = family.map((m) => mv(m as never));
  if (g.call) out.push(CALL);
  return out;
}

/** Every token of cost c at nesting depth `depth`, in a fixed order. */
export function tokensOf(g: Grammar, family: readonly string[], c: number, depth = 0): Tok[] {
  const key = `${gkey(g)}${family.join('')}:${c}:${depth}`;
  let out = tokCache.get(key);
  if (out) return out;
  out = [];
  if (c === 1) out = leaves(g, family);
  else if (c >= 2 && canRepeatAt(g, depth)) {
    const bodies = bodiesOf(g, family, c - 1, depth + 1);
    for (const n of COUNTS) for (const body of bodies) out.push(rep(n as Count, body));
  }
  tokCache.set(key, out);
  return out;
}

function bodiesOf(g: Grammar, family: readonly string[], k: number, depth: number): Tok[][] {
  const out: Tok[][] = [];
  const walk = (acc: Tok[], left: number) => {
    if (left === 0) {
      if (acc.length >= BODY_MIN) out.push(acc);
      return;
    }
    if (acc.length === BODY_MAX) return;
    for (let c = 1; c <= left; c++) for (const t of tokensOf(g, family, c, depth)) walk([...acc, t], left - c);
  };
  walk([], k);
  return out;
}

/** Every row of exactly s slots (small s only: tests and P rows). */
export function rowsOf(g: Grammar, family: readonly string[], s: number): Tok[][] {
  const out: Tok[][] = [];
  const walk = (acc: Tok[], left: number) => {
    if (left === 0) return void out.push(acc);
    for (let c = 1; c <= left; c++) for (const t of tokensOf(g, family, c)) walk([...acc, t], left - c);
  };
  walk([], s);
  return out;
}

// ---------- the enumerator ----------

export interface Found {
  program: Program;
  /** Distinct-route key (cells entered, in order). */
  route: string;
  /** Pieces laid. */
  laid: number;
}

export interface EnumResult {
  solutions: Found[];
  capped: boolean;
  /** Tokens executed (a size measure for the PR's timing notes). */
  nodes: number;
}

/**
 * Depth-first, left to right. Every completed top-level token is executed at once (a
 * Repeat runs its whole body `count` times) and the branch is pruned at the first stop.
 * With a P row, the P row is enumerated first.
 */
export function enumerate(pl: ProgLevel, cap = SOLUTION_CAP): EnumResult {
  const fam = movesOf(pl.commands);
  const gm = grammarOf(pl, 'main');
  const pRows = pl.fslots > 0 ? rowsOf(grammarOf(pl, 'p'), fam, pl.fslots) : [[]];
  const byCost: Tok[][] = [[]];
  for (let c = 1; c <= pl.slots; c++) byCost.push(tokensOf(gm, fam, c));
  const m = new Machine(pl);
  const solutions: Found[] = [];
  let nodes = 0;
  let capped = false;
  const stack: Tok[] = [];
  let pRow: Tok[] = [];

  const dfs = (rem: number): void => {
    if (rem === 0) {
      if (m.finish()) {
        if (solutions.length >= cap) {
          capped = true;
          return;
        }
        solutions.push({ program: { main: [...stack], p: pRow }, route: m.routeKey(), laid: m.laidCount() });
      }
      m.stop = null;
      return;
    }
    for (let c = 1; c <= rem && !capped; c++) {
      for (const t of byCost[c]) {
        const mk = m.mark();
        nodes++;
        if (m.exec(t)) {
          stack.push(t);
          dfs(rem - c);
          stack.pop();
        }
        m.undo(mk);
        if (capped) return;
      }
    }
  };

  for (const p of pRows) {
    pRow = p;
    m.p = p;
    m.reset();
    if (m.stop) break; // the track in front of the start shed is already wrong
    dfs(pl.slots);
    if (capped) break;
  }
  return { solutions, capped, nodes };
}

// ---------- metrics ----------

export interface ProgMetrics {
  candidates: number;
  /** Candidates that succeed (capped at 50). */
  solutions: number;
  /** Distinct routes among the solutions. */
  routes: number;
  /** Pieces laid by the shortest-route solution. */
  routeLen: number;
  guessRatio: number;
  /** The level allows Repeat and no solution is loop-free. */
  needsLoop: boolean;
  /** Minimum over solutions of the deepest Repeat nesting. */
  nestDepth: number;
  /** Every solution calls P at least twice. */
  needsFunction: boolean;
  /** Every solution has ≥ 2 Repeats or a 3-token body (chapter 3). */
  loopRich: boolean;
  /** Debug levels: fewest single-token substitutions from `given` to a solution (null: not a debug level). */
  bugs: number | null;
  naiveLen: number;
  detour: number;
  stationsMatter: boolean;
  arrowsMatter: boolean;
  /** Tokens the enumerator executed. */
  nodes: number;
}

const repeatsIn = (row: readonly Tok[]): number => row.reduce((n, t) => n + (t.t === 'repeat' ? 1 + repeatsIn(t.body) : 0), 0);
const longestBody = (row: readonly Tok[]): number => row.reduce((n, t) => (t.t === 'repeat' ? Math.max(n, t.body.length, longestBody(t.body)) : n), 0);

const solutionSet = (pl: ProgLevel) => new Set(enumerate(pl).solutions.map((s) => formatProgram(s.program)));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function metricsOf(pl: ProgLevel): ProgMetrics {
  const e = enumerate(pl);
  const sols = e.solutions;
  const candidates = candidatesOf(pl);
  const routes = new Set(sols.map((s) => s.route)).size;
  const routeLen = sols.length ? Math.min(...sols.map((s) => s.laid)) : Infinity;
  const naiveLen = naiveLenOf(levelView(pl));
  const progs = sols.map((s) => s.program);
  const both = (p: Program) => [...p.main, ...p.p];
  const ordered = (pl.stations ?? []).some((s) => s.order !== undefined);
  const arrows = (pl.fixed ?? []).some((p) => p.oneWay);
  const set = new Set(progs.map(formatProgram));
  return {
    candidates,
    solutions: sols.length,
    routes,
    routeLen,
    guessRatio: sols.length ? candidates / sols.length : Infinity,
    needsLoop: pl.repeat && progs.length > 0 && progs.every((p) => hasRepeat(both(p))),
    nestDepth: progs.length ? Math.min(...progs.map((p) => Math.max(depthOf(p.main), depthOf(p.p)))) : 0,
    needsFunction: pl.fslots > 0 && progs.length > 0 && progs.every((p) => callsOf(p.main) >= 2),
    loopRich: progs.length > 0 && progs.every((p) => repeatsIn(both(p)) >= 2 || longestBody(both(p)) >= 3),
    bugs: pl.kind === 'debug' ? bugsOf(pl) : null,
    naiveLen,
    detour: routeLen - naiveLen,
    stationsMatter: ordered && !sameSet(set, solutionSet(fromView(pl, withoutOrder))),
    arrowsMatter: arrows && !sameSet(set, solutionSet(fromView(pl, withoutArrows))),
    nodes: e.nodes,
  };
}

function fromView(pl: ProgLevel, strip: typeof withoutOrder): ProgLevel {
  const v = strip(levelView(pl));
  return { ...pl, stations: v.stations, fixed: v.fixed };
}

// ---------- debug levels ----------

type Site = { kind: 'move'; tok: Extract<Tok, { t: 'move' }> } | { kind: 'count'; tok: Extract<Tok, { t: 'repeat' }> };

function sitesOf(row: Tok[], out: Site[] = []): Site[] {
  for (const t of row) {
    if (t.t === 'move') out.push({ kind: 'move', tok: t });
    else if (t.t === 'repeat') {
      out.push({ kind: 'count', tok: t });
      sitesOf(t.body, out);
    }
  }
  return out;
}

export const MAX_BUGS = 3;

/**
 * Fewest single-token substitutions (same tree shape; a move becomes another move of the
 * family, a Repeat count another count) that turn `given` into a solution. Searched up to
 * MAX_BUGS + 1; returns MAX_BUGS + 1 when more are needed.
 */
export function bugsOf(pl: ProgLevel, given: Program | null = givenOf(pl)): number {
  if (!given) return 0;
  const prog: Program = JSON.parse(JSON.stringify(given));
  const sites = [...sitesOf(prog.main), ...sitesOf(prog.p)];
  const fam = movesOf(pl.commands);
  const m = new Machine(pl);
  const works = () => {
    m.p = prog.p;
    m.reset();
    return m.stop === null && m.run(prog.main) && m.finish();
  };
  if (works()) return 0;
  const alts = (s: Site): (() => () => void)[] => {
    if (s.kind === 'move') {
      const was = s.tok.m;
      return fam.filter((x) => x !== was).map((x) => () => ((s.tok.m = x), () => (s.tok.m = was)));
    }
    const was = s.tok.n;
    return COUNTS.filter((x) => x !== was).map((x) => () => ((s.tok.n = x), () => (s.tok.n = was)));
  };
  const search = (from: number, k: number): boolean => {
    if (k === 0) return works();
    for (let i = from; i < sites.length; i++) {
      for (const apply of alts(sites[i])) {
        const undo = apply();
        const ok = search(i + 1, k - 1);
        undo();
        if (ok) return true;
      }
    }
    return false;
  };
  for (let k = 1; k <= MAX_BUGS; k++) if (search(0, k)) return k;
  return MAX_BUGS + 1;
}
