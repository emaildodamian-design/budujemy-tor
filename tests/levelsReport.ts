// Builds LEVELS.md and src/game/levelStats.json from levels.json with the solver.
// `npm run levels` rewrites both; tests/levels.test.ts fails if either is out of date.
import type { Level } from '../src/game/level';
import { boardOf, kindOf } from '../src/game/level';
import { ALL_LEVELS } from '../src/game/levels';
import { measured } from './measured';

const inventory = (l: Level) => {
  const inv = boardOf(l).inventory;
  const parts = (['straight', 'curve', 'bridge', 'tunnel'] as const).filter((k) => inv[k] > 0).map((k) => `${inv[k]}${k[0]}`);
  const pre = l.preplaced?.length ? ` (${l.preplaced.length} pre-laid)` : '';
  return parts.join(' ') + pre;
};
const board = (l: Level) => `${l.grid[0].length}×${l.grid.length}`;
const kindCell = (l: Level) => {
  const k = kindOf(l);
  if (k === 'intro') return `intro: ${l.intro}`;
  if (k === 'sibling') return `sibling of ${l.siblingOf}`;
  return k;
};

export function levelsReport(): string {
  const rows = ALL_LEVELS.map((l) => {
    const { m, mech } = measured(l);
    const sol = `${m.solutions}${m.solutions >= 50 ? '+' : ''}`;
    return `| ${l.id} | ${kindCell(l)} | ${l.chapter} | ${board(l)} | ${inventory(l)} | ${m.minLen} | ${m.distractors} | ${sol} | ${m.naiveLen} | ${m.detour} | ${m.countSlack} | ${m.planDepth} | ${m.lures} | ${m.faults} | ${mech.join(', ') || '–'} |`;
  });
  return [
    '# Levels',
    '',
    'Generated from `src/game/levels.json` by `npm run levels` (checked in CI: the test fails if this file is stale).',
    'The 48 main levels come first, then the step-down siblings. Definitions: `src/game/metrics.ts` and the README.',
    '',
    '- **inventory**: tray + pre-laid pieces (s = straight, c = curve, b = bridge, t = tunnel).',
    '- **minLen**: pieces in the shortest solution. **distractors**: inventory − minLen. **solutions**: distinct solutions (cap 50).',
    '- **naiveLen**: fewest pieces from the cell in front of the start to any cell next to the depot, ignoring counts, turns, the depot side, arrows and stations. **detour** = minLen − naiveLen.',
    '- **countSlack** = minLen − freeLen (freeLen: minLen with unlimited straights and curves).',
    '- **planDepth**: the smallest look-ahead (1–8, 9 = none) with which a greedy player who never takes a piece back reaches the depot.',
    '- **lures**: bridges / tunnels in the inventory the shortest solution does not use (only where a river / mountain exists). **faults**: repair levels, wrong pre-laid pieces.',
    '- **mechanics**: bridge, tunnel, station, arrow, order on the shortest solution.',
    '',
    '| id | kind | ch | board | inventory | minLen | distractors | solutions | naiveLen | detour | countSlack | planDepth | lures | faults | mechanics |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

/** Compact stats for the parent preview list. */
export function levelStats(): string {
  const out: Record<string, unknown> = {};
  for (const l of ALL_LEVELS) {
    const { m } = measured(l);
    out[l.id] = { board: board(l), minLen: m.minLen, distractors: m.distractors, planDepth: m.planDepth, detour: m.detour, solutions: m.solutions };
  }
  return JSON.stringify(out, null, 1) + '\n';
}
