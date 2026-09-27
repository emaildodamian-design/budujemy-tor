// The program editor's model. Pure: every operation returns a new program (or null when it
// cannot be done) and never touches the input.
//
// Invariant: each row always costs exactly its slot count (`slots`, `fslots`); empty slots
// (holes) make up the rest. Operations move holes around but never delete, reorder or
// change a command the player placed: only `takeOut` removes one, and only the player
// calls it. A Repeat can only be taken out once its body is empty.

import {
  type Count,
  type Move,
  type ProgLevel,
  type Program,
  type Row,
  type SlotRef,
  type Tok,
  BODY_MAX,
  CALL,
  COUNTS,
  MAX_DEPTH,
  givenOf,
  mv,
  rep,
} from './program';

export type Tile = { t: 'move'; m: Move } | { t: 'repeat' } | { t: 'call' };

/** The program a level starts with: empty slots, or the debug level's given program. */
export function initialProgram(pl: ProgLevel): Program {
  const given = givenOf(pl);
  if (given) return given;
  return { main: Array.from({ length: pl.slots }, (): Tok => ({ t: 'hole' })), p: Array.from({ length: pl.fslots }, (): Tok => ({ t: 'hole' })) };
}

const clone = (p: Program): Program => JSON.parse(JSON.stringify(p)) as Program;

/** One box of the program strip, in pre-order (a Repeat head is one box). */
export interface Box {
  ref: SlotRef;
  tok: Tok;
  /** Nesting depth of the box (0: directly in the row). */
  depth: number;
  /** Box indices of the Repeat heads this box sits inside, outermost first. */
  within: number[];
  /** First / last box of each enclosing body (for drawing the brackets). */
  opens: number;
  closes: number;
}

export function boxesOf(row: readonly Tok[], rowId: Row): Box[] {
  const out: Box[] = [];
  const walk = (list: readonly Tok[], depth: number, within: number[]) => {
    list.forEach((t) => {
      const i = out.length;
      out.push({ ref: { row: rowId, i }, tok: t, depth, within, opens: 0, closes: 0 });
      if (t.t === 'repeat') {
        const first = out.length;
        walk(t.body, depth + 1, [...within, i]);
        if (out.length > first) {
          out[first].opens++;
          out[out.length - 1].closes++;
        }
      }
    });
  };
  walk(row, 0, []);
  return out;
}

interface Located {
  /** The list holding the token. */
  list: Tok[];
  index: number;
  depth: number;
  /** Lists from the row down to `list` (row first), with the index of the Repeat that opens the next one. */
  path: { list: Tok[]; index: number }[];
}

function locate(row: Tok[], i: number): Located | null {
  let k = 0;
  const walk = (list: Tok[], depth: number, path: { list: Tok[]; index: number }[]): Located | null => {
    for (let j = 0; j < list.length; j++) {
      if (k === i) return { list, index: j, depth, path };
      k++;
      const t = list[j];
      if (t.t === 'repeat') {
        const r = walk(t.body, depth + 1, [...path, { list, index: j }]);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(row, 0, []);
}

const rowOf = (p: Program, r: Row): Tok[] => (r === 'main' ? p.main : p.p);

export function tokenAt(p: Program, ref: SlotRef): Tok | null {
  const at = locate(rowOf(p, ref.row), ref.i);
  return at ? at.list[at.index] : null;
}

/** First empty slot (main row first, then P), or null when the program is full. */
export function firstHole(p: Program, from?: SlotRef): SlotRef | null {
  const all = [...boxesOf(p.main, 'main'), ...boxesOf(p.p, 'p')];
  let start = 0;
  if (from) start = all.findIndex((b) => b.ref.row === from.row && b.ref.i === from.i) + 1;
  for (let k = 0; k < all.length; k++) {
    const b = all[(start + k) % all.length];
    if (b.tok.t === 'hole') return b.ref;
  }
  return null;
}

/**
 * Take one hole for a Repeat body: from the same list (after `skip`, then before it), else
 * from the lists around the enclosing Repeats, nearest first. Removes it and returns true.
 */
function takeHole(at: { list: Tok[]; path: { list: Tok[]; index: number }[] }, skip: Tok): boolean {
  const lists = [at.list, ...[...at.path].reverse().map((p) => p.list)];
  const anchors = [skip, ...[...at.path].reverse().map((p) => p.list[p.index])];
  for (let k = 0; k < lists.length; k++) {
    const list = lists[k];
    const pos = list.indexOf(anchors[k]);
    const order = [...list.keys()].filter((j) => j > pos).concat([...list.keys()].filter((j) => j < pos).reverse());
    for (const j of order) {
      if (list[j].t === 'hole') {
        list.splice(j, 1);
        return true;
      }
    }
  }
  return false;
}

/** Put a hole right after `index` in `list`; a full body pushes a hole out to the next list up. */
function giveHole(list: Tok[], index: number, path: { list: Tok[]; index: number }[]): void {
  list.splice(index + 1, 0, { t: 'hole' });
  let cur = list;
  const up = [...path];
  while (up.length && cur.length > BODY_MAX) {
    const k = cur.map((t) => t.t).lastIndexOf('hole');
    if (k < 0) break;
    cur.splice(k, 1);
    const parent = up.pop()!;
    parent.list.splice(parent.index + 1, 0, { t: 'hole' });
    cur = parent.list;
  }
}

/** May a Repeat sit at this depth? */
const repeatAllowed = (pl: ProgLevel, depth: number) => pl.repeat && (depth === 0 || (pl.nesting && depth < MAX_DEPTH));

/** Fill the empty slot `ref` with a palette tile. Null when it cannot go there. */
export function place(pl: ProgLevel, prog: Program, ref: SlotRef, tile: Tile): Program | null {
  const p = clone(prog);
  const at = locate(rowOf(p, ref.row), ref.i);
  if (!at || at.list[at.index].t !== 'hole') return null;
  if (tile.t === 'move') {
    at.list[at.index] = mv(tile.m);
    return p;
  }
  if (tile.t === 'call') {
    if (pl.fslots === 0 || ref.row === 'p') return null;
    at.list[at.index] = CALL;
    return p;
  }
  if (!repeatAllowed(pl, at.depth)) return null;
  const self = at.list[at.index];
  if (!takeHole(at, self)) return null;
  const k = at.list.indexOf(self);
  at.list[k] = rep(2, [{ t: 'hole' }]);
  return p;
}

/** The player takes a command out: it becomes an empty slot (an empty Repeat becomes 1 + body slots). */
export function takeOut(prog: Program, ref: SlotRef): Program | null {
  const p = clone(prog);
  const at = locate(rowOf(p, ref.row), ref.i);
  if (!at) return null;
  const t = at.list[at.index];
  if (t.t === 'hole') return null;
  if (t.t === 'repeat') {
    if (t.body.some((b) => b.t !== 'hole')) return null;
    at.list[at.index] = { t: 'hole' };
    for (let k = 0; k < t.body.length; k++) giveHole(at.list, at.index, at.path);
    return p;
  }
  at.list[at.index] = { t: 'hole' };
  return p;
}

/** A Repeat can be taken out once its body is empty. */
export function canTakeOut(prog: Program, ref: SlotRef): boolean {
  const t = tokenAt(prog, ref);
  return !!t && t.t !== 'hole' && (t.t !== 'repeat' || t.body.every((b) => b.t === 'hole'));
}

/** Make a Repeat's body one slot longer (the slot comes from an empty slot around it). */
export function grow(prog: Program, ref: SlotRef): Program | null {
  const p = clone(prog);
  const at = locate(rowOf(p, ref.row), ref.i);
  const t = at?.list[at.index];
  if (!at || !t || t.t !== 'repeat' || t.body.length >= BODY_MAX) return null;
  if (!takeHole(at, t)) return null;
  t.body.push({ t: 'hole' });
  return p;
}

/** Make a Repeat's body one slot shorter: only when its last slot is empty. */
export function shrink(prog: Program, ref: SlotRef): Program | null {
  const p = clone(prog);
  const at = locate(rowOf(p, ref.row), ref.i);
  const t = at?.list[at.index];
  if (!at || !t || t.t !== 'repeat' || t.body.length <= 1 || t.body[t.body.length - 1].t !== 'hole') return null;
  t.body.pop();
  giveHole(at.list, at.index, at.path);
  return p;
}

export const canGrow = (prog: Program, ref: SlotRef) => grow(prog, ref) !== null;
export const canShrink = (prog: Program, ref: SlotRef) => shrink(prog, ref) !== null;

/** Tap on a Repeat's count: 2 → 3 → 4 → 5 → 2. */
export function cycleCount(prog: Program, ref: SlotRef): Program | null {
  const p = clone(prog);
  const at = locate(rowOf(p, ref.row), ref.i);
  const t = at?.list[at.index];
  if (!t || t.t !== 'repeat') return null;
  t.n = COUNTS[(COUNTS.indexOf(t.n) + 1) % COUNTS.length] as Count;
  return p;
}

/** Programs as the player's commands only (for "nothing but the player changed a command"). */
export function commandsOf(p: Program): string {
  const f = (row: readonly Tok[]): string => row.filter((t) => t.t !== 'hole').map((t) => (t.t === 'move' ? t.m : t.t === 'call' ? 'P' : `${t.n}[${f(t.body)}]`)).join(' ');
  return `${f(p.main)};${f(p.p)}`;
}

