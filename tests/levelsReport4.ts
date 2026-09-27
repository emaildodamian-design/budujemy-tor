// Builds LEVELS_V4.md and src/game/levelStats4.json from levels4.json with the enumerator.
// `npm run levels4` rewrites both; tests/levels4.test.ts fails if either is out of date.
import { LEVELS_V4 } from '../src/game/levels4';
import type { ProgLevel } from '../src/game/program';
import { measured4 } from './measured4';

const board = (l: ProgLevel) => `${l.grid[0].length}×${l.grid.length}`;
const ratio = (x: number) => String(Math.floor(x));
const yn = (b: boolean) => (b ? 'yes' : '–');

export function levelsReport4(): string {
  const rows = LEVELS_V4.map((l) => {
    const m = measured4(l);
    return `| ${l.id} | ${l.chapter} | ${l.kind} | ${board(l)} | ${l.commands} | ${l.slots} | ${l.fslots} | ${m.routeLen} | ${m.solutions} | ${m.routes} | ${m.candidates} | ${ratio(m.guessRatio)} | ${yn(m.needsLoop)} | ${m.nestDepth} | ${yn(m.needsFunction)} | ${m.bugs ?? '–'} | ${m.detour} |`;
  });
  const programs = LEVELS_V4.map((l) => `| ${l.id} | \`${l.solution}\` | ${l.given ? `\`${l.given}\`` : '–'} |`);
  return [
    '# Levels (v4)',
    '',
    'Generated from `src/game/levels4.json` by `npm run levels4` (checked in CI: the test fails if this file is stale).',
    'Definitions: `src/game/progMetrics.ts` and the README. Bands: `src/game/bands4.ts`.',
    '',
    '- **commands**: absolute arrows (N E S W) or relative curves seen from the engine (L F R). **slots** / **fslots**: main row / P row length.',
    '- **routeLen**: pieces laid by the shortest-route solution. **solutions**: programs that fill the rows and succeed (cap 50). **routes**: distinct routes among them.',
    '- **candidates**: programs that fit the rows exactly in the level\'s grammar (closed form). **guessRatio** = candidates / solutions.',
    '- **needsLoop**: no solution is loop-free. **nestDepth**: least deepest Repeat nesting over solutions. **needsFunction**: every solution runs P at least twice.',
    '- **bugs**: debug levels, fewest single-token changes that fix the given program. **detour**: routeLen − v3 naiveLen.',
    '',
    '| id | chapter | kind | board | commands | slots | fslots | routeLen | solutions | routes | candidates | guessRatio | needsLoop | nestDepth | needsFunction | bugs | detour |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Stored programs',
    '',
    'Notation: moves are letters, `P` runs the P row, `4[E N]` repeats its body 4 times, and the P row follows ` ; `.',
    '',
    '| id | solution | given (debug levels) |',
    '|---|---|---|',
    ...programs,
    '',
  ].join('\n');
}

/** Compact stats for the parent preview list. */
export function levelStats4(): string {
  const out: Record<string, unknown> = {};
  for (const l of LEVELS_V4) {
    const m = measured4(l);
    out[l.id] = { board: board(l), commands: l.commands, slots: l.slots, fslots: l.fslots, routeLen: m.routeLen, solutions: m.solutions, guessRatio: Math.floor(m.guessRatio) };
  }
  return JSON.stringify(out, null, 1) + '\n';
}
