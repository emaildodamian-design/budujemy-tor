// v4 icons: command tiles and program-strip marks. Inline SVG, no words.

import type { Move } from '../game/program';
import { engineArt, pieceArt } from './art';
import { s } from './svg';

const svg = (cls: string, vb = '0 0 100 100') => s('svg', { viewBox: vb, class: cls, 'aria-hidden': 'true' });

/** Absolute moves: a thick arrow. Relative moves: the track piece as seen from the engine. */
export function moveIcon(m: Move): SVGSVGElement {
  const out = svg(`cmd-svg cmd-${m}`);
  if ('NESW'.includes(m)) {
    const rot = { N: 0, E: 90, S: 180, W: 270 }[m as 'N'];
    out.append(s('path', { class: 'cmd-arrow', d: 'M50 12 L82 48 H62 V88 H38 V48 H18 Z', transform: `rotate(${rot} 50 50)` }));
    return out;
  }
  // The engine comes in from the bottom: straight on, curve left, curve right.
  const o = m === 'F' ? 'NS' : m === 'L' ? 'SW' : 'ES';
  const g = pieceArt(m === 'F' ? 'straight' : 'curve', o);
  g.setAttribute('transform', 'translate(8 4) scale(0.84)');
  out.append(g);
  const e = engineArt();
  e.setAttribute('transform', 'translate(50 90) rotate(-90) scale(0.34)');
  out.append(e);
  return out;
}

/** Repeat: a loop arrow. */
export function repeatIcon(): SVGSVGElement {
  const out = svg('cmd-svg cmd-repeat');
  out.append(s('path', { class: 'loop-line', d: 'M74 34 A28 28 0 1 0 78 62' }));
  out.append(s('path', { class: 'loop-head', d: 'M62 22 L84 30 L70 48 Z' }));
  return out;
}

/** The P row: a little purple strip of three boxes (the Call tile and the P row's marker). */
export function callIcon(): SVGSVGElement {
  const out = svg('cmd-svg cmd-call');
  out.append(s('rect', { class: 'call-bg', x: 8, y: 22, width: 84, height: 56, rx: 14 }));
  for (const x of [18, 42, 66]) out.append(s('rect', { class: 'call-box', x, y: 38, width: 16, height: 24, rx: 4 }));
  return out;
}

/** "Take out": a small curved arrow back up to the palette. */
export function takeOutIcon(): SVGSVGElement {
  const out = svg('mark-svg', '0 0 40 40');
  out.append(s('circle', { class: 'mark-disc', cx: 20, cy: 20, r: 18 }));
  out.append(s('path', { class: 'mark-line', d: 'M13 13 L27 27 M27 13 L13 27' }));
  return out;
}

export function plusIcon(): SVGSVGElement {
  const out = svg('mark-svg', '0 0 40 40');
  out.append(s('circle', { class: 'mark-disc', cx: 20, cy: 20, r: 18 }));
  out.append(s('path', { class: 'mark-line', d: 'M20 11 V29 M11 20 H29' }));
  return out;
}

export function minusIcon(): SVGSVGElement {
  const out = svg('mark-svg', '0 0 40 40');
  out.append(s('circle', { class: 'mark-disc', cx: 20, cy: 20, r: 18 }));
  out.append(s('path', { class: 'mark-line', d: 'M11 20 H29' }));
  return out;
}

/** Lamp dots on the route cells of the stored solution. */
export function dotArt(): SVGGElement {
  const g = s('g', { class: 'lamp-dot' });
  g.append(s('circle', { class: 'dot-glow', cx: 50, cy: 50, r: 22 }));
  g.append(s('circle', { class: 'dot-core', cx: 50, cy: 50, r: 10 }));
  return g;
}
