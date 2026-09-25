import { describe, expect, it } from 'vitest';
import { isLocked, markSessionEnded } from '../src/game/lock';
import { isRepair } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import {
  type Bookmark,
  EMPTY_BOOKMARK,
  SLOTS,
  type SessionRun,
  endSession,
  finishLevel,
  levelForSlot,
  parseBookmark,
  progressCount,
  startSession,
} from '../src/game/progress';

const CLEAN = { clean: true, helped: false };
const OK = { clean: false, helped: false };
const HELPED = { clean: false, helped: true };

/** Play a whole session with the given results per slot. */
function playSession(bm: Bookmark, day: string, results = [OK, OK, OK, OK]): { bm: Bookmark; run: SessionRun; ids: string[] } {
  let run = startSession(LEVELS, bm, day);
  const ids: string[] = [];
  for (let i = 0; i < SLOTS; i++) {
    ids.push(run.current.id + (run.current.mirrored ? "'" : ''));
    const r = finishLevel(LEVELS, bm, run, results[i]);
    bm = r.bm;
    run = r.run;
    expect(r.over).toBe(i === SLOTS - 1);
  }
  return { bm: endSession(bm, run, day), run, ids };
}

describe('10. sessions', () => {
  it('a session is 4 slots, and session 1 plays L01–L04', () => {
    const { ids, bm } = playSession(EMPTY_BOOKMARK, '2026-09-24');
    expect(ids).toEqual(['L01', 'L02', 'L03', 'L04']);
    expect(bm).toMatchObject({ next: 4, sessions: 1, lastEndedDay: '2026-09-24' });
  });

  it('later sessions: one mirrored warm-up of a self-solved level, then 3 new levels', () => {
    let bm = playSession(EMPTY_BOOKMARK, '2026-09-24').bm;
    const s2 = playSession(bm, '2026-09-25');
    expect(s2.ids.slice(1)).toEqual(['L05', 'L06', 'L07']);
    expect(s2.ids[0]).toMatch(/^L0[1-4]'$/);
    bm = s2.bm;
    for (const day of ['2026-09-26', '2026-09-27', '2026-10-01', '2026-12-31']) {
      const run = startSession(LEVELS, bm, day);
      expect(run.current.kind).toBe('warmup');
      expect(run.current.mirrored).toBe(true);
      expect(bm.solvedSelf).toContain(run.current.id);
    }
    // Deterministic from the local date.
    expect(startSession(LEVELS, bm, '2026-09-26').current).toEqual(startSession(LEVELS, bm, '2026-09-26').current);
  });

  it('the warm-up is always a self-solved level, never one solved with help', () => {
    let bm = playSession(EMPTY_BOOKMARK, 'd0', [HELPED, CLEAN, HELPED, HELPED]).bm;
    for (let d = 1; d < 30; d++) {
      const run = startSession(LEVELS, bm, `2026-10-${d}`);
      expect(run.current).toMatchObject({ id: 'L02', kind: 'warmup', mirrored: true });
    }
    bm = { ...bm };
  });

  it('slot 4 ends the session → end screen → next-day lock', () => {
    let bm = EMPTY_BOOKMARK;
    let run = startSession(LEVELS, bm, '2026-09-24');
    let over = false;
    for (let i = 0; i < SLOTS; i++) ({ bm, run, over } = finishLevel(LEVELS, bm, run, OK));
    expect(over).toBe(true);
    bm = endSession(bm, run, '2026-09-24');
    const now = new Date(2026, 8, 24, 19);
    expect(isLocked(markSessionEnded(now), now)).toBe(true);
    expect(bm.lastEndedDay).toBe('2026-09-24');
  });

  it('parent pause → end: the level in progress is not counted and is played next time', () => {
    let bm = EMPTY_BOOKMARK;
    let run = startSession(LEVELS, bm, 'd1');
    ({ bm, run } = finishLevel(LEVELS, bm, run, OK)); // L01 done, L02 in progress
    expect(run.current.id).toBe('L02');
    bm = endSession(bm, run, 'd1'); // paused and ended
    expect(bm).toMatchObject({ next: 1, solvedSelf: ['L01'], sessions: 1 });
    expect(bm.log.at(-1)).toEqual({ self: 1, helped: 0 });
    const next = startSession(LEVELS, bm, 'd2');
    expect(next.current).toMatchObject({ id: 'L01', kind: 'warmup' });
    const after = finishLevel(LEVELS, bm, next, OK);
    expect(after.run.current).toMatchObject({ id: 'L02', kind: 'new' });
  });

  it('a helped level comes back mirrored 2 sessions later, taking one of the 3 new slots', () => {
    let bm = playSession(EMPTY_BOOKMARK, 'd1').bm; // session 1: L01–L04
    const s2 = playSession(bm, 'd2', [OK, OK, HELPED, OK]); // L05 ok, L06 helped, L07 ok
    expect(s2.ids.slice(1)).toEqual(['L05', 'L06', 'L07']);
    bm = s2.bm;
    expect(bm.helped).toEqual(['L06']);
    expect(bm.requeue).toEqual([{ id: 'L06', dueSession: 4 }]);
    const s3 = playSession(bm, 'd3');
    expect(s3.ids.slice(1)).toEqual(['L08', 'L09', 'L10']);
    const s4 = playSession(s3.bm, 'd4');
    expect(s4.ids.slice(1)).toEqual(["L06'", 'L11', 'L12']);
    expect(s4.bm.requeue).toEqual([]);
    expect(s4.bm.solvedSelf).toContain('L06');
  });

  it('quiet skip: two clean first-run solves skip the next level, unless it is an intro or repair level', () => {
    let bm = playSession(EMPTY_BOOKMARK, 'd1').bm;
    // Session 2: L05 (intro) clean, L06 clean → next is L07 (plain) → skipped, L08 is played.
    const s2 = playSession(bm, 'd2', [OK, CLEAN, CLEAN, OK]);
    expect(s2.ids.slice(1)).toEqual(['L05', 'L06', 'L08']);
    bm = s2.bm;
    expect(bm.next).toBe(8);
    expect(bm.solvedSelf).not.toContain('L07');
    // Intro and repair levels are never skipped.
    for (const l of LEVELS) {
      const i = LEVELS.indexOf(l);
      const run = startSession(LEVELS, { ...bm, next: i, recent: [true, true], sessions: 3 }, 'd9');
      const after = finishLevel(LEVELS, { ...bm, next: i, recent: [true, true], sessions: 3 }, run, OK).run.current;
      if ((l.intro || isRepair(l)) && after.kind === 'new') expect(after.id).toBe(l.id);
    }
    // Nothing on screen: the slot looks like any other new level.
    expect(Object.keys(s2.run.played[3])).not.toContain('label');
  });

  it('a skip needs two more clean solves before the next one', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, sessions: 5, next: 23, solvedSelf: ['L01'], recent: [true, true] };
    let run = startSession(LEVELS, bm, 'd');
    let b = bm;
    ({ bm: b, run } = finishLevel(LEVELS, b, run, OK)); // warm-up
    expect(run.current).toMatchObject({ id: 'L25', skipped: true }); // L24 skipped
    ({ bm: b, run } = finishLevel(LEVELS, b, run, CLEAN));
    expect(run.current).toMatchObject({ id: 'L26', skipped: false });
  });

  it('after L40 the slots draw mirrored solved L20–L40, deterministic by date', () => {
    const solved = LEVELS.map((l) => l.id);
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: 40, sessions: 20, solvedSelf: solved };
    const a = playSession(bm, '2027-01-01');
    const b = playSession(bm, '2027-01-01');
    expect(a.ids).toEqual(b.ids);
    for (const id of a.ids.slice(1)) {
      expect(id.endsWith("'")).toBe(true);
      expect(Number(id.slice(1, 3))).toBeGreaterThanOrEqual(20);
    }
    expect(progressCount(a.bm, 40)).toBe(40);
  });

  it('levelForSlot mirrors when asked', () => {
    const l = levelForSlot(LEVELS, { id: 'L03', mirrored: true, kind: 'warmup' });
    expect(l.grid).toEqual(['..A', '.B.', '...']);
    expect(l.start.exit).toBe('W');
  });

  it('the parent log keeps the last 5 sessions', () => {
    let bm = EMPTY_BOOKMARK;
    for (let d = 1; d <= 7; d++) bm = playSession(bm, `d${d}`, [OK, HELPED, OK, OK]).bm;
    expect(bm.log).toHaveLength(5);
    expect(bm.log[0]).toEqual({ self: 3, helped: 1 });
  });
});

describe('bookmark storage format', () => {
  it('round-trips and survives garbage (no timestamps beyond the day key)', () => {
    const bm = playSession(EMPTY_BOOKMARK, '2026-09-24').bm;
    expect(parseBookmark(JSON.stringify(bm))).toEqual(bm);
    expect(parseBookmark(null)).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark('{oops')).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark('[1,2]').next).toBe(0);
    expect(parseBookmark('{"next":-3,"solvedSelf":[1,"L01"],"requeue":[{"id":"L02","dueSession":"x"}]}')).toMatchObject({
      next: 0,
      solvedSelf: ['L01'],
      requeue: [{ id: 'L02', dueSession: 0 }],
    });
    const keys = Object.keys(bm).sort();
    expect(keys).toEqual(['helped', 'lastEndedDay', 'log', 'next', 'recent', 'requeue', 'sessions', 'solvedSelf']);
    expect(JSON.stringify(bm)).not.toMatch(/\d{10,}/); // no epoch timestamps
  });
});
