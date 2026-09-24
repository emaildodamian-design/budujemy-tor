// Session state machine: turn order, session cap, input delay and the bridge event.
// Pure and deterministic: time (`now`) and randomness (`rng`) are always passed in,
// so every rule here is unit-tested without a browser.

import {
  type BoardSize,
  type Cell,
  type Dir,
  type TileKind,
  N,
  TILE_KINDS,
  cellKey,
  exitHeading,
  pathFits,
  reachableFree,
  sameCell,
  step,
} from './grid';

export type Player = 'child' | 'parent';

export const TURNS_PER_PLAYER = 6;
export const TOTAL_TURNS = TURNS_PER_PLAYER * 2;
/** Gentle pause at the start of every turn before input is accepted. */
export const INPUT_DELAY_MS = 5000;

export const BOARD: BoardSize = { cols: 5, rows: 7 };
/** The station sits at the bottom middle; the first tile goes just above it. */
export const STATION: Cell = { x: 2, y: 6 };
export const STATION_HEADING: Dir = N;

export interface PlacedTile {
  cell: Cell;
  kind: TileKind;
  /** Travel direction when the train enters this tile. */
  heading: Dir;
  /** Travel direction when the train leaves this tile. */
  exit: Dir;
  owner: Player;
  /** Tile is a bridge (was laid broken). */
  bridge: boolean;
  /** Bridge still waits for the "fix it together" turn. */
  broken: boolean;
}

/** `build`: turns are being played. `ride`: all 12 turns done, train rides. `done`: engine off. */
export type Phase = 'build' | 'ride' | 'done';

export interface SessionState {
  readonly turn: number; // 0-based; equals TOTAL_TURNS once the build is finished
  readonly turnStartedAt: number;
  readonly phase: Phase;
  readonly tiles: readonly PlacedTile[];
  /** The free cell the next tile must go on, and the heading the train will have there. */
  readonly head: { readonly cell: Cell; readonly heading: Dir };
  /** Turn indices (always PARENT turns) whose tile is a broken bridge. */
  readonly bridgeTurns: readonly number[];
  readonly repairTaps: { readonly child: boolean; readonly parent: boolean };
}

export type TurnKind = 'place' | 'fix';

export type Rejection = 'session-over' | 'too-early' | 'wrong-turn-kind' | 'wrong-cell' | 'does-not-fit' | 'already-tapped';

export type ActionResult = { ok: true; state: SessionState } | { ok: false; reason: Rejection; state: SessionState };

export function playerForTurn(turn: number): Player {
  return turn % 2 === 0 ? 'child' : 'parent';
}

/** 1 or 2 bridges, on PARENT turns that are followed by a CHILD turn, never back to back. */
export function scheduleBridges(rng: () => number): number[] {
  // Parent turns are the odd indices 1..11. Skip the first parent turn (let the
  // child learn the basic move first) and the last one (no child turn after it).
  const candidates = [3, 5, 7, 9];
  if (rng() < 0.5) {
    return [candidates[Math.floor(rng() * candidates.length) % candidates.length]];
  }
  const pairs: [number, number][] = [
    [3, 7],
    [3, 9],
    [5, 9],
  ];
  return [...pairs[Math.floor(rng() * pairs.length) % pairs.length]];
}

export function createSession(now: number, rng: () => number = Math.random): SessionState {
  return {
    turn: 0,
    turnStartedAt: now,
    phase: 'build',
    tiles: [],
    head: { cell: step(STATION, STATION_HEADING), heading: STATION_HEADING },
    bridgeTurns: scheduleBridges(rng),
    repairTaps: { child: false, parent: false },
  };
}

export function currentPlayer(s: SessionState): Player {
  return playerForTurn(s.turn);
}

export function isBridgeTurn(s: SessionState, turn = s.turn): boolean {
  return s.bridgeTurns.includes(turn);
}

export function turnKind(s: SessionState, turn = s.turn): TurnKind {
  return s.bridgeTurns.includes(turn - 1) ? 'fix' : 'place';
}

/** Turns not yet played, i.e. wagons still visible. */
export function remainingTurns(s: SessionState): number {
  return TOTAL_TURNS - s.turn;
}

export function remainingFor(s: SessionState, player: Player): number {
  let n = 0;
  for (let t = s.turn; t < TOTAL_TURNS; t++) if (playerForTurn(t) === player) n++;
  return n;
}

/** Milliseconds until input opens for the current turn (0 = open now). */
export function inputWaitMs(s: SessionState, now: number): number {
  return Math.max(0, s.turnStartedAt + INPUT_DELAY_MS - now);
}

export function canAct(s: SessionState, now: number): boolean {
  return s.phase === 'build' && inputWaitMs(s, now) === 0;
}

/** Cells taken by the station and the laid tiles. */
export function occupiedCells(s: SessionState): Set<string> {
  const occ = new Set<string>([cellKey(STATION)]);
  for (const t of s.tiles) occ.add(cellKey(t.cell));
  return occ;
}

/** How many tiles will still be laid after the current turn (fix turns lay nothing). */
function placementsAfter(s: SessionState, turn: number): number {
  let n = 0;
  for (let t = turn + 1; t < TOTAL_TURNS; t++) if (turnKind(s, t) === 'place') n++;
  return n;
}

/**
 * Would laying `kind` on the head cell keep the game finishable? The track must
 * still have room for every future tile plus the depot at the end.
 */
export function tileFits(s: SessionState, kind: TileKind): boolean {
  const occ = occupiedCells(s);
  occ.add(cellKey(s.head.cell));
  const next = step(s.head.cell, exitHeading(s.head.heading, kind));
  const needed = placementsAfter(s, s.turn) + 1; // + depot
  if (reachableFree(occ, next, BOARD) < needed) return false;
  return pathFits(occ, next, needed, BOARD);
}

/** Tile shapes that can be laid right now (never empty during a place turn). */
export function fittingKinds(s: SessionState): TileKind[] {
  return TILE_KINDS.filter((k) => tileFits(s, k));
}

function nextTurn(s: SessionState, now: number, patch: Partial<SessionState>): SessionState {
  const turn = s.turn + 1;
  return {
    ...s,
    ...patch,
    turn,
    turnStartedAt: now,
    phase: turn >= TOTAL_TURNS ? 'ride' : 'build',
    repairTaps: { child: false, parent: false },
  };
}

function reject(s: SessionState, reason: Rejection): ActionResult {
  return { ok: false, reason, state: s };
}

/** Lay a tile on `cell`. Anything invalid is a no-op; the UI just lets the tile slide back. */
export function placeTile(s: SessionState, kind: TileKind, cell: Cell, now: number): ActionResult {
  if (s.phase !== 'build') return reject(s, 'session-over');
  if (!canAct(s, now)) return reject(s, 'too-early');
  if (turnKind(s) !== 'place') return reject(s, 'wrong-turn-kind');
  if (!sameCell(cell, s.head.cell)) return reject(s, 'wrong-cell');
  if (!tileFits(s, kind)) return reject(s, 'does-not-fit');

  const bridge = isBridgeTurn(s);
  const exit = exitHeading(s.head.heading, kind);
  const tile: PlacedTile = {
    cell: s.head.cell,
    kind,
    heading: s.head.heading,
    exit,
    owner: currentPlayer(s),
    bridge,
    broken: bridge,
  };
  return {
    ok: true,
    state: nextTurn(s, now, {
      tiles: [...s.tiles, tile],
      head: { cell: step(s.head.cell, exit), heading: exit },
    }),
  };
}

/** The broken bridge waiting to be fixed, if any. */
export function brokenTileIndex(s: SessionState): number {
  return s.tiles.findIndex((t) => t.broken);
}

/**
 * "Fix it together": on a fix turn, the child and the parent each tap the bridge.
 * The turn ends only when both have tapped.
 */
export function tapBridge(s: SessionState, who: Player, now: number): ActionResult {
  if (s.phase !== 'build') return reject(s, 'session-over');
  if (!canAct(s, now)) return reject(s, 'too-early');
  if (turnKind(s) !== 'fix') return reject(s, 'wrong-turn-kind');
  if (s.repairTaps[who]) return reject(s, 'already-tapped');

  const taps = { ...s.repairTaps, [who]: true };
  if (!(taps.child && taps.parent)) return { ok: true, state: { ...s, repairTaps: taps } };

  const i = brokenTileIndex(s);
  const tiles = s.tiles.map((t, j) => (j === i ? { ...t, broken: false } : t));
  return { ok: true, state: nextTurn(s, now, { tiles }) };
}

/** Where the depot goes: the free cell the last tile points to. */
export function depot(s: SessionState): { cell: Cell; heading: Dir } {
  return s.head;
}

/** Called by the UI once the train has parked in the depot and the engine is off. */
export function finishRide(s: SessionState): SessionState {
  return s.phase === 'ride' ? { ...s, phase: 'done' } : s;
}
