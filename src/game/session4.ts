// v4 sessions and the v4 bookmark. Pure: the day key comes in as a string, storage lives
// in platform/settings.ts under its own key (the v3 bookmark and the lock are separate).
//
// A session is N new puzzles starting at the bookmark (N is the parent setting, 2–5,
// default 3). No warm-up, no step-down, no requeue: session 1 starts at P01. After the last
// level, slots replay solved levels from chapter 5 on, picked from the date.

import { hashKey } from './progress';
import type { ProgLevel } from './program';

export const LEVEL_SET_V4 = 4;
export const PUZZLE_COUNTS = [2, 3, 4, 5] as const;
export type PuzzleCount = (typeof PUZZLE_COUNTS)[number];
export const DEFAULT_PUZZLES: PuzzleCount = 3;

export interface Bookmark4 {
  levelSet: typeof LEVEL_SET_V4;
  /** Index of the next new level. */
  next: number;
  /** Levels solved (with or without the lamp). */
  solved: string[];
  /** Levels where the lamp was used (parent view only). */
  helped: string[];
}

export const EMPTY_BOOKMARK4: Bookmark4 = { levelSet: LEVEL_SET_V4, next: 0, solved: [], helped: [] };

export interface Slot4 {
  id: string;
  /** Index of a new level (moves the bookmark); absent for a replay. */
  index?: number;
}

export interface Session4 {
  day: string;
  /** Puzzles in this session. */
  total: number;
  /** 0-based slot being played. */
  slot: number;
  current: Slot4;
  played: Slot4[];
}

export interface PuzzleResult4 {
  /** The lamp was used on this level. */
  helped: boolean;
}

function slotFor(levels: readonly ProgLevel[], bm: Bookmark4, day: string, slot: number, played: readonly Slot4[]): Slot4 {
  if (bm.next < levels.length) return { id: levels[bm.next].id, index: bm.next };
  const late = levels.filter((l) => l.chapter >= 5 && bm.solved.includes(l.id) && !played.some((p) => p.id === l.id));
  const pool = late.length ? late : levels.filter((l) => !played.some((p) => p.id === l.id));
  const l = (pool.length ? pool : levels)[hashKey(`${day}#${slot}`) % (pool.length || levels.length)];
  return { id: l.id };
}

export function startSession4(levels: readonly ProgLevel[], bm: Bookmark4, day: string, total: PuzzleCount = DEFAULT_PUZZLES): Session4 {
  return { day, total, slot: 0, current: slotFor(levels, bm, day, 0, []), played: [] };
}

/** A puzzle was solved. Returns the new bookmark and session; `over` after the last puzzle. */
export function finishPuzzle4(levels: readonly ProgLevel[], bm: Bookmark4, run: Session4, result: PuzzleResult4): { bm: Bookmark4; run: Session4; over: boolean } {
  const s = run.current;
  const b: Bookmark4 = { ...bm };
  if (s.index !== undefined) {
    b.next = Math.max(b.next, s.index + 1);
    if (!b.solved.includes(s.id)) b.solved = [...b.solved, s.id];
    if (result.helped && !b.helped.includes(s.id)) b.helped = [...b.helped, s.id];
  }
  const played = [...run.played, s];
  const slot = run.slot + 1;
  if (slot >= run.total) return { bm: b, run: { ...run, slot, played }, over: true };
  return { bm: b, run: { ...run, slot, played, current: slotFor(levels, b, run.day, slot, played) }, over: false };
}

/** Parent preview "Ustaw jako następny": only `next` changes. */
export function setNextLevel4(bm: Bookmark4, index: number): Bookmark4 {
  return { ...bm, next: index };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Parse a stored v4 bookmark; anything unknown falls back to a fresh start at P01. */
export function parseBookmark4(raw: string | null): Bookmark4 {
  let v: Record<string, unknown>;
  try {
    v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (typeof v !== 'object' || v === null || Array.isArray(v)) v = {};
  } catch {
    v = {};
  }
  if (v.levelSet !== LEVEL_SET_V4) return { ...EMPTY_BOOKMARK4 };
  const next = typeof v.next === 'number' && Number.isInteger(v.next) && v.next >= 0 ? v.next : 0;
  return { levelSet: LEVEL_SET_V4, next, solved: strings(v.solved), helped: strings(v.helped) };
}

export const parsePuzzles = (v: unknown): PuzzleCount => (PUZZLE_COUNTS.includes(v as PuzzleCount) ? (v as PuzzleCount) : DEFAULT_PUZZLES);
