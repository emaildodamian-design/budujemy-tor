// The difficulty curve, measured by the solver and enforced in CI. Rules: src/game/bands.ts.
import { describe, expect, it } from 'vitest';
import { ARROW_ORDER_FALLBACK, BANDS, bandOf, globalProblems, levelProblems, median } from '../src/game/bands';
import { kindOf } from '../src/game/level';
import { LEVELS, SIBLINGS } from '../src/game/levels';
import { solverStats } from '../src/game/solver';
import { GIVEN } from './given';
import { measured } from './measured';

const key = (id: string) => {
  const { m } = measured(LEVELS.find((l) => l.id === id)!);
  return [m.planDepth, m.minLen] as const;
};
const practice = (chapter: number) => LEVELS.filter((l) => l.chapter === chapter && kindOf(l) === 'practice');

describe('every main level and sibling passes its chapter band and the global rules', () => {
  for (const l of LEVELS) {
    it(`${l.id} (${kindOf(l)})`, () => {
      expect(levelProblems(measured(l))).toEqual([]);
    });
  }
  for (const s of SIBLINGS) {
    it(`${s.id} (sibling of ${s.siblingOf})`, () => {
      const main = measured(LEVELS.find((l) => l.id === s.siblingOf)!);
      expect(levelProblems(measured(s), main.m)).toEqual([]);
    });
  }
});

describe('global rules', () => {
  it('minLen ≥ 5, countSlack ≤ 2, solvable, ≤ 30% blocked, every lake / mountain / river region ≥ 2 cells', () => {
    for (const l of [...LEVELS, ...SIBLINGS]) expect(globalProblems(l, measured(l).m), l.id).toEqual([]);
  });

  it('L01–L04 as given: 0 distractors, 1 solution', () => {
    for (const l of GIVEN) expect(measured(l)).toMatchObject({ m: { distractors: 0, solutions: 1 } });
  });
});

describe('intro, repair and finale rules', () => {
  it('intro levels: smallest board, minLen near the band floor, no distractors, ≤ 2 solutions, planDepth ≥ 2, element on the route', () => {
    const intros = LEVELS.filter((l) => kindOf(l) === 'intro');
    expect(intros).toHaveLength(6);
    for (const l of intros) {
      const { m } = measured(l);
      const b = bandOf(l.chapter);
      expect(l.grid[0].length, l.id).toBeLessThanOrEqual(b.cols[0]);
      expect(l.grid.length, l.id).toBeLessThanOrEqual(b.rows[0]);
      expect(Math.abs(m.minLen - b.minLen[0]), l.id).toBeLessThanOrEqual(2);
      expect(m.distractors, l.id).toBe(0);
      expect(m.solutions, l.id).toBeLessThanOrEqual(2);
      expect(m.planDepth, l.id).toBeGreaterThanOrEqual(2);
    }
    const on = (id: string) => measured(LEVELS.find((l) => l.id === id)!).mech;
    expect(on('L07')).toContain('bridge');
    expect(on('L13')).toContain('tunnel');
    expect(on('L19')).toContain('station');
    if (!ARROW_ORDER_FALLBACK) {
      expect(on('L31')).toContain('arrow');
      expect(on('L37')).toContain('order');
    }
  });

  it('repair levels: the first run fails, 2–3 faults of ≥ 2 types (chapter 2: 1–2 of any type)', () => {
    for (const l of LEVELS.filter((x) => kindOf(x) === 'repair')) {
      const x = measured(l);
      expect(x.initialFails, l.id).toBe(true);
      if (l.chapter === 2) expect(x.m.faults, l.id).toBeGreaterThanOrEqual(1);
      if (l.chapter === 2) expect(x.m.faults, l.id).toBeLessThanOrEqual(2);
      else {
        expect(x.m.faults, l.id).toBeGreaterThanOrEqual(2);
        expect(x.m.faults, l.id).toBeLessThanOrEqual(3);
        expect(new Set(x.faultTypes).size, l.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('the finale L48 has ≤ 2 solutions (target: exactly 1)', () => {
    const { m } = measured(LEVELS[47]);
    expect(kindOf(LEVELS[47])).toBe('finale');
    expect(m.solutions).toBeLessThanOrEqual(2);
  });
});

describe('ordering', () => {
  it('within a chapter, practice levels are non-decreasing by (planDepth, minLen) (L03 as given is exempt)', () => {
    for (const b of BANDS) {
      const ids = practice(b.chapter)
        .map((l) => l.id)
        .filter((id) => id !== 'L03');
      for (let i = 1; i < ids.length; i++) {
        const [p0, n0] = key(ids[i - 1]);
        const [p1, n1] = key(ids[i]);
        expect(p1 > p0 || (p1 === p0 && n1 >= n0), `${ids[i - 1]} → ${ids[i]}`).toBe(true);
      }
    }
  });

  it('across chapters, the medians of planDepth and minLen of practice levels are non-decreasing', () => {
    const med = BANDS.map((b) => {
      const ms = practice(b.chapter).map((l) => measured(l).m);
      return [median(ms.map((m) => m.planDepth)), median(ms.map((m) => m.minLen))];
    });
    for (let i = 1; i < med.length; i++) {
      expect(med[i][0], `planDepth median ch${i} → ch${i + 1}`).toBeGreaterThanOrEqual(med[i - 1][0]);
      expect(med[i][1], `minLen median ch${i} → ch${i + 1}`).toBeGreaterThanOrEqual(med[i - 1][1]);
    }
  });
});

describe('siblings', () => {
  it('a sibling is easier than its main level and keeps its chapter mechanic', () => {
    for (const s of SIBLINGS) {
      const main = measured(LEVELS.find((l) => l.id === s.siblingOf)!).m;
      const { m } = measured(s);
      expect(m.planDepth, s.id).toBeLessThanOrEqual(Math.max(2, main.planDepth - 2));
      expect(m.distractors, s.id).toBeLessThanOrEqual(Math.max(0, main.distractors - 2));
      expect(m.minLen, s.id).toBeLessThanOrEqual(Math.max(5, main.minLen - 2));
      expect(m.detour, s.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('chapters 6 and 7: the new mechanics matter', () => {
  it.skipIf(ARROW_ORDER_FALLBACK)('every chapter 6 level (and sibling) passes arrowMatters', () => {
    for (const l of [...LEVELS, ...SIBLINGS].filter((x) => x.chapter === 6)) expect(measured(l).m.arrowMatters, l.id).toBe(true);
  });
  it.skipIf(ARROW_ORDER_FALLBACK)('every chapter 7 level (and sibling) passes orderMatters', () => {
    for (const l of [...LEVELS, ...SIBLINGS].filter((x) => x.chapter === 7)) expect(measured(l).m.orderMatters, l.id).toBe(true);
  });
});

describe('measurement integrity', () => {
  it('no metric came from a search that hit its node limit', () => {
    for (const l of [...LEVELS, ...SIBLINGS]) measured(l);
    expect(solverStats.truncated).toBe(0);
  });
});
