// The v4 difficulty curve, measured by the enumerator and enforced in CI. Rules: src/game/bands4.ts.
import { describe, expect, it } from 'vitest';
import { BANDS4, MAX_SOLUTIONS, MIN_GUESS_RATIO, globalProblems4, levelProblems4, setProblems4 } from '../src/game/bands4';
import { LEVELS_V4 } from '../src/game/levels4';
import { runProgram, solutionOf } from '../src/game/program';
import { measured4 } from './measured4';

describe('every shipped v4 level passes its chapter band and the global rules', () => {
  for (const l of LEVELS_V4) {
    it(`${l.id} (chapter ${l.chapter}, ${l.kind})`, () => {
      expect(levelProblems4(l, measured4(l))).toEqual([]);
    });
  }
});

describe('global rules', () => {
  it(`solutions ≤ ${MAX_SOLUTIONS}, guessRatio ≥ ${MIN_GUESS_RATIO}, the stored solution succeeds`, () => {
    for (const l of LEVELS_V4) {
      const m = measured4(l);
      expect(m.solutions, l.id).toBeGreaterThanOrEqual(1);
      expect(m.solutions, l.id).toBeLessThanOrEqual(MAX_SOLUTIONS);
      expect(m.guessRatio, l.id).toBeGreaterThanOrEqual(MIN_GUESS_RATIO);
      expect(runProgram(l, solutionOf(l)).success, l.id).toBe(true);
      expect(globalProblems4(l, m), l.id).toEqual([]);
    }
  });

  it('ordering within chapters, non-decreasing routeLen medians, the start not always on the left', () => {
    expect(setProblems4(LEVELS_V4, measured4)).toEqual([]);
  });

  it('every chapter of the plan shipped (no chapter without its band)', () => {
    expect([...new Set(LEVELS_V4.map((l) => l.chapter))]).toEqual(BANDS4.map((b) => b.chapter));
  });
});

describe('chapter requirements, spelled out', () => {
  const ch = (c: number) => LEVELS_V4.filter((l) => l.chapter === c);
  it('chapter 1: absolute, no Repeat, routeLen = slots, detour ≥ 2', () => {
    for (const l of ch(1)) expect([l.commands, l.repeat, measured4(l).routeLen === l.slots, measured4(l).detour >= 2], l.id).toEqual(['absolute', false, true, true]);
  });
  it('chapters 2–5: every solution needs a Repeat', () => {
    for (const c of [2, 3, 4, 5]) for (const l of ch(c)) expect(measured4(l).needsLoop, l.id).toBe(true);
  });
  it('chapter 3: every solution has 2 Repeats or a 3-token body', () => {
    for (const l of ch(3)) expect(measured4(l).loopRich, l.id).toBe(true);
  });
  it('chapter 4: ordered stations or one-way track change the solution set', () => {
    for (const l of ch(4)) expect(measured4(l).stationsMatter || measured4(l).arrowsMatter, l.id).toBe(true);
  });
  it('chapter 5: relative commands', () => {
    for (const l of ch(5)) expect(l.commands, l.id).toBe('relative');
  });
  it('chapter 6: every solution nests a Repeat in a Repeat', () => {
    for (const l of ch(6)) expect(measured4(l).nestDepth, l.id).toBe(2);
  });
  it('chapter 7: a P row, and every solution runs P at least twice', () => {
    for (const l of ch(7)) expect([l.fslots >= 2, measured4(l).needsFunction], l.id).toEqual([true, true]);
  });
  it('chapter 8: four debug levels with 1–3 bugs, then the finale', () => {
    const c8 = ch(8);
    expect(c8.map((l) => l.kind)).toEqual(['debug', 'debug', 'debug', 'debug', 'finale']);
    for (const l of c8.slice(0, 4)) {
      const b = measured4(l).bugs!;
      expect(b >= 1 && b <= 3, l.id).toBe(true);
    }
    const f = c8[4];
    expect(f.commands).toBe('relative');
    expect(f.nesting || f.fslots > 0).toBe(true);
    expect((f.stations ?? []).length).toBeGreaterThanOrEqual(2);
    expect((f.stations ?? []).every((s) => s.order !== undefined)).toBe(true);
  });
});
