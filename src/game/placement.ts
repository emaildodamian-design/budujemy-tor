// Laying, swapping, turning and taking back pieces. Pure: every function returns a
// new pieces array and never mutates its input.

import { type Cell, type Dir, cellKey, inBounds, opposite, sameCell, step } from './grid';
import {
  type Level,
  type Openings,
  type PieceKind,
  type Placed,
  atOf,
  boardOf,
  hasOpening,
  isBuildable,
  openingDirs,
  orientationsFor,
  rotateCw,
  terrainAccepts,
  terrainAt,
  trayOrientation,
} from './level';
import { handFor } from './solver';
import { pieceAt } from './trace';

export const pieceOn = (pieces: readonly Placed[], c: Cell) => pieces.find((p) => p.at[0] === c.x && p.at[1] === c.y);

/** Can `kind` go on `c` at all? Strict placement also checks the terrain. */
export function canPlace(level: Level, c: Cell, kind: PieceKind): boolean {
  const b = boardOf(level);
  if (!inBounds(c, b)) return false;
  if (b.fixed.has(cellKey(c))) return false;
  const t = terrainAt(level, c);
  if (!isBuildable(t)) return false;
  return level.placement === 'free' || terrainAccepts(t, kind);
}

/** Sides of `c` where a neighbour has an open end pointing into `c`. */
export function openEndsInto(level: Level, pieces: readonly Placed[], c: Cell): Dir[] {
  const b = boardOf(level);
  const out: Dir[] = [];
  for (const d of [0, 1, 2, 3] as Dir[]) {
    const n = step(c, d);
    if (!inBounds(n, b)) continue;
    const back = opposite(d);
    if (sameCell(n, b.start) ? b.startExit === back : sameCell(n, b.depot) ? b.depotEntry === back : false) {
      out.push(d);
      continue;
    }
    const p = pieceAt(level, pieces, n);
    if (p && hasOpening(p.openings, back)) out.push(d);
  }
  return out;
}

/** A side of `c` that leads nowhere useful (off the board, into scenery, or into track facing away). */
function deadSide(level: Level, pieces: readonly Placed[], c: Cell, d: Dir): boolean {
  const b = boardOf(level);
  const n = step(c, d);
  if (!inBounds(n, b)) return true;
  if (sameCell(n, b.start) || sameCell(n, b.depot) || b.fixed.has(cellKey(n))) return true; // unless it connects (checked by caller)
  return !isBuildable(terrainAt(level, n)) && !pieceOn(pieces, n);
}

/** Orientations ranked for auto mode: most connections first, then side order N,E,S,W. */
function rankedOrientations(level: Level, pieces: readonly Placed[], c: Cell, kind: PieceKind): { o: Openings; links: number }[] {
  const others = pieces.filter((p) => !(p.at[0] === c.x && p.at[1] === c.y));
  const ends = openEndsInto(level, others, c);
  const scored = orientationsFor(kind).map((o) => {
    const [a, b] = openingDirs(o);
    const links = [a, b].filter((d) => ends.includes(d));
    const loose = [a, b].filter((d) => !ends.includes(d));
    const ok = loose.every((d) => !deadSide(level, others, c, d));
    return { o, links: links.length, ok, key: links.map((d) => d).join('') + '|' + [a, b].join('') };
  });
  return scored
    .filter((s) => s.links > 0 && s.ok)
    .sort((x, y) => y.links - x.links || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map(({ o, links }) => ({ o, links }));
}

/** Orientation for a piece dropped on `c` with auto rotation. */
export function autoOrientation(level: Level, pieces: readonly Placed[], c: Cell, kind: PieceKind): Openings {
  const ranked = rankedOrientations(level, pieces, c, kind);
  if (ranked.length > 0) return ranked[0].o;
  // Nothing to connect to: pick one that at least points somewhere open.
  const others = pieces.filter((p) => !(p.at[0] === c.x && p.at[1] === c.y));
  const open = orientationsFor(kind).find((o) => openingDirs(o).every((d) => !deadSide(level, others, c, d)));
  return open ?? orientationsFor(kind)[0];
}

/** Orientations a tap cycles through with auto rotation (at most 2, all connecting). */
export function autoTurns(level: Level, pieces: readonly Placed[], c: Cell, kind: PieceKind): Openings[] {
  return rankedOrientations(level, pieces, c, kind)
    .slice(0, 2)
    .map((r) => r.o);
}

/** Orientation for a piece arriving from the tray. */
export function dropOrientation(level: Level, pieces: readonly Placed[], c: Cell, kind: PieceKind): Openings {
  return level.rotate === 'auto' ? autoOrientation(level, pieces, c, kind) : trayOrientation(kind);
}

export interface DropResult {
  ok: boolean;
  pieces: Placed[];
  /** A piece that was on the cell and went back to the tray. */
  swappedOut: Placed | null;
}

/**
 * Lay `kind` from the tray on `c`. A movable piece already there floats back to the
 * tray (swap). Refused (ok=false, nothing changes) when the cell cannot take it or
 * nothing of that kind is left in the tray.
 */
export function drop(level: Level, pieces: readonly Placed[], c: Cell, kind: PieceKind, openings?: Openings): DropResult {
  const same = { ok: false, pieces: [...pieces], swappedOut: null };
  if (!canPlace(level, c, kind)) return same;
  const old = pieceOn(pieces, c) ?? null;
  const rest = pieces.filter((p) => p !== old);
  if (handFor(level, rest)[kind] <= 0) return same;
  const o = openings ?? dropOrientation(level, rest, c, kind);
  if (!orientationsFor(kind).includes(o)) return same;
  return { ok: true, pieces: [...rest, { at: atOf(c), piece: kind, openings: o }], swappedOut: old };
}

/** Tap on a placed piece: turn it (auto: between connecting orientations; free: 90°). */
export function turn(level: Level, pieces: readonly Placed[], c: Cell): Placed[] {
  const p = pieceOn(pieces, c);
  if (!p) return [...pieces];
  let o: Openings;
  if (level.rotate === 'free') o = rotateCw(p.openings);
  else {
    const options = autoTurns(level, pieces, c, p.piece);
    if (options.length === 0) o = p.openings;
    else {
      const i = options.indexOf(p.openings);
      o = i < 0 ? options[0] : options[(i + 1) % options.length];
    }
  }
  return pieces.map((q) => (q === p ? { ...q, openings: o } : q));
}

/** Press-and-hold or drag to the tray: the piece goes back to the tray. */
export function takeBack(pieces: readonly Placed[], c: Cell): Placed[] {
  return pieces.filter((p) => !(p.at[0] === c.x && p.at[1] === c.y));
}

/** Move a placed piece to another cell (drag on the board); swaps with a movable piece there. */
export function move(level: Level, pieces: readonly Placed[], from: Cell, to: Cell): DropResult {
  const p = pieceOn(pieces, from);
  if (!p || sameCell(from, to)) return { ok: false, pieces: [...pieces], swappedOut: null };
  return drop(level, takeBack(pieces, from), to, p.piece);
}

/**
 * Tap on a ghost outline: lay that piece. A wrong piece on the cell floats back to
 * the tray; if the tray has none of that kind left, a wrong piece of that kind that
 * is off the planned route floats back first.
 */
export function placeGhost(level: Level, pieces: readonly Placed[], ghost: Placed, route: readonly Placed[]): DropResult {
  const c = { x: ghost.at[0], y: ghost.at[1] };
  let rest = takeBack(pieces, c);
  const old = pieceOn(pieces, c) ?? null;
  if (handFor(level, rest)[ghost.piece] <= 0) {
    const planned = (q: Placed) => route.some((r) => r.at[0] === q.at[0] && r.at[1] === q.at[1] && r.piece === q.piece && r.openings === q.openings);
    const spare = rest.find((q) => q.piece === ghost.piece && !planned(q));
    if (spare) rest = rest.filter((q) => q !== spare);
  }
  const r = drop(level, rest, c, ghost.piece, ghost.openings);
  return r.ok ? { ...r, swappedOut: old } : { ok: false, pieces: [...pieces], swappedOut: null };
}

/** Pieces still in the tray, in display order, with counts (digits are the only text). */
export function trayView(level: Level, pieces: readonly Placed[]): { piece: PieceKind; count: number }[] {
  const hand = handFor(level, pieces);
  const kinds: PieceKind[] = [];
  for (const t of level.tray) if (!kinds.includes(t.piece)) kinds.push(t.piece);
  for (const p of level.preplaced ?? []) if (!kinds.includes(p.piece)) kinds.push(p.piece);
  return kinds.map((piece) => ({ piece, count: hand[piece] }));
}

