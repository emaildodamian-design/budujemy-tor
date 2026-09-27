// v4 metrics: the anchor fixtures (exact; never edit one without a PR note) and the closed-form
// candidate count against brute force.
import { describe, expect, it } from 'vitest';
import { type Grammar, bugsOf, candidatesOf, enumerate, metricsOf, rowCount, rowsOf, tokenCount } from '../src/game/progMetrics';
import { type ProgLevel, type Tok, COUNTS, formatProgram, parseProgram, runProgram } from '../src/game/program';
import { LEVELS_V4 } from '../src/game/levels4';

const P01: ProgLevel = {
  id: 'P01', chapter: 1, kind: 'practice',
  grid: ['.HH..', '.T..B', 'LL...', 'A....'],
  start: { exit: 'E' }, depot: { entry: 'N' },
  commands: 'absolute', repeat: false, nesting: false, slots: 7, fslots: 0, solution: 'E N N E N E S',
};
const G06 = ['...LLB', '......', 'H....R', 'HH...R', '......', 'A..R..'];
const P06: ProgLevel = {
  id: 'P06', chapter: 2, kind: 'practice', grid: G06, start: { exit: 'E' }, depot: { entry: 'S' },
  commands: 'absolute', repeat: true, nesting: false, slots: 4, fslots: 0, solution: 'N 4[E N]',
};
const P21: ProgLevel = { ...P06, id: 'P21', chapter: 5, commands: 'relative', solution: 'L 4[R L]' };

const sols = (l: ProgLevel) => enumerate(l).solutions.map((s) => formatProgram(s.program)).sort();

describe('anchor fixtures (exact)', () => {
  it('P01: candidates 16,384; solutions 3; routes 3; routeLen 7', () => {
    const m = metricsOf(P01);
    expect([m.candidates, m.solutions, m.routes, m.routeLen]).toEqual([16384, 3, 3, 7]);
    expect(sols(P01)).toEqual(['E E N N N E S', 'E N E N N E S', 'E N N E N E S'].sort());
  });
  it('P06: candidates 2,048; solutions 2; routes 1; routeLen 9; needsLoop', () => {
    const m = metricsOf(P06);
    expect([m.candidates, m.solutions, m.routes, m.routeLen, m.needsLoop]).toEqual([2048, 2, 1, 9, true]);
    expect(sols(P06)).toEqual(['4[N E] N', 'N 4[E N]']);
  });
  it('P21: candidates 873; solutions 2; routes 1; routeLen 9', () => {
    const m = metricsOf(P21);
    expect([m.candidates, m.solutions, m.routes, m.routeLen]).toEqual([873, 2, 1, 9]);
    expect(sols(P21)).toEqual(['4[L R] L', 'L 4[R L]']);
  });
  it('the shipped P01, P06 and P21 are exactly the anchors', () => {
    const byId = (id: string) => LEVELS_V4.find((l) => l.id === id);
    expect(byId('P01')).toEqual(P01);
    expect(byId('P06')).toEqual(P06);
    expect(byId('P21')).toEqual(P21);
  });
});

/** Brute force, written independently of progMetrics: every token tree as written. */
function bruteRows(g: Grammar, s: number): string[] {
  const moves = 'NESW'.slice(0, g.moves).split('');
  const leaf = [...moves, ...(g.call ? ['P'] : [])];
  // All tokens of exactly cost c at depth d.
  const tokens = (c: number, d: number): string[] => {
    if (c === 1) return leaf;
    if (!g.repeat || (d > 0 && !g.nesting) || d >= 2) return [];
    const out: string[] = [];
    for (const body of seqs(c - 1, d + 1, 3)) if (body.length >= 1) for (const n of COUNTS) out.push(`${n}[${body.join(' ')}]`);
    return out;
  };
  // Sequences of at most `max` tokens (Infinity for a row) with total cost k.
  const seqs = (k: number, d: number, max: number): string[][] => {
    if (k === 0) return [[]];
    if (max === 0) return [];
    const out: string[][] = [];
    for (let c = 1; c <= k; c++) for (const t of tokens(c, d)) for (const rest of seqs(k - c, d, max - 1)) out.push([t, ...rest]);
    return out;
  };
  return seqs(s, 0, Infinity).map((r) => r.join(' '));
}

describe('candidates: closed form = brute force (slots 1–4)', () => {
  const grammars: [string, Grammar][] = [
    ['absolute', { moves: 4, repeat: false, nesting: false, call: false }],
    ['absolute + Repeat', { moves: 4, repeat: true, nesting: false, call: false }],
    ['relative + Repeat', { moves: 3, repeat: true, nesting: false, call: false }],
    ['relative + nested Repeat', { moves: 3, repeat: true, nesting: true, call: false }],
    ['absolute + nested Repeat', { moves: 4, repeat: true, nesting: true, call: false }],
    ['relative + Repeat + Call', { moves: 3, repeat: true, nesting: false, call: true }],
    ['relative + nested + Call', { moves: 3, repeat: true, nesting: true, call: true }],
  ];
  for (const [name, g] of grammars) {
    it(name, () => {
      for (let s = 1; s <= 4; s++) {
        const brute = bruteRows(g, s);
        expect(new Set(brute).size, `${name} s=${s} distinct`).toBe(brute.length);
        expect(rowCount(g, s), `${name} s=${s}`).toBe(brute.length);
        // The enumerator's materialised rows are the same set.
        const fam = g.moves === 4 ? ['N', 'E', 'S', 'W'] : ['N', 'E', 'S'];
        const mine = rowsOf(g, fam, s).map((r: Tok[]) => formatProgram({ main: r, p: [] }));
        expect(mine.sort()).toEqual([...brute].sort());
      }
    });
  }

  it('a level with a P row multiplies both rows', () => {
    const l = LEVELS_V4.find((x) => x.fslots > 0)!;
    const gm: Grammar = { moves: 3, repeat: l.repeat, nesting: l.nesting, call: true };
    const gp: Grammar = { ...gm, call: false };
    expect(candidatesOf(l)).toBe(rowCount(gm, l.slots) * rowCount(gp, l.fslots));
  });

  it('token counts for the anchors', () => {
    expect([1, 2, 3, 4].map((c) => tokenCount({ moves: 4, repeat: true, nesting: false, call: false }, c))).toEqual([4, 16, 64, 256]);
    expect([1, 2, 3, 4].map((c) => tokenCount({ moves: 3, repeat: true, nesting: false, call: false }, c))).toEqual([3, 12, 36, 108]);
  });
});

describe('enumerator', () => {
  it('every solution it finds succeeds on the real ride, and the stored solution is among them', () => {
    for (const l of LEVELS_V4) {
      const found = enumerate(l).solutions;
      for (const s of found) expect(runProgram(l, s.program).success, `${l.id} ${formatProgram(s.program)}`).toBe(true);
      expect(found.map((s) => formatProgram(s.program)), l.id).toContain(l.solution);
    }
  });

  it('caps at 50 solutions', () => {
    const open: ProgLevel = { ...P01, id: 'P98', grid: ['......', '......', '......', '......', 'A....B'], depot: { entry: 'W' }, slots: 10, solution: '' };
    const e = enumerate(open);
    expect(e.solutions.length).toBe(50);
    expect(e.capped).toBe(true);
  });

  it('bugs: fewest single-token changes that fix a program', () => {
    expect(bugsOf(P06, parseProgram('N 4[E N]'))).toBe(0);
    expect(bugsOf(P06, parseProgram('N 4[E E]'))).toBe(1);
    expect(bugsOf(P06, parseProgram('N 3[E E]'))).toBe(2);
    expect(bugsOf(P06, parseProgram('S 3[W W]'))).toBe(4); // more than 3
  });
});
