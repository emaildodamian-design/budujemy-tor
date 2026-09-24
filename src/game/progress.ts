// Sessions and the bookmark. Pure: the day key comes in as a string, the storage
// adapter lives in platform/settings.ts.
//
// A session is 4 slots. Session 1 plays L01–L04. Later sessions play one warm-up
// (a mirrored copy of a level solved without help, picked from the date) and then
// 3 more levels: requeued "helped" levels first (mirrored), otherwise the next new
// level. After L40 the slots draw mirrored copies of solved L20–L40.

import { type Level, isRepair, mirrorLevel } from './level';

export const SLOTS = 4;
/** How many sessions later a level solved with help comes back (mirrored). */
export const REQUEUE_AFTER = 2;
/** At most this many requeued levels per session, so there is always something new. */
export const MAX_REQUEUE_PER_SESSION = 2;
export const LOG_SESSIONS = 5;

export interface Bookmark {
  /** Index of the next new level. */
  next: number;
  solvedSelf: string[];
  helped: string[];
  requeue: { id: string; dueSession: number }[];
  /** Sessions finished so far. */
  sessions: number;
  lastEndedDay: string | null;
  /** Last new levels: solved on the first test run with no lamp and no help? (max 2) */
  recent: boolean[];
  /** Parent screen: per finished session, levels solved without and with help (last 5). */
  log: { self: number; helped: number }[];
}

export const EMPTY_BOOKMARK: Bookmark = {
  next: 0,
  solvedSelf: [],
  helped: [],
  requeue: [],
  sessions: 0,
  lastEndedDay: null,
  recent: [],
  log: [],
};

export type SlotKind = 'first' | 'warmup' | 'new' | 'requeue' | 'replay';

export interface Slot {
  id: string;
  mirrored: boolean;
  kind: SlotKind;
  /** For new levels: the level index, and whether the level before it was quietly skipped. */
  index?: number;
  skipped?: boolean;
}

export interface SessionRun {
  /** 1-based session number. */
  number: number;
  day: string;
  slot: number;
  current: Slot;
  played: Slot[];
  requeuesUsed: number;
  self: number;
  helped: number;
}

export interface LevelResult {
  /** Solved on the first test run and no lamp was used. */
  clean: boolean;
  /** The ghost path was shown (stuck 4). */
  helped: boolean;
}

/** Small stable hash of a string (FNV-1a), for date-based picks. */
export function hashKey(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T>(xs: readonly T[], key: string): T => xs[hashKey(key) % xs.length];

/** The playable level for a slot (mirrored when asked). */
export function levelForSlot(levels: readonly Level[], slot: Slot): Level {
  const l = levels.find((x) => x.id === slot.id);
  if (!l) throw new Error(`unknown level ${slot.id}`);
  return slot.mirrored ? mirrorLevel(l) : l;
}

function nextNewSlot(levels: readonly Level[], bm: Bookmark): Slot | null {
  let i = bm.next;
  if (i >= levels.length) return null;
  let skipped = false;
  const quiet = bm.recent.length >= 2 && bm.recent.slice(-2).every(Boolean);
  const canSkip = (l: Level) => !l.intro && !isRepair(l);
  if (quiet && canSkip(levels[i]) && i + 1 < levels.length) {
    i += 1;
    skipped = true;
  }
  return { id: levels[i].id, mirrored: false, kind: 'new', index: i, skipped };
}

function replaySlot(levels: readonly Level[], bm: Bookmark, run: { day: string; slot: number }): Slot {
  const solved = new Set([...bm.solvedSelf, ...bm.helped]);
  const late = levels.slice(19).filter((l) => solved.has(l.id));
  const pool = late.length > 0 ? late : levels.filter((l) => solved.has(l.id));
  const l = pool.length > 0 ? pick(pool, `${run.day}#${run.slot}`) : levels[levels.length - 1];
  return { id: l.id, mirrored: true, kind: 'replay' };
}

/** Choose the level for slot `slot` of a session. */
export function chooseSlot(
  levels: readonly Level[],
  bm: Bookmark,
  run: Pick<SessionRun, 'number' | 'day' | 'slot' | 'requeuesUsed' | 'played'>,
): Slot {
  if (bm.sessions === 0 && bm.next < SLOTS) return { id: levels[bm.next].id, mirrored: false, kind: 'first', index: bm.next, skipped: false };
  if (run.slot === 0 && bm.solvedSelf.length > 0) {
    const id = pick(bm.solvedSelf, run.day);
    return { id, mirrored: true, kind: 'warmup' };
  }
  const due = bm.requeue.filter((r) => r.dueSession <= run.number && !run.played.some((p) => p.kind === 'requeue' && p.id === r.id));
  const fresh = nextNewSlot(levels, bm);
  if (due.length > 0 && (run.requeuesUsed < MAX_REQUEUE_PER_SESSION || !fresh)) return { id: due[0].id, mirrored: true, kind: 'requeue' };
  return fresh ?? replaySlot(levels, bm, run);
}

export function startSession(levels: readonly Level[], bm: Bookmark, day: string): SessionRun {
  const base = { number: bm.sessions + 1, day, slot: 0, played: [] as Slot[], requeuesUsed: 0, self: 0, helped: 0 };
  return { ...base, current: chooseSlot(levels, bm, base) };
}

/** A level was completed. Returns the new bookmark, and the next slot (or null after slot 4). */
export function finishLevel(levels: readonly Level[], bm: Bookmark, run: SessionRun, result: LevelResult): { bm: Bookmark; run: SessionRun; over: boolean } {
  const s = run.current;
  const helped = result.helped;
  const b: Bookmark = { ...bm };
  const addSolved = (id: string) => {
    if (helped) {
      if (!b.helped.includes(id)) b.helped = [...b.helped, id];
      b.requeue = [...b.requeue.filter((r) => r.id !== id), { id, dueSession: run.number + REQUEUE_AFTER }];
    } else {
      if (!b.solvedSelf.includes(id)) b.solvedSelf = [...b.solvedSelf, id];
    }
  };
  if (s.kind === 'first' || s.kind === 'new') {
    b.next = Math.max(b.next, (s.index ?? b.next) + 1);
    addSolved(s.id);
    // After a quiet skip the count starts again, so at most every other level is skipped.
    const clean = result.clean && !helped;
    b.recent = s.skipped ? [clean] : [...b.recent, clean].slice(-2);
  } else if (s.kind === 'requeue') {
    b.requeue = b.requeue.filter((r) => r.id !== s.id);
    addSolved(s.id);
  }
  // Warm-ups and replays after L40 are practice only: nothing to track.
  const played = [...run.played, s];
  const r: SessionRun = {
    ...run,
    played,
    slot: run.slot + 1,
    requeuesUsed: run.requeuesUsed + (s.kind === 'requeue' ? 1 : 0),
    self: run.self + (helped ? 0 : 1),
    helped: run.helped + (helped ? 1 : 0),
  };
  if (r.slot >= SLOTS) return { bm: b, run: r, over: true };
  return { bm: b, run: { ...r, current: chooseSlot(levels, b, r) }, over: false };
}

/**
 * The session ends (after slot 4, or by the parent's pause → end). A level in
 * progress is simply not counted: the bookmark only changes in finishLevel.
 */
export function endSession(bm: Bookmark, run: SessionRun, day: string): Bookmark {
  return {
    ...bm,
    sessions: bm.sessions + 1,
    lastEndedDay: day,
    log: [...bm.log, { self: run.self, helped: run.helped }].slice(-LOG_SESSIONS),
  };
}

/** Parent screen: "N / 40". */
export function progressCount(bm: Bookmark, total: number): number {
  return Math.min(total, bm.next);
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nat = (v: unknown, d = 0) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d);

/** Parse a stored bookmark; anything unknown falls back to a fresh start. */
export function parseBookmark(raw: string | null): Bookmark {
  let v: Record<string, unknown>;
  try {
    v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (typeof v !== 'object' || v === null) v = {};
  } catch {
    v = {};
  }
  const requeue = Array.isArray(v.requeue)
    ? (v.requeue as { id?: unknown; dueSession?: unknown }[])
        .filter((r) => r && typeof r.id === 'string')
        .map((r) => ({ id: r.id as string, dueSession: nat(r.dueSession) }))
    : [];
  const log = Array.isArray(v.log) ? (v.log as { self?: unknown; helped?: unknown }[]).filter(Boolean).map((l) => ({ self: nat(l.self), helped: nat(l.helped) })) : [];
  return {
    next: nat(v.next),
    solvedSelf: strings(v.solvedSelf),
    helped: strings(v.helped),
    requeue,
    sessions: nat(v.sessions),
    lastEndedDay: typeof v.lastEndedDay === 'string' ? v.lastEndedDay : null,
    recent: Array.isArray(v.recent) ? v.recent.filter((x): x is boolean => typeof x === 'boolean').slice(-2) : [],
    log: log.slice(-LOG_SESSIONS),
  };
}
