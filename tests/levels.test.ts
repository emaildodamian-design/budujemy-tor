import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellKey, inBounds, step } from '../src/game/grid';
import {
  type Level,
  MAX_COLS,
  MAX_ROWS,
  TERRAIN_CHARS,
  boardOf,
  cellOf,
  initialPieces,
  isRepair,
  kindOf,
  mirrorLevel,
  terrainAccepts,
  terrainAt,
  validateLevel,
} from '../src/game/level';
import { ALL_LEVELS, LEVELS, SIBLINGS } from '../src/game/levels';
import { minLenOf } from '../src/game/metrics';
import { countSolutions, countsOf, solve, solverStats } from '../src/game/solver';
import { trace } from '../src/game/trace';
import { GIVEN } from './given';
import { levelStats, levelsReport } from './levelsReport';

const each = (fn: (l: Level) => void, levels: readonly Level[] = ALL_LEVELS) => {
  for (const l of levels) it(l.id, () => fn(l));
};

describe('level set', () => {
  it('has 48 main levels L01..L48 in order, 6 per chapter', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 48 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`));
    LEVELS.forEach((l, i) => expect(l.chapter).toBe(Math.floor(i / 6) + 1));
  });

  it('L01–L04 ship exactly as given', () => {
    expect(LEVELS.slice(0, 4)).toEqual(GIVEN);
  });

  it('kinds, rotation and placement follow the plan', () => {
    const kind = (id: string) => kindOf(ALL_LEVELS.find((l) => l.id === id)!);
    expect(LEVELS.filter((l) => kindOf(l) === 'intro').map((l) => `${l.id}:${l.intro}`)).toEqual(['L04:rotation', 'L07:bridge', 'L13:tunnel', 'L19:station', 'L31:oneWay', 'L37:order']);
    expect(LEVELS.filter(isRepair).map((l) => l.id)).toEqual(['L12', 'L18', 'L24', 'L30', 'L36', 'L42']);
    expect(LEVELS.filter((l) => kindOf(l) === 'repair').map((l) => l.id)).toEqual(['L12', 'L18', 'L24', 'L30', 'L36', 'L42']);
    expect(kind('L48')).toBe('finale');
    for (const l of ALL_LEVELS) {
      const n = Number(l.id.slice(1, 3));
      expect(l.rotate, l.id).toBe(n <= 3 ? 'auto' : 'free');
      expect(l.placement, l.id).toBe(l.chapter === 1 || kindOf(l) === 'intro' ? 'strict' : 'free');
      expect(l.goalStrip, l.id).toBeUndefined();
    }
  });

  it('siblings: one per practice level and the finale of chapters 2–8, same chapter, never in the main sequence', () => {
    const want = LEVELS.filter((l) => l.chapter >= 2 && (kindOf(l) === 'practice' || kindOf(l) === 'finale')).map((l) => `${l.id}s`);
    expect(SIBLINGS.map((l) => l.id).sort()).toEqual(want.sort());
    for (const s of SIBLINGS) {
      const main = LEVELS.find((l) => l.id === s.siblingOf)!;
      expect(s.chapter).toBe(main.chapter);
      expect(kindOf(s)).toBe('sibling');
    }
  });
});

describe('1. schema', () => {
  each((l) => {
    expect(validateLevel(l)).toEqual([]);
    const rows = l.grid.length;
    const cols = l.grid[0].length;
    expect(l.grid.every((r) => r.length === cols)).toBe(true);
    expect(cols).toBeLessThanOrEqual(MAX_COLS);
    expect(rows).toBeLessThanOrEqual(MAX_ROWS);
    const chars = l.grid.join('');
    expect([...chars].every((c) => c in TERRAIN_CHARS)).toBe(true);
    expect(chars.split('A').length - 1).toBe(1);
    expect(chars.split('B').length - 1).toBe(1);
    const b = boardOf(l);
    expect(inBounds(step(b.start, b.startExit), b)).toBe(true);
    expect(inBounds(step(b.depot, b.depotEntry), b)).toBe(true);
    const orders = (l.stations ?? []).map((s) => s.order);
    expect(orders.every((o) => o === undefined) || orders.every((o) => o !== undefined)).toBe(true);
  });

  it('validation catches the v3 fields', () => {
    const base = GIVEN[0];
    expect(validateLevel({ ...base, id: 'L05x' })).toContain('L05x: bad id');
    expect(validateLevel({ ...base, kind: 'sibling' }).join()).toMatch(/sibling ids end in s/);
    expect(validateLevel({ ...base, fixed: [{ at: [4, 0], piece: 'straight', openings: 'NS', oneWay: 'E' }] }).join()).toMatch(/one-way side E is not an opening/);
    const st = (order?: 1 | 2 | 3) => ({ at: [4, 0] as [number, number], openings: 'NS' as const, order });
    const withSt = { ...base, grid: ['....S', ...base.grid.slice(1)] };
    expect(validateLevel({ ...withSt, stations: [st(2)] }).join()).toMatch(/station orders/);
    expect(validateLevel({ ...withSt, stations: [st(1)] })).toEqual([]);
  });
});

describe('2. the declared solution works and is a shortest one', () => {
  each((l) => {
    expect(trace(l, l.solution).success).toBe(true);
    const inv = boardOf(l).inventory;
    const used = countsOf(l.solution);
    for (const k of Object.keys(inv) as (keyof typeof inv)[]) expect(used[k]).toBeLessThanOrEqual(inv[k]);
    for (const p of l.solution) expect(terrainAccepts(terrainAt(l, cellOf(p.at)), p.piece)).toBe(true);
    expect(new Set(l.solution.map((p) => cellKey(cellOf(p.at)))).size).toBe(l.solution.length);
    expect(l.solution.length).toBe(minLenOf(l));
  });
});

describe('3. every level is solvable by the solver from its initial state', () => {
  each((l) => {
    expect(solve(l, { cap: 1 }).length).toBe(1);
    // From the pre-laid state too (repair: keep the correct pre-laid pieces, lay the rest).
    const pre = initialPieces(l);
    const right = pre.filter((p) => l.solution.some((s) => s.at[0] === p.at[0] && s.at[1] === p.at[1] && s.piece === p.piece && s.openings === p.openings));
    expect(solve(l, { keep: right, cap: 1 }).length).toBe(1);
  });

  it('LEVELS.md and levelStats.json are generated and up to date', () => {
    const md = levelsReport();
    const stats = levelStats();
    if (process.env.UPDATE_LEVELS) {
      writeFileSync('LEVELS.md', md);
      writeFileSync('src/game/levelStats.json', stats);
    }
    expect(existsSync('LEVELS.md')).toBe(true);
    expect(readFileSync('LEVELS.md', 'utf8')).toBe(md);
    expect(readFileSync('src/game/levelStats.json', 'utf8')).toBe(stats);
  });
});

describe('5. repair levels', () => {
  for (const l of ALL_LEVELS.filter(isRepair)) {
    it(`${l.id}: the pre-laid track fails its first test run, and swaps fix it`, () => {
      const pre = initialPieces(l);
      expect(trace(l, pre).success).toBe(false);
      const wrong = pre.filter((p) => !l.solution.some((s) => s.at[0] === p.at[0] && s.at[1] === p.at[1] && s.piece === p.piece && s.openings === p.openings));
      expect(wrong.length).toBeGreaterThanOrEqual(1);
      const keep = pre.filter((p) => !wrong.includes(p));
      expect(solve(l, { keep, cap: 1 }).length).toBe(1);
    });
  }
});

describe('8. mirrored copies stay solvable', () => {
  each((l) => {
    const m = mirrorLevel(l);
    expect(validateLevel(m)).toEqual([]);
    expect(trace(m, m.solution).success).toBe(true);
    expect(solve(m, { cap: 1 }).length).toBe(1);
    expect(countSolutions(m, 50)).toBe(countSolutions(l, 50));
    expect(mirrorLevel(m)).toEqual(l);
    if (isRepair(l)) expect(trace(m, initialPieces(m)).success).toBe(false);
    for (const [a, b] of (l.fixed ?? []).map((p, i) => [p, m.fixed![i]] as const)) {
      if (a.oneWay) expect(b.oneWay).toBe(({ E: 'W', W: 'E', N: 'N', S: 'S' } as const)[a.oneWay]);
    }
  });

  it('no search hit its node limit', () => {
    expect(solverStats.truncated).toBe(0);
  });
});
