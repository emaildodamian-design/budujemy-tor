// All drawings are inline SVG built in code: nothing to download, crisp at any size.
// Board units: one cell = 100 × 100.

import { type Dir, type TileKind, E, N, S, exitHeading, opposite } from '../game/grid';
import type { Player } from '../game/session';
import type { CardId } from '../i18n';
import { s } from './svg';

export const CELL = 100;

interface Pt {
  x: number;
  y: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Midpoint of a cell side, in cell-local units. */
function sideMid(side: Dir): Pt {
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

/**
 * Path through a cell from side `from` to side `to`, `offset` units to the
 * right of the centre line (for the two rails). Returns [start, drawCommand].
 */
function segment(from: Dir, to: Dir, offset: number, ox = 0, oy = 0): [Pt, string] {
  if (from === opposite(to)) {
    // Straight. Right-hand normal of travel direction `to`.
    const nx = [1, 0, -1, 0][to];
    const ny = [0, 1, 0, -1][to];
    const a = sideMid(from);
    const b = sideMid(to);
    const p = { x: ox + a.x + nx * offset, y: oy + a.y + ny * offset };
    const q = { x: ox + b.x + nx * offset, y: oy + b.y + ny * offset };
    return [p, `L${f(q.x)} ${f(q.y)}`];
  }
  const c = corner(from, to);
  // Turning right means the corner is on the right, so the right rail is the inner one.
  const turningRight = exitHeading(opposite(from), 'right') === to;
  const r = 50 + (turningRight ? -offset : offset);
  const a = onSide(from, c, r);
  const b = onSide(to, c, r);
  const cross = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
  return [
    { x: ox + a.x, y: oy + a.y },
    `A${f(r)} ${f(r)} 0 0 ${cross > 0 ? 1 : 0} ${f(ox + b.x)} ${f(oy + b.y)}`,
  ];
}

function pathD(from: Dir, to: Dir, offset: number): string {
  const [p, cmd] = segment(from, to, offset);
  return `M${f(p.x)} ${f(p.y)} ${cmd}`;
}

export interface TileLook {
  heading: Dir;
  kind: TileKind;
  owner?: Player;
  bridge?: boolean;
  broken?: boolean;
}

/** One track tile as an SVG group in cell-local units (0..100). */
export function tileArt(t: TileLook): SVGGElement {
  const from = opposite(t.heading);
  const to = exitHeading(t.heading, t.kind);
  const centre = pathD(from, to, 0);
  const g = s('g', { class: `tile${t.bridge ? ' bridge' : ''}${t.broken ? ' broken' : ''}` });
  g.append(s('rect', { class: t.bridge ? 'tile-water' : 'tile-grass', x: 3, y: 3, width: 94, height: 94, rx: 14 }));
  if (t.bridge) {
    g.append(s('path', { class: 'bridge-deck', d: centre }));
  }
  g.append(s('path', { class: t.bridge ? 'bridge-planks' : 'sleepers', d: centre }));
  for (const o of [-14, 14]) g.append(s('path', { class: 'rail', d: pathD(from, to, o) }));
  // Broken bridge: the middle third is missing, water shows through.
  if (t.broken) g.append(s('path', { class: 'bridge-gap', d: centre, pathLength: 100 }));
  if (t.owner) g.append(s('circle', { class: `owner-dot fill-${t.owner}`, cx: 11, cy: 11, r: 6 }));
  return g;
}

export function stationArt(heading: Dir): SVGGElement {
  const g = s('g', { class: 'station' });
  g.append(s('rect', { class: 'tile-grass', x: 3, y: 3, width: 94, height: 94, rx: 14 }));
  const d = `M50 50 L${sideMid(heading).x} ${sideMid(heading).y}`;
  g.append(s('path', { class: 'sleepers', d }));
  for (const o of [-14, 14]) {
    const nx = [1, 0, -1, 0][heading] * o;
    const ny = [0, 1, 0, -1][heading] * o;
    g.append(
      s('path', { class: 'rail', d: `M${50 + nx} ${50 + ny} L${sideMid(heading).x + nx} ${sideMid(heading).y + ny}` }),
    );
  }
  // Platform and a little flag.
  g.append(s('rect', { class: 'platform', x: 12, y: 58, width: 76, height: 30, rx: 8 }));
  g.append(s('rect', { x: 20, y: 64, width: 60, height: 5, rx: 2.5, fill: '#fff8e7' }));
  return g;
}

/** Depot shed: floor first, the roof is a separate layer so the engine can roll "inside". */
export function depotFloorArt(): SVGGElement {
  const g = s('g', { class: 'depot-floor' });
  g.append(s('rect', { class: 'tile-grass', x: 3, y: 3, width: 94, height: 94, rx: 14 }));
  g.append(s('rect', { x: 10, y: 10, width: 80, height: 80, rx: 10, fill: '#e9dcc3' }));
  return g;
}

export function depotRoofArt(entrySide: Dir): SVGGElement {
  const g = s('g', { class: 'depot-roof' });
  g.append(s('rect', { x: 8, y: 8, width: 84, height: 84, rx: 12, fill: '#b5654a' }));
  g.append(s('path', { d: 'M8 50 H92', stroke: '#9a513a', 'stroke-width': 4 }));
  g.append(s('rect', { x: 40, y: 18, width: 20, height: 14, rx: 3, fill: '#8a4a36' }));
  // Door arch on the side the train comes in.
  const door = s('rect', { x: 30, y: 84, width: 40, height: 12, rx: 6, fill: '#5b3a2e' });
  const rot = [180, 270, 0, 90][entrySide];
  door.setAttribute('transform', `rotate(${rot} 50 50)`);
  g.append(door);
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

export function avatarArt(who: Player): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: `avatar-art ${who}`, 'aria-hidden': 'true' });
  if (who === 'child') {
    svg.append(s('circle', { class: 'fill-child', cx: 50, cy: 54, r: 34 }));
    svg.append(s('path', { d: 'M40 22 q10 -16 20 0', fill: 'none', stroke: '#8a5a2b', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    svg.append(s('circle', { cx: 39, cy: 52, r: 5, fill: '#3f3f46' }));
    svg.append(s('circle', { cx: 61, cy: 52, r: 5, fill: '#3f3f46' }));
    svg.append(s('circle', { cx: 31, cy: 64, r: 5, fill: '#f7b3a1', opacity: 0.8 }));
    svg.append(s('circle', { cx: 69, cy: 64, r: 5, fill: '#f7b3a1', opacity: 0.8 }));
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

export function wagonArt(who: Player): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 40 28', class: 'wagon-art', 'aria-hidden': 'true' });
  svg.append(s('rect', { class: `fill-${who}`, x: 3, y: 3, width: 34, height: 17, rx: 5 }));
  svg.append(s('circle', { cx: 12, cy: 22, r: 4.5, fill: '#4b5563' }));
  svg.append(s('circle', { cx: 28, cy: 22, r: 4.5, fill: '#4b5563' }));
  return svg;
}

/** Tile shown in the tray: the exact tile that will be laid, in board orientation. */
export function trayTileSvg(t: TileLook): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 100 100', class: 'tile-svg', 'aria-hidden': 'true' });
  svg.append(tileArt(t));
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

/**
 * The whole ride as one SVG path (board units): station centre → every tile →
 * depot centre. The UI measures it with getPointAtLength to move the engine.
 */
export function ridePath(
  station: { x: number; y: number },
  stationHeading: Dir,
  tiles: readonly { cell: { x: number; y: number }; heading: Dir; exit: Dir }[],
  depotCell: { x: number; y: number },
): string {
  const ox = (c: { x: number }) => c.x * CELL;
  const oy = (c: { y: number }) => c.y * CELL;
  const exitMid = sideMid(stationHeading);
  let d = `M${ox(station) + 50} ${oy(station) + 50} L${ox(station) + exitMid.x} ${oy(station) + exitMid.y}`;
  for (const t of tiles) d += ` ${segment(opposite(t.heading), t.exit, 0, ox(t.cell), oy(t.cell))[1]}`;
  d += ` L${ox(depotCell) + 50} ${oy(depotCell) + 50}`;
  return d;
}
