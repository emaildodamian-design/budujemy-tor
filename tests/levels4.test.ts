import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANDS4, levelId4 } from '../src/game/bands4';
import { LEVELS_V4, validateProgLevel } from '../src/game/levels4';
import { parseProgram, runProgram, solutionOf } from '../src/game/program';
import { levelStats4, levelsReport4 } from './levelsReport4';

describe('v4 level set', () => {
  it('ships P01..P40 in order, 5 per chapter', () => {
    expect(LEVELS_V4.map((l) => l.id)).toEqual(Array.from({ length: 40 }, (_, i) => levelId4(i + 1)));
    for (const b of BANDS4) expect(LEVELS_V4.filter((l) => l.chapter === b.chapter).map((l) => Number(l.id.slice(1)))).toEqual([b.levels[0], b.levels[0] + 1, b.levels[0] + 2, b.levels[0] + 3, b.levels[0] + 4]);
  });

  for (const l of LEVELS_V4) {
    it(`${l.id}: schema, and the stored solution succeeds`, () => {
      expect(validateProgLevel(l)).toEqual([]);
      expect(runProgram(l, solutionOf(l)).success).toBe(true);
      if (l.given) expect(runProgram(l, parseProgram(l.given)).success).toBe(false);
    });
  }

  it('validation catches bad levels', () => {
    const base = LEVELS_V4[0];
    expect(validateProgLevel({ ...base, id: 'L01' })).toContain('L01: bad id');
    expect(validateProgLevel({ ...base, solution: 'E N N E N E' }).join()).toMatch(/does not fill the rows/);
    expect(validateProgLevel({ ...base, solution: 'E N N E N E N' }).join()).toMatch(/solution fails/);
    expect(validateProgLevel({ ...base, solution: 'E 3[N] E N E' }).join()).toMatch(/repeat not allowed/);
    expect(validateProgLevel({ ...base, solution: 'E N N E L E S' }).join()).toMatch(/move L is not absolute/);
  });

  it('LEVELS_V4.md and levelStats4.json are generated and up to date', () => {
    const md = levelsReport4();
    const stats = levelStats4();
    if (process.env.UPDATE_LEVELS) {
      writeFileSync('LEVELS_V4.md', md);
      writeFileSync('src/game/levelStats4.json', stats);
    }
    expect(existsSync('LEVELS_V4.md')).toBe(true);
    expect(readFileSync('LEVELS_V4.md', 'utf8')).toBe(md);
    expect(readFileSync('src/game/levelStats4.json', 'utf8')).toBe(stats);
  });
});
