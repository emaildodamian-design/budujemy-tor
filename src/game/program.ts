// v4 "program the train": the command model, the step machine and the compiler. Pure.
//
// The player writes a program of icon commands first; only then does the train run it.
// Each executed Move lays ONE piece in the cell in front of the engine and moves onto it.
// Fixed pieces and stations are passed through without using a command. The program is
// compiled to v3 `Placed[]` and the ride itself is v3 `trace()`; only the stop reasons that
// v3 cannot see (`reverse`, `blocked`, `early`, `programEnd`) come from the compiler.

import { type Cell, type Dir, E, N, S, W, opposite, turnLeft, turnRight } from './grid';
import {
  type Level,
  type Openings,
  type PieceAt,
  type PieceKind,
  type Placed,
  type Side,
  type Station,
  boardOf,
  hasOpening,
  openingsOf,
  otherOpening,
  sideDir,
  terrainAt,
} from './level';
import { type FailReason, type TraceResult, trace } from './trace';

// ---------- commands ----------

export type AbsMove = 'N' | 'E' | 'S' | 'W';
/** Relative moves, as seen from the engine: straight on, curve left, curve right. */
export type RelMove = 'F' | 'L' | 'R';
export type Move = AbsMove | RelMove;
export type Count = 2 | 3 | 4 | 5;
export const COUNTS: readonly Count[] = [2, 3, 4, 5];
export const ABS_MOVES: readonly AbsMove[] = ['N', 'E', 'S', 'W'];
export const REL_MOVES: readonly RelMove[] = ['L', 'F', 'R'];
export type Family = 'absolute' | 'relative';
export const movesOf = (f: Family): readonly Move[] => (f === 'absolute' ? ABS_MOVES : REL_MOVES);

/** Body length limits of a Repeat (tokens, not slots). */
export const BODY_MIN = 1;
export const BODY_MAX = 3;
/** A Repeat inside a Repeat is the deepest nesting (and only when `level.nesting`). */
export const MAX_DEPTH = 2;

/**
 * One command. `hole` is an empty slot in the editor (never part of a runnable program).
 * A Repeat runs its body `n` times; a Call runs the function row P.
 */
export type Tok = { t: 'move'; m: Move } | { t: 'repeat'; n: Count; body: Tok[] } | { t: 'call' } | { t: 'hole' };
export type Row = 'main' | 'p';
export interface Program {
  main: Tok[];
  /** The function row P (empty when the level has no P row). */
  p: Tok[];
}

export const mv = (m: Move): Tok => ({ t: 'move', m });
export const rep = (n: Count, body: Tok[]): Tok => ({ t: 'repeat', n, body });
export const CALL: Tok = { t: 'call' };
export const HOLE: Tok = { t: 'hole' };

/** Slot cost: Move = 1, Call = 1, Repeat = 1 + its body (an empty slot costs 1 too). */
export function cost(tok: Tok): number {
  return tok.t === 'repeat' ? 1 + rowCost(tok.body) : 1;
}
export function rowCost(row: readonly Tok[]): number {
  let c = 0;
  for (const t of row) c += cost(t);
  return c;
}

/** Deepest Repeat nesting in a row (0: no Repeat). */
export function depthOf(row: readonly Tok[]): number {
  let d = 0;
  for (const t of row) if (t.t === 'repeat') d = Math.max(d, 1 + depthOf(t.body));
  return d;
}

const some = (row: readonly Tok[], f: (t: Tok) => boolean): boolean => row.some((t) => f(t) || (t.t === 'repeat' && some(t.body, f)));
export const hasHole = (row: readonly Tok[]) => some(row, (t) => t.t === 'hole');
export const hasRepeat = (row: readonly Tok[]) => some(row, (t) => t.t === 'repeat');
export const hasCall = (row: readonly Tok[]) => some(row, (t) => t.t === 'call');

/** How many times running `row` runs P (Repeat counts multiply). */
export function callsOf(row: readonly Tok[]): number {
  let c = 0;
  for (const t of row) {
    if (t.t === 'call') c += 1;
    else if (t.t === 'repeat') c += t.n * callsOf(t.body);
  }
  return c;
}

// ---------- notation (levels4.json, LEVELS_V4.md, tests) ----------
// Moves are letters (N E S W / F L R), a Call is P, a Repeat is `4[E N]`, an empty slot `_`.
// The P row follows the main row after ` ; `.

export function formatRow(row: readonly Tok[]): string {
  return row
    .map((t) => (t.t === 'move' ? t.m : t.t === 'call' ? 'P' : t.t === 'hole' ? '_' : `${t.n}[${formatRow(t.body)}]`))
    .join(' ');
}
export function formatProgram(p: Program): string {
  return p.p.length ? `${formatRow(p.main)} ; ${formatRow(p.p)}` : formatRow(p.main);
}

export function parseRow(src: string): Tok[] {
  let i = 0;
  const s = src.trim();
  const row = (): Tok[] => {
    const out: Tok[] = [];
    for (;;) {
      while (s[i] === ' ') i++;
      if (i >= s.length || s[i] === ']') return out;
      const ch = s[i];
      if (/[2-5]/.test(ch) && s[i + 1] === '[') {
        i += 2;
        const body = row();
        if (s[i] !== ']') throw new Error(`unclosed repeat in "${src}"`);
        i++;
        out.push(rep(Number(ch) as Count, body));
      } else if ('NESWFLR'.includes(ch)) {
        out.push(mv(ch as Move));
        i++;
      } else if (ch === 'P') {
        out.push(CALL);
        i++;
      } else if (ch === '_') {
        out.push(HOLE);
        i++;
      } else throw new Error(`bad token "${ch}" in "${src}"`);
    }
  };
  const out = row();
  if (i !== s.length) throw new Error(`trailing input in "${src}"`);
  return out;
}
export function parseProgram(src: string): Program {
  const [main, p = ''] = src.split(';');
  return { main: parseRow(main), p: parseRow(p) };
}

// ---------- v4 levels ----------

export type ProgKind = 'practice' | 'debug' | 'finale';

export interface ProgLevel {
  id: string;
  chapter: number;
  kind: ProgKind;
  /** Same fields as v3, so the board, the art and `trace()` work unchanged. */
  grid: string[];
  start: { exit: Side };
  depot: { entry: Side };
  stations?: Station[];
  fixed?: PieceAt[];
  commands: Family;
  /** The palette has a Repeat tile. */
  repeat: boolean;
  /** A Repeat may sit inside a Repeat body. */
  nesting: boolean;
  /** Main row length in slots. */
  slots: number;
  /** P row length in slots (0: no P row, no Call tile). */
  fslots: number;
  /** One stored solution (notation above). It succeeds. */
  solution: string;
  /** Debug levels: the full program the level starts with (it fails). */
  given?: string;
}

const views = new WeakMap<ProgLevel, Level>();
/**
 * The v3 `Level` a v4 level stands for (same grid, start, depot, stations and fixed
 * pieces). Bridges and tunnels are laid automatically, so the tray holds one per river /
 * mountain cell; `boardOf`, `trace` and v3 `naiveLenOf` read it unchanged.
 */
export function levelView(pl: ProgLevel): Level {
  let v = views.get(pl);
  if (!v) {
    const g = pl.grid.join('');
    const count = (ch: string) => g.split(ch).length - 1;
    const tray: Level['tray'] = [];
    if (count('~')) tray.push({ piece: 'bridge', count: count('~') });
    if (count('^')) tray.push({ piece: 'tunnel', count: count('^') });
    v = {
      id: pl.id,
      chapter: pl.chapter,
      kind: 'practice',
      grid: pl.grid,
      start: pl.start,
      depot: pl.depot,
      stations: pl.stations,
      fixed: pl.fixed,
      tray,
      rotate: 'free',
      placement: 'free',
      solution: [],
    };
    views.set(pl, v);
  }
  return v;
}

export const solutionOf = (pl: ProgLevel): Program => parseProgram(pl.solution);
export const givenOf = (pl: ProgLevel): Program | null => (pl.given ? parseProgram(pl.given) : null);

/** Grammar checks for a complete or partial program (holes allowed). Empty list = fine. */
export function grammarProblems(pl: ProgLevel, prog: Program): string[] {
  const out: string[] = [];
  const moves = movesOf(pl.commands);
  const walk = (row: readonly Tok[], depth: number, inP: boolean) => {
    for (const t of row) {
      if (t.t === 'move' && !moves.includes(t.m)) out.push(`move ${t.m} is not ${pl.commands}`);
      if (t.t === 'call' && (pl.fslots === 0 || inP)) out.push(inP ? 'P calls P' : 'call without a P row');
      if (t.t === 'repeat') {
        if (!pl.repeat) out.push('repeat not allowed');
        if (depth >= 1 && !pl.nesting) out.push('nested repeat not allowed');
        if (depth + 1 > MAX_DEPTH) out.push('repeat nested too deep');
        if (!COUNTS.includes(t.n)) out.push(`bad count ${t.n}`);
        if (t.body.length < BODY_MIN || t.body.length > BODY_MAX) out.push(`body of ${t.body.length} tokens`);
        walk(t.body, depth + 1, inP);
      }
    }
  };
  walk(prog.main, 0, false);
  walk(prog.p, 0, true);
  if (pl.fslots === 0 && prog.p.length > 0) out.push('P row on a level without one');
  return out;
}

/**
 * Fill-to-run: the main row costs exactly `slots`, the P row exactly `fslots`, and no
 * slot or Repeat body is empty.
 */
export function canRun(pl: ProgLevel, prog: Program): boolean {
  const bodiesFull = (row: readonly Tok[]): boolean => row.every((t) => t.t !== 'hole' && (t.t !== 'repeat' || (t.body.length > 0 && bodiesFull(t.body))));
  return rowCost(prog.main) === pl.slots && rowCost(prog.p) === pl.fslots && bodiesFull(prog.main) && bodiesFull(prog.p);
}

// ---------- the step machine ----------

export type NewReason = 'reverse' | 'blocked' | 'early' | 'programEnd';
export type ProgReason = FailReason | NewReason;
export const NEW_REASONS: readonly NewReason[] = ['reverse', 'blocked', 'early', 'programEnd'];

/** A slot in the program strip: row and box index (pre-order; a Repeat head is one box). */
export interface SlotRef {
  row: Row;
  i: number;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const ABS_DIR: Record<AbsMove, Dir> = { N, E, S, W };

// Cell kinds.
const K_GRASS = 0;
const K_BLOCKED = 1;
const K_RIVER = 2;
const K_MOUNTAIN = 3;
const K_FIXED = 4;
const K_START = 5;
const K_DEPOT = 6;

export interface Stop {
  reason: ProgReason;
  /** The cell that glows (null: the track points off the board). */
  cell: Cell | null;
  /** The command(s) responsible (glow softly). */
  cmd: SlotRef[];
  /** Stations still owed (missedStation / wrongOrder). */
  missing: Cell[];
}

/**
 * Runs commands one at a time with undo, for the compiler and the enumerator. It
 * implements the v4 rules and the v3 checks at fixed pieces in the same order as
 * `trace()`, so pruning in the enumerator agrees with the real ride.
 */
export class Machine {
  readonly cols: number;
  readonly rows: number;
  private readonly kind: Uint8Array;
  private readonly fixedAt: (PieceAt | undefined)[];
  private readonly start: number;
  private readonly depot: number;
  private readonly startExit: Dir;
  private readonly depotEntry: Dir;
  private readonly stationCells: number[];
  private readonly ordered: boolean;
  private readonly relative: boolean;
  // state
  x = 0;
  y = 0;
  h: Dir = N;
  passed = 0;
  private visited: Uint8Array;
  private vlog: number[] = [];
  stop: Stop | null = null;
  /** The P row (set before running a program that calls it). */
  p: readonly Tok[] = [];
  // recording (compiler only)
  record = false;
  pieces: Placed[] = [];
  pieceCmd: SlotRef[][] = [];
  /** Every cell the engine enters, in order, with the command that brought it there. */
  route: number[] = [];
  routeCmd: SlotRef[][] = [];
  private cur: SlotRef[] = [];
  lastCmd: SlotRef[] = [];

  constructor(readonly level: ProgLevel) {
    const v = levelView(level);
    const b = boardOf(v);
    this.cols = b.cols;
    this.rows = b.rows;
    this.kind = new Uint8Array(b.cols * b.rows);
    this.fixedAt = new Array(b.cols * b.rows);
    for (let y = 0; y < b.rows; y++)
      for (let x = 0; x < b.cols; x++) {
        const i = y * b.cols + x;
        const f = b.fixed.get(`${x},${y}`);
        if (f) {
          this.kind[i] = K_FIXED;
          this.fixedAt[i] = f;
          continue;
        }
        const t = terrainAt(v, { x, y });
        this.kind[i] =
          t === 'grass' ? K_GRASS : t === 'river' ? K_RIVER : t === 'mountain' ? K_MOUNTAIN : t === 'start' ? K_START : t === 'depot' ? K_DEPOT : K_BLOCKED;
      }
    this.start = b.start.y * b.cols + b.start.x;
    this.depot = b.depot.y * b.cols + b.depot.x;
    this.startExit = b.startExit;
    this.depotEntry = b.depotEntry;
    this.stationCells = b.stations.map((c) => c.y * b.cols + c.x);
    this.ordered = b.ordered;
    this.relative = level.commands === 'relative';
    this.visited = new Uint8Array(b.cols * b.rows);
    this.reset();
  }

  /** Back to the start shed. */
  reset(): void {
    this.x = this.start % this.cols;
    this.y = Math.floor(this.start / this.cols);
    this.h = this.startExit;
    this.passed = 0;
    this.visited.fill(0);
    this.visited[this.start] = 1;
    this.vlog = [];
    this.stop = null;
    this.pieces = [];
    this.pieceCmd = [];
    this.route = [];
    this.routeCmd = [];
    this.cur = [];
    this.lastCmd = [];
    this.passThrough();
  }

  mark(): number[] {
    return [this.x, this.y, this.h, this.passed, this.vlog.length, this.pieces.length, this.route.length];
  }
  undo(m: number[]): void {
    this.x = m[0];
    this.y = m[1];
    this.h = m[2] as Dir;
    this.passed = m[3];
    while (this.vlog.length > m[4]) this.visited[this.vlog.pop()!] = 0;
    this.pieces.length = m[5];
    this.pieceCmd.length = m[5];
    this.route.length = m[6];
    this.routeCmd.length = m[6];
    this.stop = null;
  }

  private cellAt(i: number): Cell {
    return { x: i % this.cols, y: Math.floor(i / this.cols) };
  }
  private fail(reason: ProgReason, cell: number | null, missing: number[] = []): false {
    this.stop = { reason, cell: cell === null ? null : this.cellAt(cell), cmd: this.cur.length ? this.cur : this.lastCmd, missing: missing.map((c) => this.cellAt(c)) };
    return false;
  }
  private enter(i: number, h: Dir): void {
    this.visited[i] = 1;
    this.vlog.push(i);
    this.x = i % this.cols;
    this.y = Math.floor(i / this.cols);
    this.h = h;
    if (this.record) {
      this.route.push(i);
      this.routeCmd.push(this.cur.length ? this.cur : this.lastCmd);
    }
  }
  private front(): number {
    const nx = this.x + DX[this.h];
    const ny = this.y + DY[this.h];
    return nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows ? -1 : ny * this.cols + nx;
  }

  /** Ride through fixed pieces and stations in front (no command used). */
  private passThrough(): boolean {
    for (;;) {
      const f = this.front();
      if (f < 0 || this.kind[f] !== K_FIXED) return true;
      const p = this.fixedAt[f]!;
      const entry = opposite(this.h);
      if (!hasOpening(p.openings, entry)) return this.fail('mismatch', f);
      if (this.visited[f]) return this.fail('loop', f);
      const exit = otherOpening(p.openings, entry);
      if (p.oneWay && sideDir(p.oneWay) !== exit) return this.fail('wrongWay', f);
      if (p.piece === 'station') {
        if (this.ordered && p.order !== this.passed + 1) {
          const lower = (this.level.stations ?? []).filter((s) => (s.order ?? 0) < (p.order ?? 0)).map((s) => s.at[1] * this.cols + s.at[0]);
          return this.fail('wrongOrder', f, lower.filter((c) => !this.visited[c]));
        }
        this.passed++;
      }
      this.enter(f, exit);
    }
  }

  /** Execute one Move. False (and `stop` set) when the engine has to stop. */
  move(m: Move): boolean {
    const f = this.front();
    if (f < 0) return this.fail('edge', null);
    const k = this.kind[f];
    if (k === K_DEPOT) return this.fail('early', f);
    if (k === K_START || this.visited[f]) return this.fail('loop', f);
    if (k === K_BLOCKED) return this.fail('blocked', f);
    let nh: Dir;
    if (this.relative) nh = m === 'L' ? turnLeft(this.h) : m === 'R' ? turnRight(this.h) : this.h;
    else {
      nh = ABS_DIR[m as AbsMove];
      if (nh === opposite(this.h)) return this.fail('reverse', f);
    }
    const straight = nh === this.h;
    if ((k === K_RIVER || k === K_MOUNTAIN) && !straight) {
      if (this.record) this.lay(f, 'curve', nh); // v3 trace sees the curve on the river / mountain
      return this.fail(k === K_RIVER ? 'needsBridge' : 'needsTunnel', f);
    }
    if (this.record) this.lay(f, k === K_RIVER ? 'bridge' : k === K_MOUNTAIN ? 'tunnel' : straight ? 'straight' : 'curve', nh);
    this.enter(f, nh);
    this.lastCmd = this.cur;
    return this.passThrough();
  }

  private lay(f: number, piece: PieceKind, nh: Dir): void {
    const openings: Openings = openingsOf(opposite(this.h), nh);
    this.pieces.push({ at: [f % this.cols, Math.floor(f / this.cols)], piece, openings });
    this.pieceCmd.push(this.cur);
  }

  /** Execute tokens (holes stop nothing: a runnable program has none). */
  run(row: readonly Tok[]): boolean {
    for (const t of row) if (!this.exec(t)) return false;
    return true;
  }

  exec(t: Tok): boolean {
    if (t.t === 'move') return this.move(t.m);
    if (t.t === 'repeat') {
      for (let k = 0; k < t.n; k++) if (!this.run(t.body)) return false;
      return true;
    }
    if (t.t === 'call') return this.run(this.p);
    return true;
  }

  /** Recording runs: execute a row, tracking each command's slot. */
  runRec(row: readonly Tok[], rowId: Row, base: number, outer: SlotRef[]): boolean {
    let i = base;
    for (const t of row) {
      const ref = [...outer, { row: rowId, i }];
      if (t.t === 'move') {
        this.cur = ref;
        if (!this.move(t.m)) return false;
      } else if (t.t === 'repeat') {
        for (let k = 0; k < t.n; k++) if (!this.runRec(t.body, rowId, i + 1, outer)) return false;
      } else if (t.t === 'call') {
        if (!this.runRec(this.p, 'p', 0, ref)) return false;
      }
      i += cost(t);
    }
    return true;
  }

  /** After the last command: into the depot through its door, every station passed. */
  finish(): boolean {
    const f = this.front();
    this.cur = [];
    if (f !== this.depot) return this.fail('programEnd', f < 0 ? null : f);
    if (opposite(this.h) !== this.depotEntry) return this.fail('depotSide', f);
    const missing = this.stationCells.filter((c) => !this.visited[c]);
    if (missing.length) return this.fail('missedStation', missing[0], missing);
    return true;
  }

  /** Pieces laid so far (cells entered that are not fixed track or stations). */
  laidCount(): number {
    let n = 0;
    for (const i of this.vlog) if (this.kind[i] !== K_FIXED) n++;
    return n;
  }

  /** Route cells (for distinct-route counting). */
  routeKey(): string {
    return this.vlog.join(',');
  }
}

// ---------- compile + ride ----------

export interface ProgRun {
  success: boolean;
  reason: ProgReason | null;
  /** Cells the train rides through (v3 `trace().path`). */
  path: Cell[];
  /** Per path cell: the command(s) that glow while the engine is there. */
  stepCmds: SlotRef[][];
  /** The cell that glows softly (null: off the board, or success). */
  breakCell: Cell | null;
  /** The command(s) responsible for the stop (glow softly). */
  cmd: SlotRef[];
  missingStations: Cell[];
  /** The compiled track. */
  pieces: Placed[];
  /** The command that laid each piece. */
  pieceCmd: SlotRef[][];
  trace: TraceResult;
}

export interface Compiled {
  pieces: Placed[];
  pieceCmd: SlotRef[][];
  /** Cells entered (laid pieces and fixed pieces), in route order. */
  route: Cell[];
  routeCmd: SlotRef[][];
  stop: Stop | null;
  /** The program ran to its end and the engine is in front of the depot, door and stations fine. */
  done: boolean;
}

/** Compile a runnable program to v3 pieces, recording the command behind each piece. */
export function compile(pl: ProgLevel, prog: Program): Compiled {
  const m = new Machine(pl);
  m.p = prog.p;
  m.record = true;
  m.reset();
  const ok = m.stop === null && m.runRec(prog.main, 'main', 0, []) && m.finish();
  return {
    pieces: m.pieces,
    pieceCmd: m.pieceCmd,
    route: m.route.map((i) => ({ x: i % m.cols, y: Math.floor(i / m.cols) })),
    routeCmd: m.routeCmd,
    stop: m.stop,
    done: ok,
  };
}

/**
 * Compile, then ride with v3 `trace()`. The ride stops at the first failure in route
 * order: a v3 failure the trace finds earlier wins; at the compiler's stop cell the
 * compiler's reason is used (it knows `reverse`, `blocked`, `early`, `programEnd`).
 */
export function runProgram(pl: ProgLevel, prog: Program): ProgRun {
  const c = compile(pl, prog);
  const v = levelView(pl);
  const tr = trace(v, c.pieces);
  const stepCmds = tr.path.map((_, i) => c.routeCmd[i] ?? []);
  const base = { path: tr.path, stepCmds, pieces: c.pieces, pieceCmd: c.pieceCmd, trace: tr };
  if (tr.success) return { ...base, success: true, reason: null, breakCell: null, cmd: [], missingStations: [] };
  const stop = c.stop;
  if (!stop || tr.path.length < c.route.length) {
    // A v3 failure before the compiler's stop (never expected: both apply the same rules).
    const k = Math.max(0, tr.path.length - 1);
    return { ...base, success: false, reason: tr.reason, breakCell: tr.breakCell, cmd: c.routeCmd[k] ?? [], missingStations: tr.missingStations };
  }
  return { ...base, success: false, reason: stop.reason, breakCell: stop.cell, cmd: stop.cmd, missingStations: stop.missing };
}

/** The route (cells, in order) the stored solution rides: for the lamp. */
export function solutionRoute(pl: ProgLevel): Cell[] {
  return compile(pl, solutionOf(pl)).route;
}

export const sameRef = (a: SlotRef, b: SlotRef) => a.row === b.row && a.i === b.i;
export const cellsEq = (a: readonly Cell[], b: readonly Cell[]) => a.length === b.length && a.every((c, i) => c.x === b[i].x && c.y === b[i].y);
