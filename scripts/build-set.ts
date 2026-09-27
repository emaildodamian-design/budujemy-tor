// npm run gen:set -- --chapter N [--only L26,L26s] [--pool 8] [--seed 0] [--min-plan P --min-len L]   → scripts/out/set-chN.json
// npm run gen:set -- --merge                                               → src/game/levels.json
//
// Chapters are built separately (they can run in parallel), then merged.
// Builds the whole v3 level set into src/game/levels.json, reproducibly:
//  - L01–L04 exactly as given in the brief;
//  - every other main level: a pool of generated candidates per slot (seeded by the
//    level number), then a pick per chapter that keeps practice levels non-decreasing by
//    (planDepth, minLen), spreads them over the band, and prefers boards that look
//    varied (terrain mix, route covering the board, not too many blocked cells);
//  - the finale L48 aims for a unique solution;
//  - a step-down sibling for every practice level and the finale of chapters 2–8.
// With --only, the listed ids are regenerated and every other level is kept as it is.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BANDS, FINALE, MAIN_LEVELS, bandOf, levelId, plannedKind } from '../src/game/bands';
import type { Level } from '../src/game/level';
import given from '../tests/fixtures/given_L01_L04.json';
import { type Candidate, type Spec, generate, measure } from './gen/generate';

function arg(name: string, d?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : d;
}
const POOL = Number(arg('pool', '8'));
const SEED = Number(arg('seed', '0'));
const ONLY = arg('only')?.split(',') ?? null;
const CHAPTER = arg('chapter') ? Number(arg('chapter')) : null;
const MERGE = process.argv.includes('--merge');
/** Floors for practice picks, e.g. to keep a chapter's medians at or above the previous chapter's. */
const MIN_PLAN = Number(arg('min-plan', '0'));
const MIN_LEN = Number(arg('min-len', '0'));

/** L01–L04 exactly as given in the brief (tests/fixtures/given_L01_L04.json). */
export const GIVEN = given as Level[];

/** Higher is nicer to look at: a mix of terrain, a route that uses the board, few blocked cells. */
function looks(c: Candidate): number {
  const g = c.level.grid.join('');
  const kinds = ['L', '~', '^', 'R', 'H', 'T', 'S'].filter((k) => g.includes(k)).length;
  const blocked = [...g].filter((ch) => 'RHTL'.includes(ch)).length / g.length;
  const cover = c.m.minLen / g.length;
  return kinds * 0.5 + cover * 4 - Math.abs(blocked - 0.18) * 6;
}

const key = (c: Candidate) => c.m.planDepth * 100 + c.m.minLen;

function specFor(n: number): Spec {
  const chapter = BANDS.find((b) => n >= b.levels[0] && n <= b.levels[1])!.chapter;
  const kind = plannedKind(n);
  const spec: Spec = { n, chapter, kind };
  if (kind === 'intro') spec.intro = bandOf(chapter).intro!.element;
  if (kind === 'finale') spec.unique = true;
  return spec;
}

const log = (s: string) => process.stdout.write(s + '\n');

function pool(spec: Spec, size: number, salt = 0): Candidate[] {
  const t = Date.now();
  const got = generate(spec, spec.n * 7919 + SEED * 104729 + salt, size, 20000);
  log(`  ${levelId(spec.n)}${spec.kind === 'sibling' ? 's' : ''}: ${got.length} candidates in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return got;
}

/**
 * Pick one candidate per practice slot, non-decreasing by (planDepth, minLen), spread over the
 * band (targets move from the band's low end to its high end), preferring good looks. DP over
 * the pools, so a feasible sequence is always found when one exists.
 */
function pickChapter(slots: number[], pools: Map<number, Candidate[]>, floor: number): Map<number, Candidate> {
  const cost = (n: number, i: number, c: Candidate) => {
    const band = bandOf(specFor(n).chapter);
    const t = slots.length > 1 ? i / (slots.length - 1) : 0.5;
    const tPlan = band.planDepth[0] + (band.planDepth[1] - band.planDepth[0]) * t;
    const tLen = band.minLen[0] + (band.minLen[1] - band.minLen[0]) * t;
    return Math.abs(c.m.planDepth - tPlan) * 3 + Math.abs(c.m.minLen - tLen) * 0.7 - looks(c) * 0.5;
  };
  const P = slots.map((n) => pools.get(n) ?? []);
  const dp: { v: number; from: number }[][] = P.map((cs) => cs.map(() => ({ v: Infinity, from: -1 })));
  P[0]?.forEach((c, j) => {
    if (key(c) >= floor) dp[0][j] = { v: cost(slots[0], 0, c), from: -1 };
  });
  for (let i = 1; i < P.length; i++)
    P[i].forEach((c, j) => {
      P[i - 1].forEach((p, k) => {
        if (key(p) > key(c) || dp[i - 1][k].v === Infinity) return;
        const v = dp[i - 1][k].v + cost(slots[i], i, c);
        if (v < dp[i][j].v) dp[i][j] = { v, from: k };
      });
    });
  const last = dp.length - 1;
  let j = dp[last].reduce((bi, x, k, arr) => (x.v < arr[bi].v ? k : bi), 0);
  if (!(dp[last][j]?.v < Infinity)) throw new Error(`chapter ${specFor(slots[0]).chapter}: no non-decreasing pick`);
  const out = new Map<number, Candidate>();
  for (let i = last; i >= 0; i--) {
    out.set(slots[i], P[i][j]);
    j = dp[i][j].from;
  }
  return out;
}

function serialize(l: Level): string {
  const order = ['id', 'chapter', 'kind', 'siblingOf', 'intro', 'grid', 'start', 'depot', 'stations', 'fixed', 'preplaced', 'tray', 'rotate', 'placement', 'solution'];
  const o: Record<string, unknown> = {};
  for (const k of order) if ((l as unknown as Record<string, unknown>)[k] !== undefined) o[k] = (l as unknown as Record<string, unknown>)[k];
  return JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/,\{/g, ', {').replace(/,\[/g, ', [').replace(/\],(\d)/g, '], $1').replace(/(\d),(\d)/g, '$1, $2');
}

const existing: Level[] = (() => {
  try {
    const all = JSON.parse(readFileSync('src/game/levels.json', 'utf8')) as Level[];
    return all.every((l) => l.kind) ? all : [];
  } catch {
    return [];
  }
})();
const keep = (id: string) => ONLY !== null && !ONLY.includes(id) && existing.some((l) => l.id === id);
const kept = (id: string) => existing.find((l) => l.id === id)!;

const main = new Map<number, Candidate>();
GIVEN.forEach((l, i) => main.set(i + 1, measure(l)));
const notes: string[] = [];

for (const band of BANDS) {
  if (band.chapter !== CHAPTER) continue;
  log(`chapter ${band.chapter}`);
  const slots: number[] = [];
  const pools = new Map<number, Candidate[]>();
  for (let n = Math.max(5, band.levels[0]); n <= band.levels[1]; n++) {
    const spec = specFor(n);
    if (keep(levelId(n))) {
      main.set(n, measure(kept(levelId(n))));
      continue;
    }
    if (spec.kind === 'practice') {
      slots.push(n);
      let got: Candidate[] = [];
      for (let salt = 0; salt < 5 && got.length < POOL; salt++) {
        got = [...got, ...pool(spec, POOL, salt * 7).filter((c) => c.m.planDepth >= MIN_PLAN && c.m.minLen >= MIN_LEN)];
      }
      pools.set(n, got);
    } else if (spec.kind === 'finale') {
      const got = pool(spec, POOL * 2);
      const unique = got.filter((c) => c.m.solutions === 1);
      const hardest = (xs: Candidate[]) => [...xs].sort((a, b) => key(b) - key(a))[0];
      if (unique.length) main.set(n, hardest(unique));
      else {
        main.set(n, hardest(got));
        notes.push(`${FINALE}: no unique-solution candidate within budget; used the hardest accepted chapter-8 level (solutions ${hardest(got).m.solutions}).`);
      }
    } else {
      const got = pool(spec, spec.kind === 'intro' ? 6 : 3);
      if (got.length === 0) throw new Error(`${levelId(n)}: no candidate`);
      // Intros stay gentle: the lowest planDepth first, then looks.
      const rank = (c: Candidate) => (spec.kind === 'intro' ? c.m.planDepth * 10 : 0) - looks(c);
      main.set(n, [...got].sort((a, b) => rank(a) - rank(b))[0]);
    }
  }
  if (slots.length) {
    const before = [...main.entries()].filter(([n, c]) => c.level.chapter === band.chapter && specFor(n).kind === 'practice' && !slots.includes(n));
    const floor = before.length ? Math.max(...before.filter(([n]) => n < slots[0]).map(([, c]) => key(c)), 0) : 0;
    for (const [n, c] of pickChapter(slots, pools, floor)) main.set(n, c);
  }
}

// Siblings: every practice level and the finale of chapters 2–8.
const siblings: Candidate[] = [];
for (let n = 5; n <= MAIN_LEVELS; n++) {
  const spec = specFor(n);
  if (spec.chapter !== CHAPTER) continue;
  if (spec.chapter < 2 || (spec.kind !== 'practice' && spec.kind !== 'finale')) continue;
  const id = `${levelId(n)}s`;
  const m = main.get(n)!;
  if (keep(id) && keep(levelId(n))) {
    siblings.push(measure(kept(id), m.m));
    continue;
  }
  const got = pool({ n, chapter: spec.chapter, kind: 'sibling', main: m.m }, 3);
  if (got.length === 0) throw new Error(`${id}: no sibling`);
  siblings.push([...got].sort((a, b) => looks(b) - looks(a))[0]);
}

if (MERGE) {
  const levels: Level[] = [];
  const sibs: Level[] = [];
  const merged: string[] = [];
  for (const band of BANDS) {
    const file = `scripts/out/set-ch${band.chapter}.json`;
    let part: { main: Level[]; siblings: Level[]; notes: string[] };
    try {
      part = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // Not rebuilt: keep this chapter from the current levels.json.
      part = { main: existing.filter((l) => l.chapter === band.chapter && l.kind !== 'sibling'), siblings: existing.filter((l) => l.chapter === band.chapter && l.kind === 'sibling'), notes: [] };
      if (band.chapter === 1 && part.main.length === 0) part.main = GIVEN;
    }
    levels.push(...part.main);
    sibs.push(...part.siblings);
    merged.push(...part.notes);
  }
  const all = [...levels, ...sibs];
  writeFileSync('src/game/levels.json', `[\n${all.map((l) => '  ' + serialize(l)).join(',\n')}\n]\n`);
  log(`merged ${levels.length} main levels + ${sibs.length} siblings into src/game/levels.json`);
  for (const n of merged) log(`NOTE ${n}`);
  process.exit(0);
}

const all = [...[...main.entries()].sort((a, b) => a[0] - b[0]).filter(([, c]) => c.level.chapter === CHAPTER).map(([, c]) => c), ...siblings];
mkdirSync('scripts/out', { recursive: true });
writeFileSync(`scripts/out/set-ch${CHAPTER}.json`, JSON.stringify({ main: all.filter((c) => c.level.kind !== 'sibling').map((c) => c.level), siblings: siblings.map((c) => c.level), notes }, null, 1));
for (const c of all) log(`${c.level.id.padEnd(4)} plan ${c.m.planDepth} len ${c.m.minLen} dis ${c.m.distractors} sol ${c.m.solutions} detour ${c.m.detour} ${c.problems.length ? '!! ' + c.problems.join('; ') : ''}`);
for (const n of notes) log(`NOTE ${n}`);
