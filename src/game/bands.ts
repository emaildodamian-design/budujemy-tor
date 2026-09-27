// The difficulty curve: chapter plan and the bands every level must meet.
// tests/curve.test.ts and scripts/gen-levels.ts both read this file. Pure data + checks.

import { type Level, boardOf, kindOf } from './level';
import { type Mechanic, type Metrics } from './metrics';

/**
 * Ship-order fallback for chapters 6–8: when true, L31–L48 are built from the older
 * mechanics at the chapter 6–8 bands and the arrow / order requirements are dropped.
 */
export const ARROW_ORDER_FALLBACK = false;

/** Chapter 7 distractor floor (the brief allows lowering it to 2 if yield is too low; PR note). */
export const CH7_DISTRACTOR_FLOOR = 3;

export type Range = readonly [number, number];

export interface Band {
  chapter: number;
  /** Main levels of the chapter, first and last number (L01 = 1). */
  levels: Range;
  theme: string;
  intro?: { level: number; element: NonNullable<Level['intro']> };
  repair?: number;
  cols: Range;
  rows: Range;
  minLen: Range;
  distractors: Range;
  maxSolutions: number;
  detourMin: number;
  planDepth: Range;
  bridges: Range;
  tunnels: Range;
}

export const BANDS: readonly Band[] = [
  {
    chapter: 1, levels: [1, 6], theme: 'Obstacles, lakes, depot door facing away, an only-curves counting board',
    intro: { level: 4, element: 'rotation' },
    cols: [5, 5], rows: [4, 5], minLen: [5, 9], distractors: [0, 1], maxSolutions: 2, detourMin: 2, planDepth: [2, 3], bridges: [0, 0], tunnels: [0, 0],
  },
  {
    chapter: 2, levels: [7, 12], theme: 'River and bridge; lake as a lure; scarcity late',
    intro: { level: 7, element: 'bridge' }, repair: 12,
    cols: [5, 5], rows: [5, 6], minLen: [7, 11], distractors: [1, 2], maxSolutions: 2, detourMin: 2, planDepth: [2, 4], bridges: [1, 2], tunnels: [0, 0],
  },
  {
    chapter: 3, levels: [13, 18], theme: 'Mountains 2 cells thick: through or around',
    intro: { level: 13, element: 'tunnel' }, repair: 18,
    cols: [5, 6], rows: [5, 6], minLen: [8, 12], distractors: [1, 3], maxSolutions: 2, detourMin: 2, planDepth: [3, 4], bridges: [0, 1], tunnels: [1, 2],
  },
  {
    chapter: 4, levels: [19, 24], theme: 'Fixed-orientation stations',
    intro: { level: 19, element: 'station' }, repair: 24,
    cols: [5, 6], rows: [6, 6], minLen: [9, 13], distractors: [2, 3], maxSolutions: 2, detourMin: 3, planDepth: [3, 5], bridges: [0, 1], tunnels: [0, 1],
  },
  {
    chapter: 5, levels: [25, 30], theme: 'Lures and scarcity: 1 bridge, 1 tunnel', repair: 30,
    cols: [6, 6], rows: [6, 6], minLen: [10, 14], distractors: [3, 4], maxSolutions: 2, detourMin: 3, planDepth: [4, 6], bridges: [1, 1], tunnels: [1, 1],
  },
  {
    chapter: 6, levels: [31, 36], theme: 'One-way arrows',
    intro: { level: 31, element: 'oneWay' }, repair: 36,
    cols: [6, 6], rows: [6, 7], minLen: [10, 15], distractors: [3, 4], maxSolutions: 2, detourMin: 3, planDepth: [4, 6], bridges: [0, 1], tunnels: [0, 1],
  },
  {
    chapter: 7, levels: [37, 42], theme: 'Ordered stations',
    intro: { level: 37, element: 'order' }, repair: 42,
    cols: [6, 6], rows: [6, 7], minLen: [11, 16], distractors: [CH7_DISTRACTOR_FLOOR, 5], maxSolutions: 2, detourMin: 4, planDepth: [5, 8], bridges: [0, 1], tunnels: [0, 1],
  },
  {
    chapter: 8, levels: [43, 48], theme: 'Everything; L48 is the finale',
    cols: [6, 6], rows: [7, 7], minLen: [13, 18], distractors: [4, 5], maxSolutions: 2, detourMin: 4, planDepth: [6, 9], bridges: [1, 2], tunnels: [1, 2],
  },
];

export const MAIN_LEVELS = 48;
export const FINALE = 'L48';
export const levelId = (n: number) => `L${String(n).padStart(2, '0')}`;
export const bandOf = (chapter: number): Band => BANDS[chapter - 1];

/** Planned kind of main level number n (1-based). */
export function plannedKind(n: number): 'practice' | 'intro' | 'repair' | 'finale' {
  if (n === MAIN_LEVELS) return 'finale';
  const b = BANDS.find((x) => n >= x.levels[0] && n <= x.levels[1])!;
  if (b.intro?.level === n) return 'intro';
  if (b.repair === n) return 'repair';
  return 'practice';
}

/** Rotation is automatic on L01–L03; from the L04 rotation intro on, a tap turns a piece 90°. */
export const plannedRotate = (n: number): Level['rotate'] => (n <= 3 ? 'auto' : 'free');
/** Strict placement in chapter 1 and on intro levels; free elsewhere. */
export const plannedPlacement = (chapter: number, kind: string): Level['placement'] => (chapter === 1 || kind === 'intro' ? 'strict' : 'free');

const inRange = (v: number, r: Range) => v >= r[0] && v <= r[1];
const BLOCKED = new Set(['R', 'H', 'T', 'L']);

/** Rules for every main level and sibling (the "global" rules). */
export function globalProblems(level: Level, m: Metrics): string[] {
  const out: string[] = [];
  if (!(m.minLen >= 5)) out.push(`minLen ${m.minLen} < 5`);
  if (!(m.countSlack <= 2)) out.push(`countSlack ${m.countSlack} > 2`);
  if (!(m.solutions >= 1)) out.push('unsolvable');
  const cells = level.grid.join('');
  const blocked = [...cells].filter((c) => BLOCKED.has(c)).length;
  if (blocked > 0.3 * cells.length) out.push(`blocked ${blocked}/${cells.length} > 30%`);
  for (const ch of ['L', '^', '~']) for (const size of regionSizes(level, ch)) if (size < 2) out.push(`a ${ch} region has 1 cell`);
  return out;
}

/** Sizes of the 4-connected regions of terrain char `ch`. */
export function regionSizes(level: Level, ch: string): number[] {
  const rows = level.grid.length;
  const cols = level.grid[0].length;
  const seen = new Set<string>();
  const out: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (level.grid[y][x] !== ch || seen.has(`${x},${y}`)) continue;
      let n = 0;
      const stack = [[x, y]];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        n++;
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || level.grid[ny][nx] !== ch || seen.has(`${nx},${ny}`)) continue;
          seen.add(`${nx},${ny}`);
          stack.push([nx, ny]);
        }
      }
      out.push(n);
    }
  return out;
}

export interface Measured {
  level: Level;
  m: Metrics;
  /** Mechanics the shortest solution rides through. */
  mech: Mechanic[];
  /** Repair levels: fault types against the closest solution. */
  faultTypes?: string[];
  /** Repair levels: does the initial pre-laid track fail its test run? */
  initialFails?: boolean;
}

/** Chapter-specific "Required" column (shared by practice levels, the finale and siblings). */
export function requiredProblems(x: Measured): string[] {
  const { level, m, mech } = x;
  const out: string[] = [];
  const g = level.grid.join('');
  const stations = (level.stations ?? []).length;
  const arrows = (level.fixed ?? []).filter((p) => p.oneWay).length;
  const n = Number(level.id.slice(1, 3));
  const fb = ARROW_ORDER_FALLBACK;
  switch (level.chapter) {
    case 2:
      if (!mech.includes('bridge')) out.push('ch2: bridge not on the shortest solution');
      if (n >= 9 && !g.includes('L')) out.push('ch2: needs a lake from L09');
      break;
    case 3:
      if (!mech.includes('tunnel')) out.push('ch3: tunnel not on the shortest solution');
      break;
    case 4:
      if (stations < 1 || stations > 2) out.push(`ch4: ${stations} stations (1–2)`);
      break;
    case 5:
      if (!g.includes('~') || !g.includes('^')) out.push('ch5: needs a river and a mountain');
      if (m.lures < 1) out.push('ch5: lures < 1');
      break;
    case 6:
      if (!fb && (arrows < 1 || arrows > 2)) out.push(`ch6: ${arrows} arrows (1–2)`);
      if (!fb && !m.arrowMatters) out.push('ch6: arrows do not matter');
      break;
    case 7:
      if (!fb && (stations < 2 || stations > 3 || !boardOf(level).ordered)) out.push('ch7: needs 2–3 ordered stations');
      if (!fb && !m.orderMatters) out.push('ch7: order does not matter');
      break;
    case 8:
      if (mech.length < 3) out.push(`ch8: only ${mech.join('+') || 'nothing'} on the shortest solution`);
      break;
  }
  return out;
}

function sizeProblems(level: Level, band: Band): string[] {
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  return inRange(cols, band.cols) && inRange(rows, band.rows) ? [] : [`board ${cols}×${rows} outside ${band.cols.join('–')}×${band.rows.join('–')}`];
}

/** The practice band (also applied to repair levels and the finale). */
export function bandProblems(x: Measured, band = bandOf(x.level.chapter)): string[] {
  const { m } = x;
  const out = sizeProblems(x.level, band);
  if (!inRange(m.minLen, band.minLen)) out.push(`minLen ${m.minLen} outside ${band.minLen.join('–')}`);
  const dist = x.level.id <= 'L04' ? ([0, 0] as Range) : band.distractors;
  if (!inRange(m.distractors, dist)) out.push(`distractors ${m.distractors} outside ${dist.join('–')}`);
  if (m.solutions > band.maxSolutions) out.push(`solutions ${m.solutions} > ${band.maxSolutions}`);
  if (m.detour < band.detourMin) out.push(`detour ${m.detour} < ${band.detourMin}`);
  if (!inRange(m.planDepth, band.planDepth)) out.push(`planDepth ${m.planDepth} outside ${band.planDepth.join('–')}`);
  return out;
}

export function introProblems(x: Measured): string[] {
  const { level, m, mech } = x;
  const band = bandOf(level.chapter);
  const out: string[] = requiredProblems(x);
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  if (cols * rows > band.cols[0] * band.rows[0] || cols > band.cols[0] || rows > band.rows[0]) out.push(`intro board ${cols}×${rows} larger than ${band.cols[0]}×${band.rows[0]}`);
  if (Math.abs(m.minLen - band.minLen[0]) > 2) out.push(`intro minLen ${m.minLen} not within 2 of ${band.minLen[0]}`);
  if (m.distractors !== 0) out.push('intro has distractors');
  if (m.solutions > 2) out.push('intro solutions > 2');
  if (m.planDepth < 2) out.push('intro planDepth < 2');
  const el = level.intro;
  const need: Record<string, Mechanic | null> = { rotation: null, bridge: 'bridge', tunnel: 'tunnel', station: 'station', oneWay: 'arrow', order: 'order', repair: null };
  const want = el ? need[el] : null;
  if (!el) out.push('intro without element');
  else if (want && !mech.includes(want) && !(ARROW_ORDER_FALLBACK && (el === 'oneWay' || el === 'order'))) out.push(`intro element ${el} not on the shortest solution`);
  return out;
}

export function repairProblems(x: Measured): string[] {
  const { level, m } = x;
  const out = [...bandProblems(x), ...requiredProblems(x)];
  if (x.initialFails === false) out.push('repair: the initial track works');
  const types = new Set(x.faultTypes ?? []);
  if (level.chapter === 2) {
    if (m.faults < 1 || m.faults > 2) out.push(`repair faults ${m.faults} (1–2)`);
  } else {
    if (m.faults < 2 || m.faults > 3) out.push(`repair faults ${m.faults} (2–3)`);
    if (types.size < 2) out.push(`repair fault types ${[...types].join(',')} (need 2)`);
  }
  return out;
}

/** Sibling rules against its main level. */
export function siblingProblems(x: Measured, main: Metrics): string[] {
  const { level, m } = x;
  const band = bandOf(level.chapter);
  const out = [...sizeProblems(level, band), ...requiredProblems(x)];
  if (m.planDepth > Math.max(2, main.planDepth - 2)) out.push(`sibling planDepth ${m.planDepth} > ${Math.max(2, main.planDepth - 2)}`);
  if (m.distractors > Math.max(0, main.distractors - 2)) out.push(`sibling distractors ${m.distractors} > ${Math.max(0, main.distractors - 2)}`);
  if (m.minLen > Math.max(5, main.minLen - 2)) out.push(`sibling minLen ${m.minLen} > ${Math.max(5, main.minLen - 2)}`);
  if (m.detour < 2) out.push(`sibling detour ${m.detour} < 2`);
  if (m.solutions > band.maxSolutions) out.push(`sibling solutions ${m.solutions} > ${band.maxSolutions}`);
  return out;
}

/** All problems of one level (main or sibling). `main` is needed for siblings. */
export function levelProblems(x: Measured, main?: Metrics): string[] {
  const kind = kindOf(x.level);
  const out = globalProblems(x.level, x.m);
  if (kind === 'intro') out.push(...introProblems(x));
  else if (kind === 'repair') out.push(...repairProblems(x));
  else if (kind === 'sibling') out.push(...(main ? siblingProblems(x, main) : ['sibling without main']));
  else {
    out.push(...bandProblems(x), ...requiredProblems(x));
    if (kind === 'finale' && x.m.solutions > 2) out.push('finale solutions > 2');
  }
  return out;
}

export const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
