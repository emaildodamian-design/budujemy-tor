// npm run gen -- --chapter N --count K --seed S [--kind practice|intro|repair|finale|sibling] [--n 26] [--budget 4000]
//
// Writes accepted candidates with their metrics to scripts/out/ (git-ignored) and prints
// them as ASCII boards, so levels can be picked for looks as well as numbers.
// Siblings read their main level's metrics from src/game/levels.json (--n = main level number).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BANDS, bandOf, levelId, plannedKind } from '../src/game/bands';
import type { Level, LevelKind } from '../src/game/level';
import { metricsOf } from '../src/game/metrics';
import { type Candidate, type Spec, generate, rejects } from './gen/generate';

function arg(name: string, d?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : d;
}

const chapter = Number(arg('chapter', '1'));
const count = Number(arg('count', '4'));
const seed = Number(arg('seed', '1'));
const budget = Number(arg('budget', '4000'));
const band = bandOf(chapter);
const n = Number(arg('n', String(band.levels[0] + (band.intro?.level === band.levels[0] ? 1 : 0))));
const kind = (arg('kind') ?? plannedKind(n)) as LevelKind;

const spec: Spec = { n, chapter, kind };
if (kind === 'intro') spec.intro = BANDS[chapter - 1].intro?.element;
if (kind === 'sibling') {
  const levels = JSON.parse(readFileSync('src/game/levels.json', 'utf8')) as Level[];
  const main = levels.find((l) => l.id === levelId(n));
  if (!main) throw new Error(`no main level ${levelId(n)} in levels.json`);
  spec.main = metricsOf(main);
}

export function show(c: Candidate): string {
  const m = c.m;
  const head = `minLen ${m.minLen} dis ${m.distractors} sol ${m.solutions} naive ${m.naiveLen} detour ${m.detour} slack ${m.countSlack} plan ${m.planDepth} lures ${m.lures} faults ${m.faults} mech ${c.mech.join('+')}`;
  const extra = [
    `start ${c.level.start.exit} depot ${c.level.depot.entry}`,
    `tray ${c.level.tray.map((t) => `${t.count}${t.piece[0]}`).join(' ')}`,
    c.level.fixed?.length ? `arrows ${c.level.fixed.map((p) => `${p.at}:${p.openings}>${p.oneWay}`).join(' ')}` : '',
    c.level.stations?.length ? `stations ${c.level.stations.map((s) => `${s.at}:${s.openings}${s.order ? '#' + s.order : ''}`).join(' ')}` : '',
    c.level.preplaced?.length ? `pre ${c.level.preplaced.length}` : '',
  ].filter(Boolean);
  return [head, ...c.level.grid.map((r, i) => `  ${r}   ${extra[i] ?? ''}`)].join('\n');
}

const t0 = Date.now();
let tried = 0;
let built = 0;
const why = new Map<string, number>();
const got = generate(spec, seed, count, budget, (_i, c) => {
  tried++;
  if (!c) return;
  built++;
  for (const p of c.problems) {
    const k = p.replace(/-?\d+/g, '#');
    why.set(k, (why.get(k) ?? 0) + 1);
  }
});
if (process.argv.includes('--why')) console.log([...rejects], [...why].sort((a, b) => b[1] - a[1]).slice(0, 15));
mkdirSync('scripts/out', { recursive: true });
const file = `scripts/out/ch${chapter}-${kind}-n${n}-s${seed}.json`;
writeFileSync(file, JSON.stringify(got.map((c) => ({ level: c.level, metrics: c.m, mech: c.mech })), null, 1));
for (const c of got) console.log(show(c) + '\n');
console.log(`chapter ${chapter} ${kind} n=${n} seed ${seed}: ${got.length}/${count} accepted from ${tried} tries (${built} built) in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${file}`);
