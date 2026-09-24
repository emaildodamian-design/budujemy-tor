// The test run: follow the track from the start shed and report how far the train gets.
// Pure. The UI animates the train along `path`, stops it at `stopCell`, glows `breakCell`.

import { type Cell, type Dir, cellKey, inBounds, opposite, sameCell, step } from './grid';
import { type Level, type PieceAt, type Placed, boardOf, cellOf, hasOpening, otherOpening, terrainAccepts, terrainAt } from './level';

export type FailReason =
  | 'edge' // the track points off the board
  | 'gap' // no piece in the next cell
  | 'mismatch' // the next piece does not open towards the train
  | 'needsBridge' // a non-bridge piece on the river
  | 'needsTunnel' // a non-tunnel piece on the mountain
  | 'needsTrack' // a bridge or tunnel on grass
  | 'depotSide' // reached the depot from the wrong side
  | 'missedStation' // reached the depot without passing every station
  | 'loop' // the track runs back into itself
  | 'overflow';

export interface TraceResult {
  success: boolean;
  /** The train got into the depot (only true together with success). */
  reached: boolean;
  /** Cells the train rides through, after the start shed, in order (depot not included). */
  path: Cell[];
  /** Where the train stops: the last cell of `path`, or the start shed. */
  stopCell: Cell;
  /** The cell that stopped the train (glows softly), if any. */
  breakCell: Cell | null;
  reason: FailReason | null;
  /** Stations not on the path (only reported when the depot was reached). */
  missingStations: Cell[];
  /** Direction the train was heading when it stopped. */
  heading: Dir;
}

/** The piece on a cell: fixed track and stations first, then movable pieces. */
export function pieceAt(level: Level, pieces: readonly Placed[], c: Cell): PieceAt | Placed | undefined {
  return boardOf(level).fixed.get(cellKey(c)) ?? pieces.find((p) => p.at[0] === c.x && p.at[1] === c.y);
}

function terrainReason(level: Level, c: Cell): FailReason {
  const t = terrainAt(level, c);
  return t === 'river' ? 'needsBridge' : t === 'mountain' ? 'needsTunnel' : 'needsTrack';
}

export function trace(level: Level, pieces: readonly Placed[]): TraceResult {
  const b = boardOf(level);
  const size = { cols: b.cols, rows: b.rows };
  let pos = b.start;
  let dir: Dir = b.startExit;
  const path: Cell[] = [];
  const seen = new Set<string>([cellKey(pos)]);
  const fail = (reason: FailReason, breakCell: Cell | null, missingStations: Cell[] = []): TraceResult => ({
    success: false,
    reached: false,
    path,
    stopCell: pos,
    breakCell,
    reason,
    missingStations,
    heading: dir,
  });

  for (let i = 0; i <= b.cols * b.rows; i++) {
    const nxt = step(pos, dir);
    if (!inBounds(nxt, size)) return fail('edge', null);
    if (sameCell(nxt, b.depot)) {
      if (opposite(dir) !== b.depotEntry) return fail('depotSide', nxt);
      const missing = b.stations.filter((s) => !path.some((c) => sameCell(c, s)));
      if (missing.length > 0) return fail('missedStation', missing[0], missing);
      return { success: true, reached: true, path, stopCell: pos, breakCell: null, reason: null, missingStations: [], heading: dir };
    }
    if (sameCell(nxt, b.start)) return fail('loop', nxt);
    const p = pieceAt(level, pieces, nxt);
    if (!p) return fail('gap', nxt);
    const entry = opposite(dir);
    if (!hasOpening(p.openings, entry)) return fail('mismatch', nxt);
    if (!terrainAccepts(terrainAt(level, nxt), p.piece)) return fail(terrainReason(level, nxt), nxt);
    if (seen.has(cellKey(nxt))) return fail('loop', nxt);
    seen.add(cellKey(nxt));
    path.push(nxt);
    dir = otherOpening(p.openings, entry);
    pos = nxt;
  }
  return fail('overflow', null);
}

/** Convenience for tests and the UI: which cells of the level are stations. */
export const stationCells = (level: Level): Cell[] => (level.stations ?? []).map((s) => cellOf(s.at));
