import { describe, expect, it } from 'vitest';
import { isLocked, markSessionEnded } from '../src/game/lock';
import { isRepair, kindOf } from '../src/game/level';
import { ALL_LEVELS, LEVELS } from '../src/game/levels';
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
  setNextLevel,
  startSession,
  warmupSlot,
} from '../src/game/progress';

const CLEAN = { clean: true, helped: false };
const OK = { clean: false, helped: false };
const HELPED = { clean: false, helped: true };
const idx = (id: string) => LEVELS.findIndex((l) => l.id === id);
const chapterOf = (id: string) => ALL_LEVELS.find((l) => l.id === id)!.chapter;

/** Play a whole session with the given results per slot. */
function playSession(bm: Bookmark, day: string, results = [OK, OK, OK, OK]): { bm: Bookmark; run: SessionRun; ids: string[] } {
  let run = startSession(ALL_LEVELS, bm, day);
  const ids: string[] = [];
  for (let i = 0; i < SLOTS; i++) {
    ids.push(run.current.id + (run.current.mirrored ? "'" : ''));
    const r = finishLevel(ALL_LEVELS, bm, run, results[i]);
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
      const run = startSession(ALL_LEVELS, bm, day);
      expect(run.current.kind).toBe('warmup');
      expect(run.current.mirrored).toBe(true);
      expect(bm.solvedSelf).toContain(run.current.id);
    }
    expect(startSession(ALL_LEVELS, bm, '2026-09-26').current).toEqual(startSession(ALL_LEVELS, bm, '2026-09-26').current);
  });

  it('slot 4 ends the session → end screen → next-day lock', () => {
    let bm = EMPTY_BOOKMARK;
    let run = startSession(ALL_LEVELS, bm, '2026-09-24');
    let over = false;
    for (let i = 0; i < SLOTS; i++) ({ bm, run, over } = finishLevel(ALL_LEVELS, bm, run, OK));
    expect(over).toBe(true);
    bm = endSession(bm, run, '2026-09-24');
    const now = new Date(2026, 8, 24, 19);
    expect(isLocked(markSessionEnded(now), now)).toBe(true);
    expect(bm.lastEndedDay).toBe('2026-09-24');
  });

  it('parent pause → end: the level in progress is not counted and is played next time', () => {
    let bm = EMPTY_BOOKMARK;
    let run = startSession(ALL_LEVELS, bm, 'd1');
    ({ bm, run } = finishLevel(ALL_LEVELS, bm, run, OK));
    expect(run.current.id).toBe('L02');
    bm = endSession(bm, run, 'd1');
    expect(bm).toMatchObject({ next: 1, solvedSelf: ['L01'], sessions: 1 });
    const next = startSession(ALL_LEVELS, bm, 'd2');
    expect(next.current).toMatchObject({ id: 'L01', kind: 'warmup' });
    const after = finishLevel(ALL_LEVELS, bm, next, OK);
    expect(after.run.current).toMatchObject({ id: 'L02', kind: 'new' });
  });

  it('a helped main level comes back mirrored 2 sessions later, taking one of the 3 new slots', () => {
    const start: Bookmark = { ...EMPTY_BOOKMARK, next: 12, sessions: 4, solvedSelf: LEVELS.slice(0, 12).map((l) => l.id) };
    const s = playSession(start, 'd5', [OK, OK, OK, OK]); // L13 L14 L15
    expect(s.ids.slice(1)).toEqual(['L13', 'L14', 'L15']);
    const h = playSession(s.bm, 'd6', [OK, HELPED, OK, OK]); // L16 helped → L17 has a sibling → L17s' first
    expect(h.ids.slice(1)).toEqual(['L16', "L17s'", 'L17']);
    expect(h.bm.requeue).toEqual([{ id: 'L16', dueSession: 8 }]);
    const n1 = playSession(h.bm, 'd7');
    expect(n1.ids.slice(1)).toEqual(['L18', 'L19', 'L20']);
    const n2 = playSession(n1.bm, 'd8');
    expect(n2.ids.slice(1)).toEqual(["L16'", 'L21', 'L22']);
    expect(n2.bm.requeue).toEqual([]);
    expect(n2.bm.solvedSelf).toContain('L16');
  });

  it('quiet skip: two clean first-run solves skip the next level, unless it is an intro or repair level', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: idx('L08'), sessions: 3, solvedSelf: ['L01'] };
    const s = playSession(bm, 'd', [OK, CLEAN, CLEAN, OK]);
    expect(s.ids.slice(1)).toEqual(['L08', 'L09', 'L11']);
    expect(s.bm.solvedSelf).not.toContain('L10');
    for (const l of LEVELS) {
      const i = LEVELS.indexOf(l);
      const bm: Bookmark = { ...EMPTY_BOOKMARK, next: i, recent: [true, true], sessions: 3, solvedSelf: ['L01'] };
      const run = startSession(ALL_LEVELS, bm, 'd9');
      const after = finishLevel(ALL_LEVELS, bm, run, OK).run.current;
      if (kindOf(l) === 'intro' || isRepair(l)) expect(after.id).toBe(l.id);
      else if (i + 1 < LEVELS.length) expect(after).toMatchObject({ id: LEVELS[i + 1].id, skipped: true });
    }
  });

  it('after L48 the slots draw mirrored solved L25–L48, deterministic by date', () => {
    const solved = LEVELS.map((l) => l.id);
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: 48, sessions: 20, solvedSelf: solved };
    const a = playSession(bm, '2027-01-01');
    const b = playSession(bm, '2027-01-01');
    expect(a.ids).toEqual(b.ids);
    for (const id of a.ids.slice(1)) {
      expect(id.endsWith("'")).toBe(true);
      expect(Number(id.slice(1, 3))).toBeGreaterThanOrEqual(25);
    }
    expect(progressCount(a.bm, 48)).toBe(48);
  });

  it('levelForSlot mirrors when asked', () => {
    const l = levelForSlot(ALL_LEVELS, { id: 'L01', mirrored: true, kind: 'warmup' });
    expect(l.grid).toEqual(['.....', '...LL', 'RB.LL', '....A']);
    expect(l.start.exit).toBe('W');
  });

  it('the parent log keeps the last 5 sessions', () => {
    let bm = EMPTY_BOOKMARK;
    for (let d = 1; d <= 7; d++) bm = playSession(bm, `d${d}`, [OK, OK, OK, OK]).bm;
    expect(bm.log).toHaveLength(5);
  });
});

describe('17. progression rules', () => {
  it('step-down: a new level ended helped → the next new slot plays the next main level’s sibling, mirrored; the bookmark stays', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: idx('L25'), sessions: 9, solvedSelf: ['L01'] };
    let run = startSession(ALL_LEVELS, bm, 'd');
    let b = bm;
    ({ bm: b, run } = finishLevel(ALL_LEVELS, b, run, OK)); // warm-up
    expect(run.current).toMatchObject({ id: 'L25', kind: 'new' });
    ({ bm: b, run } = finishLevel(ALL_LEVELS, b, run, HELPED));
    expect(b.stepDown).toBe(true);
    expect(run.current).toMatchObject({ id: 'L26s', kind: 'sibling', mirrored: true });
    expect(levelForSlot(ALL_LEVELS, run.current).siblingOf).toBe('L26');
    const nextBefore = b.next;
    // A sibling never triggers another sibling, even when helped, and is not requeued.
    ({ bm: b, run } = finishLevel(ALL_LEVELS, b, run, HELPED));
    expect(b.next).toBe(nextBefore);
    expect(b.stepDown).toBe(false);
    expect(b.requeue.map((r) => r.id)).toEqual(['L25']);
    expect(b.helped).not.toContain('L26s');
    expect(run.current).toMatchObject({ id: 'L26', kind: 'new', mirrored: false });
  });

  it('step-down carries over to the next session, and is skipped when the next level has no sibling', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: idx('L27'), sessions: 9, solvedSelf: ['L01'] };
    const s = playSession(bm, 'd', [OK, OK, OK, HELPED]); // L27 L28 L29(helped)
    expect(s.ids.slice(1)).toEqual(['L27', 'L28', 'L29']);
    expect(s.bm.stepDown).toBe(true);
    // L30 is a repair level: no sibling, so it is played directly.
    const t = playSession(s.bm, 'e');
    expect(t.ids[1]).toBe('L30');
    expect(t.bm.stepDown).toBe(false);
  });

  it('warm-up: a mirrored self-solved level from ≥ 2 chapters back, picked by date', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: idx('L25'), sessions: 9, solvedSelf: LEVELS.slice(0, 24).map((l) => l.id) }; // chapter 5
    const picks = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const w = warmupSlot(ALL_LEVELS, bm, `2026-10-${d}`)!;
      expect(w).toMatchObject({ kind: 'warmup', mirrored: true });
      expect(chapterOf(w.id)).toBeLessThanOrEqual(3);
      expect(warmupSlot(ALL_LEVELS, bm, `2026-10-${d}`)).toEqual(w);
      picks.add(w.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('warm-up fallback: none that old → the self-solved level with the lowest planDepth (ties: lowest minLen)', () => {
    // Chapter 2 bookmark: nothing from 2 chapters back. L01 (plan 2, len 5) beats L02 (3, 7) and L03 (2, 6).
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: idx('L08'), sessions: 3, solvedSelf: ['L02', 'L03', 'L01'] };
    for (const day of ['a', 'b', 'c']) expect(warmupSlot(ALL_LEVELS, bm, day)).toEqual({ id: 'L01', mirrored: true, kind: 'warmup' });
    expect(warmupSlot(ALL_LEVELS, { ...bm, solvedSelf: ['L02', 'L03'] }, 'a')?.id).toBe('L03');
    expect(warmupSlot(ALL_LEVELS, { ...bm, solvedSelf: [] }, 'a')).toBeNull();
  });

  it('"Ustaw jako następny" changes only next and recent', () => {
    const bm: Bookmark = { ...EMPTY_BOOKMARK, next: 9, sessions: 4, recent: [true, true], solvedSelf: ['L01'], helped: ['L05'], stepDown: true };
    const b = setNextLevel(bm, 20);
    expect(b).toEqual({ ...bm, next: 20, recent: [] });
  });
});

describe('bookmark storage format and migration', () => {
  it('round-trips and survives garbage (no timestamps beyond the day key)', () => {
    const bm = playSession(EMPTY_BOOKMARK, '2026-09-24').bm;
    expect(parseBookmark(JSON.stringify(bm))).toEqual(bm);
    expect(parseBookmark(null)).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark('{oops')).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark('[1,2]')).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark('{"levelSet":3,"next":-3,"solvedSelf":[1,"L01"],"requeue":[{"id":"L02","dueSession":"x"}]}')).toMatchObject({
      next: 0,
      solvedSelf: ['L01'],
      requeue: [{ id: 'L02', dueSession: 0 }],
    });
    const keys = Object.keys(bm).sort();
    expect(keys).toEqual(['helped', 'lastEndedDay', 'levelSet', 'log', 'next', 'recent', 'requeue', 'sessions', 'solvedSelf', 'stepDown']);
    expect(JSON.stringify(bm)).not.toMatch(/\d{10,}/);
  });

  it('a v2 bookmark (no levelSet) resets to empty', () => {
    const v2 = { next: 17, solvedSelf: ['L01', 'L02'], helped: ['L06'], requeue: [], sessions: 6, lastEndedDay: '2026-09-20', recent: [true], log: [{ self: 3, helped: 1 }] };
    expect(parseBookmark(JSON.stringify(v2))).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark(JSON.stringify({ ...v2, levelSet: 2 }))).toEqual(EMPTY_BOOKMARK);
    expect(parseBookmark(JSON.stringify({ ...v2, levelSet: 3 })).next).toBe(17);
  });
});
