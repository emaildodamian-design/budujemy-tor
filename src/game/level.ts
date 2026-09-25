// v2 level model: types, geometry helpers, terrain rules, mirroring and validation.
// Pure: no DOM, no storage. Pieces have ABSOLUTE orientations (their two open sides),
// unlike the v1 heading-relative tiles in grid.ts.

import { type Cell, type Dir, E, W, inBounds, step } from './grid';

export type Side = 'N' | 'E' | 'S' | 'W';
export type PieceKind = 'straight' | 'curve' | 'bridge' | 'tunnel';
/** Two open sides in normalised order N,E,S,W. */
export type Openings = 'NS' | 'EW' | 'NE' | 'ES' | 'SW' | 'NW';
export type Intro = 'straight' | 'curve' | 'obstacle' | 'bridge' | 'tunnel' | 'station' | 'rotation' | 'repair';

export interface PieceAt {
  at: [number, number];
  piece: PieceKind | 'station';
  openings: Openings;
}

/** A movable piece on the board (laid by the player, or pre-laid on repair levels). */
export interface Placed {
  at: [number, number];
  piece: PieceKind;
  openings: Openings;
}

export interface Level {
  id: string;
  chapter: number;
  intro?: Intro;
  grid: string[];
  start: { exit: Side };
  depot: { entry: Side };
  stations?: { at: [number, number]; openings: 'NS' | 'EW' }[];
  fixed?: PieceAt[];
  preplaced?: Placed[];
  tray: { piece: PieceKind; count: number }[];
  rotate: 'auto' | 'free';
  placement: 'strict' | 'free';
  goalStrip?: 'full' | 'stations-only';
  solution: Placed[];
}

export type Terrain = 'grass' | 'rock' | 'house' | 'tree' | 'river' | 'mountain' | 'start' | 'depot' | 'station';

export const TERRAIN_CHARS: Record<string, Terrain> = {
  '.': 'grass',
  R: 'rock',
  H: 'house',
  T: 'tree',
  '~': 'river',
  '^': 'mountain',
  A: 'start',
  B: 'depot',
  S: 'station',
};

export const PIECE_KINDS: readonly PieceKind[] = ['straight', 'curve', 'bridge', 'tunnel'];
export const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];
export const ALL_OPENINGS: readonly Openings[] = ['NS', 'EW', 'NE', 'ES', 'SW', 'NW'];

export const MAX_COLS = 5;
export const MAX_ROWS = 6;

export const sideDir = (s: Side): Dir => SIDES.indexOf(s) as Dir;
export const dirSide = (d: Dir): Side => SIDES[d];

/** Normalised openings for two different sides. */
export function openingsOf(a: Dir, b: Dir): Openings {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${SIDES[x]}${SIDES[y]}` as Openings;
}

export function openingDirs(o: Openings): [Dir, Dir] {
  return [sideDir(o[0] as Side), sideDir(o[1] as Side)];
}

export function hasOpening(o: Openings, d: Dir): boolean {
  return o.includes(SIDES[d]);
}

/** Entering by side `entry`, the train leaves by the other opening. */
export function otherOpening(o: Openings, entry: Dir): Dir {
  const [a, b] = openingDirs(o);
  return a === entry ? b : a;
}

export const isStraightShape = (o: Openings) => o === 'NS' || o === 'EW';

/** Orientations each piece kind can take. Bridge and tunnel are straight. */
export function orientationsFor(kind: PieceKind | 'station'): readonly Openings[] {
  return kind === 'curve' ? ['NE', 'ES', 'SW', 'NW'] : ['NS', 'EW'];
}

/** Turn a piece 90° clockwise. */
export function rotateCw(o: Openings): Openings {
  const [a, b] = openingDirs(o);
  return openingsOf(((a + 1) % 4) as Dir, ((b + 1) % 4) as Dir);
}

/** Orientation a piece has in the tray when rotation is free (a tap turns it 90°). */
export function trayOrientation(kind: PieceKind): Openings {
  return kind === 'curve' ? 'ES' : 'EW';
}

/** Terrain rules: grass takes track, a river only a bridge, a mountain only a tunnel. */
export function terrainAccepts(t: Terrain, piece: PieceKind | 'station'): boolean {
  switch (t) {
    case 'grass':
      return piece === 'straight' || piece === 'curve';
    case 'river':
      return piece === 'bridge';
    case 'mountain':
      return piece === 'tunnel';
    case 'station':
      return piece === 'station';
    default:
      return false;
  }
}

/** Cells a movable piece may ever go on (with free placement, even the "wrong" one). */
export function isBuildable(t: Terrain): boolean {
  return t === 'grass' || t === 'river' || t === 'mountain';
}

export const cellOf = (at: readonly [number, number]): Cell => ({ x: at[0], y: at[1] });
export const atOf = (c: Cell): [number, number] => [c.x, c.y];
export const sameAt = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1];

export type Counts = Record<PieceKind, number>;
export const zeroCounts = (): Counts => ({ straight: 0, curve: 0, bridge: 0, tunnel: 0 });

/** Precomputed facts about a level, cached per level object. */
export interface Board {
  level: Level;
  cols: number;
  rows: number;
  start: Cell;
  depot: Cell;
  startExit: Dir;
  depotEntry: Dir;
  /** Fixed pieces and stations, by "x,y". */
  fixed: Map<string, PieceAt>;
  stations: Cell[];
  /** Everything the player owns: tray plus pre-laid movable pieces. */
  inventory: Counts;
}

const boards = new WeakMap<Level, Board>();

export function terrainAt(level: Level, c: Cell): Terrain {
  return TERRAIN_CHARS[level.grid[c.y]?.[c.x] ?? 'R'] ?? 'rock';
}

function findChar(level: Level, ch: string): Cell {
  for (let y = 0; y < level.grid.length; y++) {
    const x = level.grid[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  return { x: -1, y: -1 };
}

export function boardOf(level: Level): Board {
  const cached = boards.get(level);
  if (cached) return cached;
  const fixed = new Map<string, PieceAt>();
  for (const p of level.fixed ?? []) fixed.set(`${p.at[0]},${p.at[1]}`, p);
  for (const st of level.stations ?? []) fixed.set(`${st.at[0]},${st.at[1]}`, { at: st.at, piece: 'station', openings: st.openings });
  const inventory = zeroCounts();
  for (const t of level.tray) inventory[t.piece] += t.count;
  for (const p of level.preplaced ?? []) inventory[p.piece] += 1;
  const b: Board = {
    level,
    cols: level.grid[0]?.length ?? 0,
    rows: level.grid.length,
    start: findChar(level, 'A'),
    depot: findChar(level, 'B'),
    startExit: sideDir(level.start.exit),
    depotEntry: sideDir(level.depot.entry),
    fixed,
    stations: (level.stations ?? []).map((s) => cellOf(s.at)),
    inventory,
  };
  boards.set(level, b);
  return b;
}

/** The movable pieces a level starts with. */
export function initialPieces(level: Level): Placed[] {
  return (level.preplaced ?? []).map((p) => ({ at: [p.at[0], p.at[1]], piece: p.piece, openings: p.openings }));
}

export function goalStripOf(level: Level): 'full' | 'stations-only' {
  return level.goalStrip ?? (level.chapter <= 5 ? 'full' : 'stations-only');
}

export const isRepair = (level: Level) => (level.preplaced?.length ?? 0) > 0;

// ---------- mirroring (warm-ups and requeued levels) ----------

const mirrorDir = (d: Dir): Dir => (d === E ? W : d === W ? E : d);
const mirrorSide = (s: Side): Side => dirSide(mirrorDir(sideDir(s)));
const mirrorOpenings = (o: Openings): Openings => {
  const [a, b] = openingDirs(o);
  return openingsOf(mirrorDir(a), mirrorDir(b));
};

/** Horizontally mirrored copy of a level (left ↔ right). Same id: progress is per level. */
export function mirrorLevel(level: Level): Level {
  const cols = level.grid[0].length;
  const mx = <T extends { at: [number, number]; openings: Openings }>(p: T): T => ({
    ...p,
    at: [cols - 1 - p.at[0], p.at[1]],
    openings: mirrorOpenings(p.openings),
  });
  return {
    ...level,
    grid: level.grid.map((row) => [...row].reverse().join('')),
    start: { exit: mirrorSide(level.start.exit) },
    depot: { entry: mirrorSide(level.depot.entry) },
    stations: level.stations?.map((s) => ({ at: [cols - 1 - s.at[0], s.at[1]] as [number, number], openings: s.openings })),
    fixed: level.fixed?.map(mx),
    preplaced: level.preplaced?.map(mx),
    solution: level.solution.map(mx),
  };
}

// ---------- validation (at load and in tests) ----------

/** Returns a list of problems; empty means the level is well-formed. */
export function validateLevel(level: Level): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`${level.id}: ${m}`);
  if (!/^L\d{2}$/.test(level.id)) e('bad id');
  if (!(level.chapter >= 1 && level.chapter <= 8)) e('bad chapter');
  const rows = level.grid.length;
  const cols = level.grid[0]?.length ?? 0;
  if (rows < 1 || rows > MAX_ROWS || cols < 1 || cols > MAX_COLS) e(`board ${cols}x${rows} out of range`);
  if (level.grid.some((r) => r.length !== cols)) e('grid is not rectangular');
  const chars = level.grid.join('');
  for (const ch of chars) if (!(ch in TERRAIN_CHARS)) e(`illegal char ${ch}`);
  if (chars.split('A').length !== 2) e('needs exactly one A');
  if (chars.split('B').length !== 2) e('needs exactly one B');
  if (errs.length) return errs;

  const b = boardOf(level);
  const size = { cols, rows };
  if (!SIDES.includes(level.start.exit)) e('bad start exit');
  if (!SIDES.includes(level.depot.entry)) e('bad depot entry');
  if (!inBounds(step(b.start, b.startExit), size)) e('start exit points off the board');
  if (!inBounds(step(b.depot, b.depotEntry), size)) e('depot entry points off the board');

  const stationCells = new Set<string>();
  level.grid.forEach((row, y) => [...row].forEach((ch, x) => ch === 'S' && stationCells.add(`${x},${y}`)));
  const declared = new Set((level.stations ?? []).map((s) => `${s.at[0]},${s.at[1]}`));
  if (stationCells.size !== declared.size || [...stationCells].some((k) => !declared.has(k))) e('stations do not match S cells');
  for (const s of level.stations ?? []) if (s.openings !== 'NS' && s.openings !== 'EW') e('station openings must be NS or EW');

  const checkPiece = (p: PieceAt, what: string) => {
    const c = cellOf(p.at);
    if (!inBounds(c, size)) return e(`${what} off the board`);
    if (!ALL_OPENINGS.includes(p.openings)) return e(`${what} bad openings ${p.openings}`);
    if (!orientationsFor(p.piece).includes(p.openings)) e(`${what} ${p.piece} cannot have ${p.openings}`);
  };
  for (const p of level.fixed ?? []) {
    checkPiece(p, 'fixed');
    if (!terrainAccepts(terrainAt(level, cellOf(p.at)), p.piece)) e('fixed piece on wrong terrain');
  }
  for (const p of level.preplaced ?? []) {
    checkPiece(p, 'preplaced');
    if (!isBuildable(terrainAt(level, cellOf(p.at)))) e('preplaced piece on unbuildable cell');
  }
  for (const p of level.solution) {
    checkPiece(p, 'solution');
    if (!terrainAccepts(terrainAt(level, cellOf(p.at)), p.piece)) e(`solution piece on wrong terrain at ${p.at}`);
    if (b.fixed.has(`${p.at[0]},${p.at[1]}`)) e('solution piece on a fixed cell');
  }
  for (const t of level.tray) {
    if (!PIECE_KINDS.includes(t.piece)) e(`bad tray piece ${t.piece}`);
    if (!(Number.isInteger(t.count) && t.count >= 1 && t.count <= 9)) e('tray count must be 1..9');
  }
  if (level.rotate !== 'auto' && level.rotate !== 'free') e('bad rotate');
  if (level.placement !== 'strict' && level.placement !== 'free') e('bad placement');
  return errs;
}
