// Parent-only override: a hidden 3-second long-press on the screen's heading.
// There is no visible button for a child to find. Nothing shows for a normal
// tap; a soft progress ring appears under the finger only after a moment of
// holding, and letting go (or sliding away) before 3 s resets it silently.

import { LONG_PRESS_MS, isLongPressComplete } from '../game/lock';
import { s } from './svg';

/** Movement allowed while holding before the press is cancelled. */
const MOVE_TOLERANCE_PX = 24;

export function attachHold(target: HTMLElement, onComplete: () => void): void {
  const ring = s('circle', { class: 'hold-ring', cx: 32, cy: 32, r: 26, pathLength: 100 });
  const overlay = s('svg', { viewBox: '0 0 64 64', class: 'hold-overlay', 'aria-hidden': 'true' }, ring);

  let pressedAt: number | null = null;
  let start = { x: 0, y: 0 };
  let raf = 0;

  const reset = () => {
    pressedAt = null;
    cancelAnimationFrame(raf);
    overlay.remove();
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

  target.classList.add('hold-target');
  target.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    e.preventDefault();
    target.setPointerCapture(e.pointerId);
    pressedAt = performance.now();
    start = { x: e.clientX, y: e.clientY };
    overlay.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
    document.body.append(overlay);
    raf = requestAnimationFrame(tick);
  });
  target.addEventListener('pointermove', (e) => {
    if (pressedAt !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) reset();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) target.addEventListener(ev, reset);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  reset();
}
