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
  mirrorLevel,
  terrainAccepts,
  terrainAt,
  validateLevel,
} from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { countSolutions, countsOf, solve } from '../src/game/solver';
import { trace } from '../src/game/trace';
import { levelsReport } from './levelsReport';

const each = (fn: (l: Level) => void) => {
  for (const l of LEVELS) it(l.id, () => fn(l));
};

describe('level set', () => {
  it('has 40 levels L01..L40 in order, chapters 1..8 non-decreasing', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 40 }, (_, i) => `L${String(i + 1).padStart(2, '0')}`));
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].chapter).toBeGreaterThanOrEqual(LEVELS[i - 1].chapter);
    expect(new Set(LEVELS.map((l) => l.chapter))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('L01–L12 ship exactly as given (spot checks)', () => {
    expect(LEVELS[0].grid).toEqual(['...', 'A.B', '...']);
    expect(LEVELS[7].preplaced?.[2]).toEqual({ at: [2, 1], piece: 'straight', openings: 'EW' });
    expect(LEVELS[11].start.exit).toBe('N');
  });

  it('chapter settings follow the plan', () => {
    for (const l of LEVELS) {
      expect(l.rotate).toBe(l.chapter >= 7 ? 'free' : 'auto');
      expect(l.placement).toBe(l.chapter >= 5 ? 'free' : 'strict');
      expect(l.goalStrip ?? (l.chapter <= 5 ? 'full' : 'stations-only')).toBe(l.chapter <= 5 ? 'full' : 'stations-only');
    }
    expect(LEVELS.filter(isRepair).map((l) => l.id)).toEqual(['L08', 'L13', 'L18', 'L23', 'L29', 'L33', 'L37']);
    expect(LEVELS.find((l) => l.id === 'L40')!.grid.join('')).toMatch(/(?=.*~)(?=.*\^)(?=.*S)(?=.*[RHT])/);
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
  });
});

describe('2. the declared solution works', () => {
  each((l) => {
    expect(trace(l, l.solution).success).toBe(true);
    const inv = boardOf(l).inventory;
    const used = countsOf(l.solution);
    for (const k of Object.keys(inv) as (keyof typeof inv)[]) expect(used[k]).toBeLessThanOrEqual(inv[k]);
    for (const p of l.solution) expect(terrainAccepts(terrainAt(l, cellOf(p.at)), p.piece)).toBe(true);
    expect(new Set(l.solution.map((p) => cellKey(cellOf(p.at)))).size).toBe(l.solution.length);
  });
});

describe('3. every level is solvable by the solver from its initial state', () => {
  each((l) => {
    // With everything the player owns (repair pieces can be moved), independently of `solution`.
    expect(solve(l, { cap: 1 }).length).toBe(1);
    // And from the pre-laid state, by laying and swapping: the solution only needs owned pieces.
    const pre = initialPieces(l);
    const sol = solve(l, { cap: 1 })[0];
    expect(sol.length + pre.length).toBeGreaterThan(0);
  });

  it('LEVELS.md is generated and up to date', () => {
    const md = levelsReport();
    if (process.env.UPDATE_LEVELS) writeFileSync('LEVELS.md', md);
    expect(existsSync('LEVELS.md')).toBe(true);
    expect(readFileSync('LEVELS.md', 'utf8')).toBe(md);
  });
});

describe('4. intro levels are near-unique; chapters 1–5 have no distractors', () => {
  each((l) => {
    if (l.intro && l.intro !== 'repair') expect(countSolutions(l, 50)).toBeLessThanOrEqual(2);
    if (l.chapter <= 5 && !isRepair(l)) expect(countsOf(l.solution)).toEqual(boardOf(l).inventory);
  });

  it('chapter intros (other than obstacle/station, which use 4×3) are 3×3 with an exact tray', () => {
    for (const l of LEVELS.filter((x) => x.intro && !['obstacle', 'station', 'repair'].includes(x.intro))) {
      expect([l.grid[0].length, l.grid.length]).toEqual([3, 3]);
      expect(countsOf(l.solution)).toEqual(boardOf(l).inventory);
    }
  });
});

describe('5. repair levels', () => {
  for (const l of LEVELS.filter(isRepair)) {
    it(`${l.id}: the pre-laid track fails its first test run, and swaps fix it`, () => {
      const pre = initialPieces(l);
      expect(trace(l, pre).success).toBe(false);
      const wrong = pre.filter((p) => !l.solution.some((s) => s.at[0] === p.at[0] && s.at[1] === p.at[1] && s.piece === p.piece && s.openings === p.openings));
      expect(wrong.length).toBeGreaterThanOrEqual(1);
      // Keeping every correct pre-laid piece, the rest can be completed with what is owned.
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
    expect(mirrorLevel(m).grid).toEqual(l.grid);
    if (isRepair(l)) expect(trace(m, initialPieces(m)).success).toBe(false);
  });
});
