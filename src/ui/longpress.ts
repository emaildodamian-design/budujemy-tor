// Parent-only override button: must be held for the full 3 seconds.
// Letting go early resets it silently.

import { LONG_PRESS_MS, isLongPressComplete } from '../game/lock';
import { h, s } from './svg';

export function holdButton(label: string, onComplete: () => void): HTMLElement {
  const ring = s('circle', { class: 'hold-ring', cx: 22, cy: 22, r: 18, pathLength: 100 });
  const btn = h(
    'button',
    { class: 'hold-btn', type: 'button', 'aria-label': label },
    s(
      'svg',
      { viewBox: '0 0 44 44', class: 'hold-svg', 'aria-hidden': 'true' },
      s('circle', { class: 'hold-track', cx: 22, cy: 22, r: 18 }),
      ring,
      s('path', { d: 'M16 21 V17 a6 6 0 0 1 12 0 V21 M14 21 H30 V31 H14 Z', class: 'hold-lock' }),
    ),
    h('span', {}, label),
  );

  let pressedAt: number | null = null;
  let raf = 0;

  const reset = () => {
    pressedAt = null;
    cancelAnimationFrame(raf);
    btn.classList.remove('pressing');
    ring.style.strokeDashoffset = '100';
  };
  const tick = () => {
    if (pressedAt === null) return;
    const now = performance.now();
    ring.style.strokeDashoffset = String(100 - Math.min(100, ((now - pressedAt) / LONG_PRESS_MS) * 100));
    if (isLongPressComplete(pressedAt, now)) {
      reset();
      onComplete();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    pressedAt = performance.now();
    btn.classList.add('pressing');
    raf = requestAnimationFrame(tick);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) btn.addEventListener(ev, reset);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  reset();
  return btn;
}
