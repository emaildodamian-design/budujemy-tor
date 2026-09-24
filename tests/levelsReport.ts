// Builds LEVELS.md from levels.json with the solver. `npm run levels` rewrites the file;
// tests/levels.test.ts fails if the committed file is out of date.
import type { Level } from '../src/game/level';
import { boardOf, isRepair } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { countSolutions } from '../src/game/solver';

const total = (l: Level) => Object.values(boardOf(l).inventory).reduce((a, b) => a + b, 0);
const tray = (l: Level) => l.tray.map((t) => `${t.count}×${t.piece}`).join(', ');
const terrain = (l: Level) => {
  const g = l.grid.join('');
  const has: string[] = [];
  if (g.includes('~')) has.push('river');
  if (g.includes('^')) has.push('mountain');
  if (g.includes('S')) has.push(`station×${(l.stations ?? []).length}`);
  if (/[RHT]/.test(g)) has.push('obstacles');
  return has.join(', ') || '–';
};

export function levelsReport(): string {
  const rows = LEVELS.map((l) => {
    const pre = isRepair(l) ? ` + ${l.preplaced!.length} pre-laid` : '';
    return `| ${l.id} | ${l.chapter} | ${l.intro ?? (isRepair(l) ? 'repair' : '')} | ${l.grid[0].length}×${l.grid.length} | ${terrain(l)} | ${tray(l)}${pre} | ${l.solution.length} | ${total(l) - l.solution.length} | ${l.rotate} / ${l.placement} | ${countSolutions(l, 50)}${countSolutions(l, 50) >= 50 ? '+' : ''} |`;
  });
  return [
    '# Levels',
    '',
    'Generated from `src/game/levels.json` by `npm run levels` (checked in CI: the test fails if this file is stale).',
    '',
    '- **pieces**: length of the declared solution. **distractors**: pieces owned (tray + pre-laid) minus pieces the solution uses; on repair levels this includes the wrong pieces that go back to the tray.',
    '- **solutions**: distinct solutions the solver finds from an empty board with everything the player owns (capped at 50).',
    '',
    '| id | ch | intro | board | terrain | tray | pieces | distractors | rotate / placement | solutions |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
