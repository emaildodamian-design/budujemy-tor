// All drawings are inline SVG built in code: nothing to download, crisp at any size.
// Board units: one cell = 100 × 100. v2 pieces have absolute orientations: a piece is
// drawn from one open side to the other.

import { type Dir, E, N, S, opposite, turnRight } from '../game/grid';
import type { Openings, PieceKind, Terrain } from '../game/level';
import { openingDirs } from '../game/level';
import type { CardId } from '../i18n';
import { s } from './svg';

export const CELL = 100;

export type Who = 'child' | 'parent';

export interface Pt {
  x: number;
  y: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Midpoint of a cell side, in cell-local units. */
export function sideMid(side: Dir): Pt {
  return [
    { x: 50, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 50 },
  ][side];
}

/** Corner shared by two perpendicular sides. */
function corner(a: Dir, b: Dir): Pt {
  const has = (d: Dir) => a === d || b === d;
  return { x: has(E) ? 100 : 0, y: has(S) ? 100 : 0 };
}

/** Point on `side` at distance r from corner c. */
function onSide(side: Dir, c: Pt, r: number): Pt {
  if (side === N || side === S) return { x: c.x === 0 ? r : 100 - r, y: side === N ? 0 : 100 };
  return { x: side === E ? 100 : 0, y: c.y === 0 ? r : 100 - r };
}

/** SVG path through a cell from side `from` to side `to`, `offset` units right of the centre line. */
export function pathD(from: Dir, to: Dir, offset = 0): string {
  if (from === opposite(to)) {
    const nx = [1, 0, -1, 0][to];
    const ny = [0, 1, 0, -1][to];
    const a = sideMid(from);
    const b = sideMid(to);
    return `M${f(a.x + nx * offset)} ${f(a.y + ny * offset)} L${f(b.x + nx * offset)} ${f(b.y + ny * offset)}`;
  }
  const c = corner(from, to);
  const turningRight = turnRight(opposite(from)) === to;
  const r = 50 + (turningRight ? -offset : offset);
  const a = onSide(from, c, r);
  const b = onSide(to, c, r);
  const cross = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
  return `M${f(a.x)} ${f(a.y)} A${f(r)} ${f(r)} 0 0 ${cross > 0 ? 1 : 0} ${f(b.x)} ${f(b.y)}`;
}

/** Point `k` (0..1) along the centre line of a cell from side `from` to side `to` (cell-local). */
export function pointThrough(from: Dir, to: Dir, k: number): Pt & { angle: number } {
  const a = sideMid(from);
  const b = sideMid(to);
  if (from === opposite(to)) {
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: [-90, 0, 90, 180][to] };
  }
  const c = corner(from, to);
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  let a1 = Math.atan2(b.y - c.y, b.x - c.x);
  let d = a1 - a0;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  a1 = a0 + d * k;
  const x = c.x + 50 * Math.cos(a1);
  const y = c.y + 50 * Math.sin(a1);
  const tangent = (a1 * 180) / Math.PI + (d > 0 ? 90 : -90);
  return { x, y, angle: tangent };
}

// ---------- terrain ----------

function base(cls: string): SVGRectElement {
  return s('rect', { class: cls, x: 2, y: 2, width: 96, height: 96, rx: 12 });
}

export function terrainArt(t: Terrain): SVGGElement {
  const g = s('g', { class: `terrain t-${t}` });
  switch (t) {
    case 'river':
      g.append(base('tile-water'));
      g.append(s('path', { class: 'wave', d: 'M14 34 q9 -7 18 0 t18 0 M50 70 q9 -7 18 0 t18 0' }));
      break;
    case 'mountain':
      g.append(base('tile-grass'));
      g.append(s('path', { class: 'mountain', d: 'M4 92 L34 22 L52 50 L66 30 L96 92 Z' }));
      g.append(s('path', { class: 'snow', d: 'M26 40 L34 22 L42 40 L36 36 Z M60 42 L66 30 L73 44 L67 40 Z' }));
      break;
    case 'rock':
      g.append(base('tile-grass'));
      g.append(s('path', { class: 'rock', d: 'M18 76 Q14 46 38 38 Q52 20 70 36 Q88 44 84 76 Z' }));
      g.append(s('path', { class: 'rock-shade', d: 'M50 76 Q70 66 84 76 Z' }));
      break;
    case 'house':
      g.append(base('tile-grass'));
      g.append(s('rect', { class: 'house-wall', x: 24, y: 44, width: 52, height: 40, rx: 4 }));
      g.append(s('path', { class: 'house-roof', d: 'M16 48 L50 18 L84 48 Z' }));
      g.append(s('rect', { class: 'house-door', x: 44, y: 62, width: 14, height: 22, rx: 3 }));
      g.append(s('rect', { class: 'house-window', x: 30, y: 54, width: 10, height: 10, rx: 2 }));
      break;
    case 'tree':
      g.append(base('tile-grass'));
      g.append(s('rect', { class: 'trunk', x: 45, y: 58, width: 10, height: 26, rx: 3 }));
      g.append(s('circle', { class: 'crown', cx: 50, cy: 42, r: 26 }));
      g.append(s('circle', { class: 'crown-light', cx: 42, cy: 34, r: 9 }));
      break;
    default:
      g.append(base('tile-grass'));
  }
  return g;
}

// ---------- track pieces ----------

function rails(o: Openings, g: SVGGElement, sleepers = 'sleepers') {
  const [a, b] = openingDirs(o);
  g.append(s('path', { class: sleepers, d: pathD(a, b) }));
  for (const off of [-14, 14]) g.append(s('path', { class: 'rail', d: pathD(a, b, off) }));
}

/**
 * One piece in cell-local units. `movable` pieces sit on a soft tile so they read
 * as things you can pick up; fixed track is drawn straight on the ground.
 */
export function pieceArt(kind: PieceKind | 'station', o: Openings, opts: { movable?: boolean } = {}): SVGGElement {
  const g = s('g', { class: `piece p-${kind}${opts.movable ? ' movable' : ' fixed'}` });
  const [a, b] = openingDirs(o);
  if (opts.movable && (kind === 'straight' || kind === 'curve')) g.append(s('rect', { class: 'piece-base', x: 6, y: 6, width: 88, height: 88, rx: 16 }));
  if (kind === 'bridge') {
    g.append(s('path', { class: 'bridge-deck', d: pathD(a, b) }));
    for (const off of [-30, 30]) g.append(s('path', { class: 'bridge-side', d: pathD(a, b, off) }));
    rails(o, g, 'bridge-planks');
    return g;
  }
  if (kind === 'tunnel') {
    g.append(s('path', { class: 'tunnel-bed', d: pathD(a, b) }));
    for (const off of [-14, 14]) g.append(s('path', { class: 'rail tunnel-rail', d: pathD(a, b, off) }));
    for (const d of [a, b]) {
      const rot = [0, 90, 180, 270][d];
      g.append(s('path', { class: 'tunnel-portal', d: 'M22 0 L22 14 Q50 -6 78 14 L78 0 Z', transform: `rotate(${rot} 50 50)` }));
    }
    return g;
  }
  if (kind === 'station') {
    rails(o, g);
    const side = o === 'NS' ? 'M72 18 H90 V82 H72 Z' : 'M18 72 V90 H82 V72 Z';
    g.append(s('path', { class: 'platform', d: side }));
    g.append(s('path', { class: 'station-roof', d: o === 'NS' ? 'M76 30 H96 V70 H76 Z' : 'M30 76 V96 H70 V76 Z' }));
    return g;
  }
  rails(o, g);
  return g;
}

/** Start shed: a little engine house open towards the exit, with a short stub of track. */
export function startArt(exit: Dir): SVGGElement {
  const g = s('g', { class: 'start-shed' });
  g.append(base('tile-grass'));
  const mid = sideMid(exit);
  g.append(s('path', { class: 'sleepers', d: `M50 50 L${mid.x} ${mid.y}` }));
  const nx = [1, 0, -1, 0][exit];
  const ny = [0, 1, 0, -1][exit];
  for (const o of [-14, 14]) g.append(s('path', { class: 'rail', d: `M${50 + nx * o} ${50 + ny * o} L${mid.x + nx * o} ${mid.y + ny * o}` }));
  const shed = s('path', { class: 'shed', d: 'M14 70 V30 L50 12 L86 30 V70 H70 V46 H30 V70 Z' });
  shed.setAttribute('transform', `rotate(${[180, 270, 0, 90][exit]} 50 50)`);
  g.append(shed);
  return g;
}

/** Depot floor with the stub of track from the entry side. The roof is a separate layer. */
export function depotFloorArt(entry: Dir): SVGGElement {
  const g = s('g', { class: 'depot-floor' });
  g.append(base('tile-grass'));
  g.append(s('rect', { x: 10, y: 10, width: 80, height: 80, rx: 10, fill: '#e9dcc3' }));
  const mid = sideMid(entry);
  const nx = [1, 0, -1, 0][entry];
  const ny = [0, 1, 0, -1][entry];
  for (const o of [-14, 14]) g.append(s('path', { class: 'rail', d: `M${50 + nx * o} ${50 + ny * o} L${mid.x + nx * o} ${mid.y + ny * o}` }));
  return g;
}

export function depotRoofArt(entry: Dir): SVGGElement {
  const g = s('g', { class: 'depot-roof' });
  g.append(s('rect', { x: 8, y: 8, width: 84, height: 84, rx: 12, fill: '#b5654a' }));
  g.append(s('path', { d: 'M8 50 H92', stroke: '#9a513a', 'stroke-width': 4 }));
  g.append(s('rect', { x: 40, y: 18, width: 20, height: 14, rx: 3, fill: '#8a4a36' }));
  const rot = [180, 270, 0, 90][entry];
  // Door arch on the side the train comes in, and the gate that stays shut if a station was missed.
  g.append(s('rect', { x: 28, y: 84, width: 44, height: 12, rx: 6, fill: '#5b3a2e', transform: `rotate(${rot} 50 50)` }));
  g.append(s('path', { class: 'gate', d: 'M24 97 H76 M32 90 V100 M50 90 V100 M68 90 V100', transform: `rotate(${rot} 50 50)` }));
  return g;
}

/** Top-down toy engine, facing +x, centred on the origin. */
export function engineArt(): SVGGElement {
  const g = s('g', { class: 'engine' });
  g.append(s('rect', { x: -34, y: -21, width: 68, height: 42, rx: 12, fill: '#d8573e' }));
  g.append(s('rect', { x: -34, y: -21, width: 26, height: 42, rx: 10, fill: '#a8412f' }));
  g.append(s('rect', { x: -28, y: -14, width: 14, height: 28, rx: 5, fill: '#ffe6a8' }));
  g.append(s('circle', { cx: 12, cy: 0, r: 9, fill: '#3f3f46' }));
  g.append(s('circle', { class: 'headlight', cx: 30, cy: 0, r: 6 }));
  const smoke = s('g', { class: 'smoke' });
  for (let i = 0; i < 3; i++) smoke.append(s('circle', { class: `puff puff-${i}`, cx: 12, cy: 0, r: 8 }));
  g.append(smoke);
  return g;
}

export function avatarArt(who: Who): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: `avatar-art ${who}`, 'aria-hidden': 'true' });
  if (who === 'child') {
    svg.append(s('circle', { class: 'fill-child', cx: 50, cy: 54, r: 34 }));
    svg.append(s('path', { d: 'M40 22 q10 -16 20 0', fill: 'none', stroke: '#8a5a2b', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    svg.append(s('circle', { cx: 39, cy: 52, r: 5, fill: '#3f3f46' }));
    svg.append(s('circle', { cx: 61, cy: 52, r: 5, fill: '#3f3f46' }));
    svg.append(s('path', { d: 'M42 68 q8 7 16 0', fill: 'none', stroke: '#3f3f46', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  } else {
    svg.append(s('circle', { class: 'fill-parent', cx: 50, cy: 52, r: 40 }));
    svg.append(s('path', { d: 'M16 44 q34 -40 68 0 q-10 -14 -34 -14 q-24 0 -34 14z', fill: '#2d4a53' }));
    svg.append(s('circle', { cx: 37, cy: 54, r: 5, fill: '#1f2937' }));
    svg.append(s('circle', { cx: 63, cy: 54, r: 5, fill: '#1f2937' }));
    svg.append(s('path', { d: 'M40 70 q10 8 20 0', fill: 'none', stroke: '#1f2937', 'stroke-width': 4, 'stroke-linecap': 'round' }));
  }
  return svg;
}

export function wagonArt(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 40 28', class: 'wagon-art', 'aria-hidden': 'true' });
  svg.append(s('rect', { class: 'wagon-body', x: 3, y: 3, width: 34, height: 17, rx: 5 }));
  svg.append(s('circle', { cx: 12, cy: 22, r: 4.5, fill: '#4b5563' }));
  svg.append(s('circle', { cx: 28, cy: 22, r: 4.5, fill: '#4b5563' }));
  return svg;
}

export function lampArt(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 40 40', class: 'lamp-art', 'aria-hidden': 'true' });
  svg.append(s('circle', { class: 'lamp-glow', cx: 20, cy: 17, r: 16 }));
  svg.append(s('path', { class: 'lamp-bulb', d: 'M20 5 a10 10 0 0 1 6 18 v5 h-12 v-5 a10 10 0 0 1 6 -18 z' }));
  svg.append(s('rect', { class: 'lamp-base', x: 14, y: 29, width: 12, height: 6, rx: 2 }));
  return svg;
}

/** A small board-free icon of a piece, for the tray and the goal strip. */
export function pieceIcon(kind: PieceKind | 'station', o: Openings, cls = 'tile-svg'): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: cls, 'aria-hidden': 'true' });
  if (kind === 'bridge') svg.append(base('tile-water'));
  else if (kind === 'tunnel') {
    svg.append(base('tile-grass'));
    svg.append(s('path', { class: 'mountain', d: 'M4 92 L34 22 L52 50 L66 30 L96 92 Z' }));
    svg.append(s('path', { class: 'snow', d: 'M26 40 L34 22 L42 40 L36 36 Z M60 42 L66 30 L73 44 L67 40 Z' }));
  } else if (kind === 'station') svg.append(base('tile-grass'));
  svg.append(pieceArt(kind, o, { movable: kind === 'straight' || kind === 'curve' }));
  return svg;
}

export function depotIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'goal-svg', 'aria-hidden': 'true' });
  svg.append(s('path', { d: 'M12 88 V42 L50 14 L88 42 V88 Z', fill: '#b5654a' }));
  svg.append(s('path', { d: 'M32 88 V58 Q50 44 68 58 V88 Z', fill: '#5b3a2e' }));
  return svg;
}

export function goIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'go-svg', 'aria-hidden': 'true' });
  svg.append(s('circle', { class: 'go-ring', cx: 50, cy: 50, r: 46, pathLength: 100 }));
  const eng = engineArt();
  eng.setAttribute('transform', 'translate(50 52) scale(0.8)');
  svg.append(eng);
  return svg;
}

export function pauseIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 40 40', class: 'pause-svg', 'aria-hidden': 'true' });
  svg.append(s('rect', { x: 12, y: 10, width: 5, height: 20, rx: 2 }), s('rect', { x: 23, y: 10, width: 5, height: 20, rx: 2 }));
  return svg;
}

export function continueIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'big-icon', 'aria-hidden': 'true' });
  svg.append(s('circle', { cx: 50, cy: 50, r: 46, fill: '#4aa3a0' }), s('path', { d: 'M40 30 L72 50 L40 70 Z', fill: '#fff' }));
  return svg;
}

export function endIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'big-icon', 'aria-hidden': 'true' });
  svg.append(s('circle', { cx: 50, cy: 50, r: 46, fill: '#e9dcc3' }));
  svg.append(s('path', { d: 'M24 76 V46 L50 26 L76 46 V76 Z', fill: '#b5654a' }));
  svg.append(s('path', { d: 'M38 76 V58 Q50 48 62 58 V76 Z', fill: '#5b3a2e' }));
  return svg;
}

/** Goal-strip station: a little station house with a platform. */
export function stationIcon(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'goal-svg', 'aria-hidden': 'true' });
  svg.append(s('rect', { x: 8, y: 74, width: 84, height: 14, rx: 4, fill: '#cbb89a' }));
  svg.append(s('rect', { x: 22, y: 38, width: 56, height: 36, rx: 3, fill: '#fde8c8' }));
  svg.append(s('path', { d: 'M14 42 L50 14 L86 42 Z', fill: '#6aa7c9' }));
  svg.append(s('rect', { x: 43, y: 52, width: 14, height: 22, rx: 3, fill: '#9a6b4f' }));
  return svg;
}

/** Simple built-in "Potem" icons. */
export function cardIcon(card: CardId): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'card-icon', 'aria-hidden': 'true' });
  const stroke = { fill: 'none', stroke: '#334155', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
  switch (card) {
    case 'bath':
      svg.append(
        s('circle', { cx: 32, cy: 30, r: 8, fill: '#bfe3f7' }),
        s('circle', { cx: 50, cy: 22, r: 6, fill: '#bfe3f7' }),
        s('circle', { cx: 64, cy: 32, r: 9, fill: '#bfe3f7' }),
        s('path', { d: 'M14 50 H86 V62 Q86 80 68 80 H32 Q14 80 14 62 Z', fill: '#7cc4ea' }),
        s('path', { d: 'M14 50 H86', ...stroke }),
        s('path', { d: 'M28 80 L24 90 M72 80 L76 90', ...stroke }),
      );
      break;
    case 'meal':
      svg.append(
        s('circle', { cx: 50, cy: 52, r: 30, fill: '#fde7c2' }),
        s('circle', { cx: 50, cy: 52, r: 19, fill: '#f6c177' }),
        s('path', { d: 'M12 26 V46 M8 26 V38 Q12 44 16 38 V26 M12 46 V82', ...stroke }),
        s('path', { d: 'M88 26 Q80 36 88 48 V82', ...stroke }),
      );
      break;
    case 'walk':
      svg.append(
        s('circle', { cx: 76, cy: 22, r: 10, fill: '#fcd34d' }),
        s('path', { d: 'M20 90 Q46 60 44 90', fill: '#d6c3a1' }),
        s('path', { d: 'M28 54 V74', ...stroke }),
        s('circle', { cx: 28, cy: 42, r: 18, fill: '#7fb77e' }),
        s('path', { d: 'M62 88 Q66 76 74 76 Q84 76 84 88 Z', fill: '#e07a5f' }),
        s('path', { d: 'M8 90 H92', ...stroke }),
      );
      break;
    case 'book':
      svg.append(
        s('path', { d: 'M50 28 Q34 18 12 22 V78 Q34 74 50 84 Z', fill: '#9bc5e8' }),
        s('path', { d: 'M50 28 Q66 18 88 22 V78 Q66 74 50 84 Z', fill: '#f4a7b9' }),
        s('path', { d: 'M50 28 V84', ...stroke }),
        s('path', { d: 'M22 38 Q32 36 40 40 M22 50 Q32 48 40 52 M60 40 Q68 36 78 38 M60 52 Q68 48 78 50', fill: 'none', stroke: '#ffffff', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      );
      break;
  }
  return svg;
}

/** Track through the start shed, for the intro picture: straight track icon. */
export function trackIcon(): SVGSVGElement {
  return pieceIcon('straight', 'EW', 'card-icon');
}
