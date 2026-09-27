// The v4 difficulty curve: chapter plan and the bands every program level must meet.
// tests/curve4.test.ts and scripts/gen4.ts both read this file. Pure data + checks.

import { regionSizes, median } from './bands';
import type { Level } from './level';
import type { ProgMetrics } from './progMetrics';
import { type Family, type ProgLevel, canRun, grammarProblems, levelView, rowCost, runProgram, solutionOf } from './program';

export type Range = readonly [number, number];

export interface Band4 {
  chapter: number;
  /** Level numbers (P01 = 1). */
  levels: Range;
  theme: string;
  /** Move family, or 'any' (debug levels). */
  commands: Family | 'any';
  repeat: boolean;
  /** true: required; false: not allowed; 'any': either. */
  nesting: boolean | 'any';
  slots: Range;
  fslots: Range;
  routeLen: Range;
}

export const BANDS4: readonly Band4[] = [
  { chapter: 1, levels: [1, 5], theme: 'Absolute arrows, no Repeat: plan the whole route', commands: 'absolute', repeat: false, nesting: false, slots: [7, 10], fslots: [0, 0], routeLen: [7, 10] },
  { chapter: 2, levels: [6, 10], theme: 'Repeat: a pattern that repeats', commands: 'absolute', repeat: true, nesting: false, slots: [4, 6], fslots: [0, 0], routeLen: [8, 12] },
  { chapter: 3, levels: [11, 15], theme: 'Two loops, or a 3-step loop', commands: 'absolute', repeat: true, nesting: false, slots: [5, 7], fslots: [0, 0], routeLen: [10, 16] },
  { chapter: 4, levels: [16, 20], theme: 'Ordered stations and one-way track', commands: 'absolute', repeat: true, nesting: false, slots: [5, 8], fslots: [0, 0], routeLen: [10, 16] },
  { chapter: 5, levels: [21, 25], theme: 'Relative turns, seen from the engine', commands: 'relative', repeat: true, nesting: false, slots: [4, 7], fslots: [0, 0], routeLen: [9, 16] },
  { chapter: 6, levels: [26, 30], theme: 'A loop inside a loop', commands: 'relative', repeat: true, nesting: true, slots: [5, 8], fslots: [0, 0], routeLen: [12, 24] },
  { chapter: 7, levels: [31, 35], theme: 'The P row: a subroutine used twice', commands: 'relative', repeat: true, nesting: 'any', slots: [4, 6], fslots: [2, 4], routeLen: [12, 24] },
  { chapter: 8, levels: [36, 40], theme: 'Debugging (P36–P39) and the finale (P40)', commands: 'any', repeat: true, nesting: 'any', slots: [4, 8], fslots: [0, 4], routeLen: [12, 24] },
];

export const LEVELS4 = 40;
export const FINALE4 = 'P40';
export const levelId4 = (n: number) => `P${String(n).padStart(2, '0')}`;
export const bandOf4 = (chapter: number): Band4 => BANDS4[chapter - 1];
export const levelNumber4 = (id: string) => Number(id.slice(1, 3));

/** Planned kind of level number n (1-based). */
export function plannedKind4(n: number): ProgLevel['kind'] {
  if (n === LEVELS4) return 'finale';
  if (n >= 36) return 'debug';
  return 'practice';
}

export const MAX_SOLUTIONS = 3;
export const MIN_GUESS_RATIO = 400;
export const MAX_BLOCKED = 0.3;
/** Terrain in clusters: at most this many blocked cells with no blocked cell around them (8 neighbours). */
export const MAX_ISOLATED = 2;
export const MAX_SIDE = 6;

const inRange = (v: number, r: Range) => v >= r[0] && v <= r[1];
const BLOCKED = new Set(['R', 'H', 'T', 'L']);

export function blockedCount(grid: readonly string[]): number {
  return [...grid.join('')].filter((c) => BLOCKED.has(c)).length;
}

/** Blocked cells with no blocked cell among their 8 neighbours. */
export function isolatedCount(grid: readonly string[]): number {
  let n = 0;
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[0].length; x++) {
      if (!BLOCKED.has(grid[y][x])) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && BLOCKED.has(grid[y + dy]?.[x + dx] ?? '')) near = true;
      if (!near) n++;
    }
  return n;
}

/** Rules for every v4 level (the "global" rules). */
export function globalProblems4(pl: ProgLevel, m: ProgMetrics): string[] {
  const out: string[] = [];
  const cols = pl.grid[0].length;
  const rows = pl.grid.length;
  if (cols > MAX_SIDE || rows > MAX_SIDE) out.push(`board ${cols}×${rows} > 6×6`);
  if (!(m.solutions >= 1)) out.push('unsolvable');
  if (m.solutions > MAX_SOLUTIONS) out.push(`solutions ${m.solutions} > ${MAX_SOLUTIONS}`);
  if (!(m.guessRatio >= MIN_GUESS_RATIO)) out.push(`guessRatio ${Math.floor(m.guessRatio)} < ${MIN_GUESS_RATIO}`);
  const blocked = blockedCount(pl.grid);
  if (blocked > MAX_BLOCKED * cols * rows) out.push(`blocked ${blocked}/${cols * rows} > 30%`);
  const v: Level = levelView(pl);
  for (const ch of ['L', '^', '~']) for (const size of regionSizes(v, ch)) if (size < 2) out.push(`a ${ch} region has 1 cell`);
  if (isolatedCount(pl.grid) > MAX_ISOLATED) out.push(`${isolatedCount(pl.grid)} isolated blocked cells > ${MAX_ISOLATED}`);
  const sol = solutionOf(pl);
  if (grammarProblems(pl, sol).length) out.push(`stored solution: ${grammarProblems(pl, sol).join(', ')}`);
  if (!canRun(pl, sol)) out.push(`stored solution does not fill the rows (${rowCost(sol.main)}/${pl.slots}, ${rowCost(sol.p)}/${pl.fslots})`);
  else if (!runProgram(pl, sol).success) out.push('stored solution fails');
  return out;
}

/** The chapter band (the table's columns and its "Required" column). */
export function bandProblems4(pl: ProgLevel, m: ProgMetrics): string[] {
  const b = bandOf4(pl.chapter);
  const out: string[] = [];
  const n = levelNumber4(pl.id);
  if (!inRange(n, b.levels)) out.push(`${pl.id} is not in chapter ${pl.chapter}`);
  if (pl.kind !== plannedKind4(n)) out.push(`kind ${pl.kind}, planned ${plannedKind4(n)}`);
  if (b.commands !== 'any' && pl.commands !== b.commands) out.push(`commands ${pl.commands}, band ${b.commands}`);
  if (pl.repeat !== b.repeat) out.push(`repeat ${pl.repeat}, band ${b.repeat}`);
  if (b.nesting !== 'any' && pl.nesting !== b.nesting) out.push(`nesting ${pl.nesting}, band ${b.nesting}`);
  if (!inRange(pl.slots, b.slots)) out.push(`slots ${pl.slots} outside ${b.slots.join('–')}`);
  if (!inRange(pl.fslots, b.fslots)) out.push(`fslots ${pl.fslots} outside ${b.fslots.join('–')}`);
  if (!inRange(m.routeLen, b.routeLen)) out.push(`routeLen ${m.routeLen} outside ${b.routeLen.join('–')}`);
  const stations = pl.stations ?? [];
  const ordered = stations.length > 0 && stations.every((s) => s.order !== undefined);
  switch (pl.chapter) {
    case 1:
      if (m.routeLen !== pl.slots) out.push(`routeLen ${m.routeLen} ≠ slots ${pl.slots}`);
      if (m.detour < 2) out.push(`detour ${m.detour} < 2`);
      break;
    case 2:
    case 5:
      if (!m.needsLoop) out.push('needsLoop is false');
      break;
    case 3:
      if (!m.needsLoop) out.push('needsLoop is false');
      if (!m.loopRich) out.push('a solution has < 2 Repeats and no 3-token body');
      break;
    case 4:
      if (!m.needsLoop) out.push('needsLoop is false');
      if (!m.stationsMatter && !m.arrowsMatter) out.push('neither stations nor arrows matter');
      if (stations.length > 0 && !ordered) out.push('ch4 stations are ordered');
      break;
    case 6:
      if (m.nestDepth !== 2) out.push(`nestDepth ${m.nestDepth} ≠ 2`);
      break;
    case 7:
      if (pl.fslots < 2) out.push('ch7 needs a P row');
      if (!m.needsFunction) out.push('needsFunction is false');
      break;
    case 8:
      if (pl.kind === 'debug') {
        if (!pl.given) out.push('debug level without a given program');
        if (m.bugs === null || m.bugs < 1 || m.bugs > 3) out.push(`bugs ${m.bugs} outside 1–3`);
      } else {
        if (pl.commands !== 'relative') out.push('finale: relative commands');
        if (!pl.nesting && pl.fslots === 0) out.push('finale: nesting or a P row');
        if (!ordered || stations.length < 2) out.push('finale: ordered stations');
      }
      break;
  }
  return out;
}

export function levelProblems4(pl: ProgLevel, m: ProgMetrics): string[] {
  return [...globalProblems4(pl, m), ...bandProblems4(pl, m)];
}

/**
 * Rules across the shipped set: ids in order, levels ordered by (routeLen, slots) within a
 * chapter, chapter medians of routeLen never going down, and the start not always on the left.
 */
export function setProblems4(levels: readonly ProgLevel[], metrics: (pl: ProgLevel) => ProgMetrics): string[] {
  const out: string[] = [];
  levels.forEach((l, i) => {
    if (l.id !== levelId4(i + 1)) out.push(`level ${i + 1} is ${l.id}`);
  });
  const chapters = [...new Set(levels.map((l) => l.chapter))];
  let lastMedian = -Infinity;
  for (const c of chapters) {
    const ls = levels.filter((l) => l.chapter === c);
    for (let i = 1; i < ls.length; i++) {
      const a = [metrics(ls[i - 1]).routeLen, ls[i - 1].slots];
      const b = [metrics(ls[i]).routeLen, ls[i].slots];
      if (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1])) out.push(`${ls[i - 1].id} → ${ls[i].id} not ordered by (routeLen, slots)`);
    }
    const med = median(ls.map((l) => metrics(l).routeLen));
    if (med < lastMedian) out.push(`chapter ${c} routeLen median ${med} < ${lastMedian}`);
    lastMedian = med;
    if (ls.every((l) => startOnLeft(l))) out.push(`chapter ${c}: every start is on the left`);
  }
  return out;
}

/** The start shed is in the leftmost column and the track leaves it to the east. */
export function startOnLeft(pl: ProgLevel): boolean {
  const y = pl.grid.findIndex((r) => r.includes('A'));
  return pl.grid[y].indexOf('A') === 0 && pl.start.exit === 'E';
}
