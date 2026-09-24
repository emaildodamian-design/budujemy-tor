// Child-facing scenes around the puzzle: the intro picture and the slow depot ride.
// No words: pictures only.

import { cardIcon, depotFloorArt, depotRoofArt, engineArt, pieceArt, startArt, trackIcon } from './art';
import { E, W } from '../game/grid';
import type { CardId } from '../i18n';
import { h, s } from './svg';

/** "First the track, then [card]": track picture → arrow → the Potem card (photo or icon). */
export function introScene(card: CardId, photoUrl: string | null, onDone: () => void, ms = 3500): { el: HTMLElement; stop: () => void } {
  const pic = photoUrl ? h('img', { src: photoUrl, alt: '', class: 'card-photo', draggable: 'false' }) : cardIcon(card);
  const arrow = s('svg', { viewBox: '0 0 60 40', class: 'intro-arrow', 'aria-hidden': 'true' }, s('path', { d: 'M6 20 H50 M36 8 L52 20 L36 32' }));
  const el = h('main', { class: 'screen intro-scene', role: 'button', 'aria-label': 'Budujemy Tor' }, h('div', { class: 'intro-first' }, trackIcon()), arrow, h('figure', { class: 'potem-card big' }, pic));
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    onDone();
  };
  const timer = window.setTimeout(go, ms);
  el.addEventListener('click', go);
  return { el, stop: () => window.clearTimeout(timer) };
}

/** After the last slot (or the parent's end): the engine rolls slowly into the depot, lights dim, engine off. */
export function depotRideScene(onDone: () => void, ms = 5200): { el: HTMLElement; stop: () => void } {
  const svg = s('svg', { viewBox: '0 0 500 100', class: 'depot-ride', 'aria-hidden': 'true' });
  const g = (x: number, child: SVGElement) => s('g', { transform: `translate(${x} 0)` }, child);
  svg.append(g(0, startArt(E)));
  for (let x = 100; x < 400; x += 100) svg.append(g(x, pieceArt('straight', 'EW')));
  svg.append(g(400, depotFloorArt(W)));
  const engine = engineArt();
  engine.classList.add('rolling-home');
  svg.append(engine);
  const roof = g(400, depotRoofArt(W));
  roof.classList.add('roof');
  svg.append(roof);
  const el = h('main', { class: 'screen depot-scene' }, svg);
  const timers = [
    window.setTimeout(() => {
      engine.classList.add('off');
      roof.classList.add('closed');
      el.classList.add('dim');
    }, ms * 0.7),
    window.setTimeout(onDone, ms),
  ];
  return { el, stop: () => timers.forEach((t) => window.clearTimeout(t)) };
}
