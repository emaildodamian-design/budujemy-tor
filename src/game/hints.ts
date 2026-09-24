// Helper hints. Pure. A hint only ever POINTS at something; it never removes,
// moves or rotates a piece itself (the child does that).
//
// nextHint(level, pieces):
//  1. trace; success → none.
//  2. a completion that keeps every piece where it is → 'place' its first step.
//  3. else walk back from the break over movable pieces: the smallest k for which
//     taking away the last k pieces allows a completion → 'change' that piece.
//  4. else 'blocked': stray pieces that hold what the route needs.

import { type Cell, cellKey } from './grid';
import { type Counts, type Level, type Openings, type PieceKind, type Placed, PIECE_KINDS, boardOf, cellOf, sameAt } from './level';
import { countsOf, handFor, shortestCompletion } from './solver';
import { trace } from './trace';

export type Hint =
  | { type: 'none' }
  | { type: 'place'; cell: Cell; piece: PieceKind; openings: Openings }
  | { type: 'change'; cell: Cell; piece: PieceKind; openings: Openings }
  | { type: 'blocked'; cells: Cell[] };

export interface Plan {
  hint: Hint;
  /** The pieces to lay (route order) to finish from here; empty for none/blocked. */
  completion: Placed[];
}

const at = (p: { at: [number, number] }) => cellOf(p.at);
const without = (pieces: readonly Placed[], gone: readonly Placed[]) => pieces.filter((p) => !gone.includes(p));

function addCounts(a: Counts, b: Counts): Counts {
  return { straight: a.straight + b.straight, curve: a.curve + b.curve, bridge: a.bridge + b.bridge, tunnel: a.tunnel + b.tunnel };
}

export function plan(level: Level, pieces: readonly Placed[]): Plan {
  const t = trace(level, pieces);
  if (t.success) return { hint: { type: 'none' }, completion: [] };
  const fixed = boardOf(level).fixed;
  const movableAt = (c: Cell) => (fixed.has(cellKey(c)) ? undefined : pieces.find((p) => p.at[0] === c.x && p.at[1] === c.y));

  // 2. Keep everything, continue from where the train stops.
  const direct = shortestCompletion(level, pieces, handFor(level, pieces));
  if (direct && direct.length > 0) {
    const f = direct[0];
    return { hint: { type: 'place', cell: at(f), piece: f.piece, openings: f.openings }, completion: direct };
  }

  // 3. Walk back: the piece that stopped the train (if it is off the route), then the route.
  const removal: Placed[] = [];
  if (t.breakCell) {
    const b = movableAt(t.breakCell);
    if (b && !t.path.some((c) => c.x === b.at[0] && c.y === b.at[1])) removal.push(b);
  }
  for (let i = t.path.length - 1; i >= 0; i--) {
    const p = movableAt(t.path[i]);
    if (p) removal.push(p);
  }
  for (let k = 1; k <= removal.length; k++) {
    const gone = removal.slice(0, k);
    const keep = without(pieces, gone);
    const done = shortestCompletion(level, keep, handFor(level, keep));
    if (done && done.length > 0) {
      const target = gone[k - 1];
      const f = done.find((p) => sameAt(p.at, target.at)) ?? done[0];
      return { hint: { type: 'change', cell: at(target), piece: f.piece, openings: f.openings }, completion: done };
    }
  }

  // 4. Stray pieces (off the route) hold cells or pieces the route needs.
  const onRoute = new Set(t.path.map(cellKey));
  const strays = pieces.filter((p) => !onRoute.has(cellKey(at(p))));
  for (let k = 0; k <= removal.length; k++) {
    const keep = without(without(pieces, strays), removal.slice(0, k));
    const done = shortestCompletion(level, keep, handFor(level, keep));
    if (!done) continue;
    const route = new Set(done.map((p) => cellKey(at(p))));
    const blocked = new Set<Placed>(strays.filter((p) => route.has(cellKey(at(p)))));
    // Short of a kind? Point at strays of that kind (in board order) until there are enough.
    const hand = addCounts(handFor(level, pieces), countsOf(removal.slice(0, k)));
    for (const s of blocked) hand[s.piece]++;
    const need = countsOf(done);
    for (const kind of PIECE_KINDS) {
      for (const s of strays) {
        if (hand[kind] >= need[kind]) break;
        if (s.piece === kind && !blocked.has(s)) {
          blocked.add(s);
          hand[kind]++;
        }
      }
    }
    if (blocked.size > 0) return { hint: { type: 'blocked', cells: [...blocked].map(at) }, completion: [] };
  }
  return { hint: { type: 'blocked', cells: strays.map(at) }, completion: [] };
}

export function nextHint(level: Level, pieces: readonly Placed[]): Hint {
  return plan(level, pieces).hint;
}

/**
 * Ghost outlines for the rest of the route, except its final piece (the child lays
 * that one by hand). Pure: it only describes pieces; nothing on the board changes.
 */
export function ghostPath(level: Level, pieces: readonly Placed[]): Placed[] {
  const p = plan(level, pieces);
  if (p.hint.type !== 'place' && p.hint.type !== 'change') return [];
  return p.completion.slice(0, -1);
}
