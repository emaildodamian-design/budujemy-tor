import { describe, expect, it } from 'vitest';
import type { Level } from '../src/game/level';
import {
  faultTypes,
  faultsOf,
  freeLenOf,
  luresOf,
  mechanicsOf,
  metricsOf,
  minLenOf,
  naiveLenOf,
  planDepthOf,
  shortestSolution,
  solutionsOf,
} from '../src/game/metrics';
import v2 from './fixtures/v2_levels.json';
import { GIVEN } from './given';
import { P } from './helpers';

const V2 = v2 as Level[];
const cols = ['minLen', 'solutions', 'naiveLen', 'detour', 'freeLen', 'countSlack', 'planDepth', 'distractors'] as const;
const row = (l: Level) => {
  const m = metricsOf(l);
  return cols.map((k) => m[k]);
};

describe('fixtures from the brief (never edited without a PR note)', () => {
  it.each([
    ['L01', [5, 1, 3, 2, 5, 0, 2, 0]],
    ['L02', [7, 1, 5, 2, 7, 0, 3, 0]],
    ['L03', [6, 1, 2, 4, 4, 2, 2, 0]],
    ['L04', [5, 1, 3, 2, 5, 0, 2, 0]],
  ])('v3 %s', (id, want) => {
    expect(row(GIVEN.find((l) => l.id === id)!)).toEqual(want);
  });

  it.each([
    ['L01', [1, 1, 1, 0, 1, 0, 1, 0]],
    ['L20', [6, 1, 3, 3, 6, 0, 3, 0]],
    ['L35', [8, 2, 6, 2, 8, 0, 7, 2]],
    ['L40', [11, 1, 8, 3, 11, 0, 1, 2]],
  ])('v2 %s', (id, want) => {
    expect(row(V2.find((l) => l.id === id)!)).toEqual(want);
  });

  it('across all 40 v2 levels: planDepth counts {1: 33, 2: 1, 3: 4, 4: 1, 7: 1}, detour 0 on exactly 33', () => {
    const counts: Record<number, number> = {};
    let flat = 0;
    for (const l of V2) {
      const m = metricsOf(l);
      counts[m.planDepth] = (counts[m.planDepth] ?? 0) + 1;
      if (m.detour === 0) flat++;
    }
    expect(counts).toEqual({ 1: 33, 2: 1, 3: 4, 4: 1, 7: 1 });
    expect(flat).toBe(33);
  });

  it('each given level has a unique solution and a solvable mirror', () => {
    for (const l of GIVEN) expect(solutionsOf(l)).toBe(1);
  });
});

/** A tiny hand-made board. */
const lv = (grid: string[], extra: Partial<Level> = {}): Level => ({
  id: 'L99',
  chapter: 1,
  kind: 'practice',
  grid,
  start: { exit: 'E' },
  depot: { entry: 'W' },
  tray: [{ piece: 'straight', count: 3 }],
  rotate: 'free',
  placement: 'free',
  solution: [],
  ...extra,
});

describe('each metric on tiny boards', () => {
  it('minLen, solutions and distractors', () => {
    const l = lv(['A..B'], { tray: [{ piece: 'straight', count: 2 }, { piece: 'curve', count: 1 }] });
    expect(minLenOf(l)).toBe(2);
    expect(solutionsOf(l)).toBe(1);
    expect(metricsOf(l).distractors).toBe(1);
    const open = lv(['....', 'A..B', '....'], { tray: [{ piece: 'straight', count: 4 }, { piece: 'curve', count: 4 }] });
    expect(solutionsOf(open)).toBeGreaterThan(1);
    expect(minLenOf(lv(['A..B'], { tray: [{ piece: 'curve', count: 2 }] }))).toBe(Infinity);
  });

  it('naiveLen: 0-1 BFS, fixed/station cells free, river/mountain only with the right piece', () => {
    expect(naiveLenOf(lv(['A..B']))).toBe(2);
    expect(naiveLenOf(lv(['A.S.B'], { stations: [{ at: [2, 0], openings: 'EW' }] }))).toBe(2);
    expect(naiveLenOf(lv(['A.~.B']))).toBe(Infinity);
    expect(naiveLenOf(lv(['A.~.B'], { tray: [{ piece: 'straight', count: 2 }, { piece: 'bridge', count: 1 }] }))).toBe(3);
    // Ignores the depot side: the door faces away, naiveLen does not care.
    const away = lv(['A..B', '....'], { depot: { entry: 'S' }, tray: [{ piece: 'straight', count: 4 }, { piece: 'curve', count: 4 }] });
    expect(naiveLenOf(away)).toBe(2);
    expect(metricsOf(away).detour).toBe(minLenOf(away) - 2);
  });

  it('freeLen and countSlack: only curves in the tray', () => {
    const l = GIVEN[2]; // L03: 6 curves where 4 pieces would do with straights
    expect(freeLenOf(l)).toBe(4);
    expect(metricsOf(l).countSlack).toBe(2);
  });

  it('planDepth: the greedy player', () => {
    expect(planDepthOf(V2[0])).toBe(1); // a straight line
    expect(planDepthOf(GIVEN[1])).toBe(3);
    // No route at all: 9.
    expect(planDepthOf(lv(['ARB']))).toBe(9);
  });

  it('lures: unused bridges / tunnels, only where a river / mountain exists', () => {
    const withRiver = lv(['A..B', '~~~~'], { tray: [{ piece: 'straight', count: 2 }, { piece: 'bridge', count: 1 }] });
    expect(luresOf(withRiver, shortestSolution(withRiver))).toBe(1);
    const noRiver = lv(['A..B', '....'], { tray: [{ piece: 'straight', count: 2 }, { piece: 'bridge', count: 1 }] });
    expect(luresOf(noRiver, shortestSolution(noRiver))).toBe(0);
    const used = lv(['A~B'], { tray: [{ piece: 'bridge', count: 1 }, { piece: 'tunnel', count: 1 }] });
    expect(metricsOf(used).lures).toBe(0);
  });

  it('faults: repair levels, against the closest solution', () => {
    const l = lv(['A...B'], { kind: 'repair', tray: [], preplaced: [P(1, 0, 'straight', 'NS'), P(2, 0, 'curve', 'ES'), P(3, 0, 'straight', 'EW')] });
    // Measured on the empty board with the pre-laid pieces in hand: 2 straights + 1 curve cannot fill 3 cells in a row.
    const fix = { ...l, preplaced: [...l.preplaced!, P(0, 1, 'straight', 'EW')], grid: ['A...B', '.....'] };
    expect(faultsOf(fix)).toBe(3);
    expect(faultTypes(fix).sort()).toEqual(['kind', 'offRoute', 'orientation']);
    expect(faultsOf(lv(['A..B']))).toBe(0);
  });

  it('arrowMatters: removing a blocking arrow opens a route', () => {
    const blocked = lv(['A.B'], { tray: [], fixed: [{ at: [1, 0], piece: 'straight', openings: 'EW', oneWay: 'W' }] });
    expect(metricsOf(blocked)).toMatchObject({ solutions: 0, arrowMatters: true });
    const along = lv(['A.B'], { tray: [], fixed: [{ at: [1, 0], piece: 'straight', openings: 'EW', oneWay: 'E' }] });
    expect(metricsOf(along)).toMatchObject({ solutions: 1, arrowMatters: false });
    expect(mechanicsOf(along)).toEqual(['arrow']);
  });

  it('orderMatters: a counter-intuitive order changes the route', () => {
    const grid = ['.....', 'AS.SB', '.....'];
    const stations = (a?: 1 | 2, b?: 1 | 2) => [
      { at: [1, 1] as [number, number], openings: 'EW' as const, order: a },
      { at: [3, 1] as [number, number], openings: 'EW' as const, order: b },
    ];
    const tray = [{ piece: 'straight' as const, count: 5 }, { piece: 'curve' as const, count: 6 }];
    const natural = lv(grid, { stations: stations(1, 2), tray });
    expect(metricsOf(natural).orderMatters).toBe(false);
    const reversed = lv(grid, { stations: stations(2, 1), tray });
    expect(metricsOf(reversed)).toMatchObject({ solutions: 0, orderMatters: true });
    expect(mechanicsOf(natural)).toEqual(['station', 'order']);
  });
});
