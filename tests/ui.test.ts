// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, levelById } from '../src/game/levels';
import type { LevelResult } from '../src/game/progress';
import { translator } from '../src/i18n';
import { SoftAudio } from '../src/platform/audio';
import { mountLevel, textNodes } from '../src/ui/game';
import { MIN_TILE, bottomBarWidth, tileSize } from '../src/ui/layout';
import { depotRideScene, introScene } from '../src/ui/scenes';

const t = translator('pl');
const TILE = 64;

function mount(id: string, opts: { onSolved?: (r: LevelResult) => void; onEnd?: () => void } = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const level = levelById(id)!;
  const stop = mountLevel(root, {
    t,
    audio: new SoftAudio(false),
    level,
    wagons: 4,
    onSolved: opts.onSolved ?? (() => {}),
    onEndSession: opts.onEnd ?? (() => {}),
  });
  const board = root.querySelector('svg.board') as SVGSVGElement;
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  board.getBoundingClientRect = () => ({ left: 0, top: 100, width: cols * TILE, height: rows * TILE, right: cols * TILE, bottom: 100 + rows * TILE, x: 0, y: 100, toJSON() {} }) as DOMRect;
  return { root, board, stop, level };
}

const ptr = (el: Element, type: string, x = 0, y = 0) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
/** Tap on board cell (x, y). */
const tapCell = (board: Element, x: number, y: number) => {
  const cx = x * TILE + TILE / 2;
  const cy = 100 + y * TILE + TILE / 2;
  ptr(board, 'pointerdown', cx, cy);
  ptr(board, 'pointerup', cx, cy);
};
const tapTray = (root: Element, kind: string) => {
  const el = root.querySelector(`.tray-item[data-kind="${kind}"]`)!;
  ptr(el, 'pointerdown', 5, 5);
  ptr(el, 'pointerup', 5, 5);
};
const counts = (root: Element) => [...root.querySelectorAll('.tray-count')].map((e) => e.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('13. tiles are ≥ 64 px on a 360 × 640 phone', () => {
  for (const l of LEVELS) {
    it(l.id, () => {
      expect(tileSize(l.grid[0].length, l.grid.length, 360, 640)).toBeGreaterThanOrEqual(MIN_TILE);
      const kinds = new Set([...l.tray.map((x) => x.piece), ...(l.preplaced ?? []).map((p) => p.piece)]).size;
      expect(bottomBarWidth(kinds)).toBeLessThanOrEqual(360 - 16);
    });
  }
});

describe('11. child-facing screens have no words (only tray count digits)', () => {
  const onlyDigits = (root: Element) => {
    const texts = textNodes(root);
    for (const x of texts) expect(x).toMatch(/^\d$/);
    const inCounts = [...root.querySelectorAll('.tray-count')].map((e) => e.textContent);
    expect(texts).toEqual(inCounts);
  };

  for (const l of LEVELS) {
    it(`${l.id}: look phase, build phase, after a failed run, pause screen`, async () => {
      const { root, stop } = mount(l.id);
      onlyDigits(root);
      await vi.advanceTimersByTimeAsync(5100);
      onlyDigits(root);
      (root.querySelector('.go') as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(30_000);
      onlyDigits(root);
      stop();
    });
  }

  it('the intro picture and the depot ride', () => {
    const a = introScene('bath', null, () => {});
    onlyDigits(a.el);
    a.stop();
    const b = depotRideScene(() => {});
    onlyDigits(b.el);
    b.stop();
  });

  it('the pause screen (parent long-press on the corner control, 1.5 s)', async () => {
    const { root } = mount('L04');
    const ctl = root.querySelector('.pause-ctl')!;
    ptr(ctl, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector('.pause-overlay')).toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    const overlay = root.querySelector('.pause-overlay')!;
    expect(overlay).not.toBeNull();
    onlyDigits(overlay);
    expect(overlay.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('playing a level', () => {
  it('input waits for the 5 s look phase', async () => {
    const { root, board } = mount('L01');
    tapTray(root, 'straight');
    tapCell(board, 1, 1);
    expect(counts(root)).toEqual(['1']);
    expect((root.querySelector('.go') as HTMLButtonElement).disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 1);
    expect(counts(root)).toEqual(['0']);
  });

  it('tap-to-place, go, calm arrival → solved on the first run', async () => {
    const onSolved = vi.fn();
    const { root, board } = mount('L03', { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'curve');
    expect(root.querySelector('.tray-item.lifted')).not.toBeNull();
    tapCell(board, 1, 0);
    expect(counts(root)).toEqual(['0']);
    (root.querySelector('.go') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: true, helped: false });
  });

  it('a failed run glows the break cell (never red), rests go for 3 s, and the lamps give hints', async () => {
    const onSolved = vi.fn();
    const { root, board } = mount('L02', { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 1);
    const go = root.querySelector('.go') as HTMLButtonElement;
    go.click();
    await vi.advanceTimersByTimeAsync(2500);
    expect(root.querySelector('.break-mark')).not.toBeNull();
    expect(go.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(go.disabled).toBe(false);
    // Lamp: first tap arms (moves onto the avatar), second shows the hint cell.
    const lamp = root.querySelector('.lamp') as HTMLButtonElement;
    lamp.click();
    expect(root.querySelector('.lamp.armed')).not.toBeNull();
    expect(root.querySelector('.hint-mark')).toBeNull();
    lamp.click();
    const mark = root.querySelector('.hint-mark')!;
    expect(mark.getAttribute('x')).toBe(String(2 * 100 + 5));
    tapTray(root, 'straight');
    tapCell(board, 2, 1);
    go.click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: false, helped: false });
  });

  it('dropping on a movable piece swaps; tapping a piece turns it; holding it returns it', async () => {
    const { root, board } = mount('L04');
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 0);
    expect(counts(root)).toEqual(['2', '2']);
    tapTray(root, 'curve');
    tapCell(board, 1, 0); // swap: the straight floats back
    expect(counts(root)).toEqual(['3', '1']);
    ptr(board, 'pointerdown', TILE * 1.5, 100 + TILE / 2);
    await vi.advanceTimersByTimeAsync(600);
    ptr(board, 'pointerup', TILE * 1.5, 100 + TILE / 2);
    expect(counts(root)).toEqual(['3', '2']);
  });

  it('free rotation: pieces arrive in their tray orientation and a tap turns them 90°', async () => {
    const { root, board } = mount('L31');
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'curve');
    tapCell(board, 1, 0);
    const before = root.querySelector('.piece.movable')!.innerHTML;
    tapCell(board, 1, 0);
    expect(root.querySelector('.piece.movable')!.innerHTML).not.toBe(before);
  });

  it('strict placement: a piece on the wrong terrain floats back', async () => {
    const { root, board } = mount('L10');
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 0, 1); // river
    expect(counts(root)).toEqual(['2', '1', '1']);
    expect(root.querySelector('.tray-item.lifted')).toBeNull();
  });

  it('stuck ladder: repeated runs that get no further → offer, hint cell, then ghost path (marked helped)', async () => {
    const onSolved = vi.fn();
    const { root, board } = mount('L07', { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    const go = root.querySelector('.go') as HTMLButtonElement;
    const runOnce = async () => {
      go.click();
      await vi.advanceTimersByTimeAsync(6000);
    };
    await runOnce(); // first run: best so far (0 cells)
    await runOnce(); // stuck 1
    await runOnce(); // stuck 2: the lamp pulses once
    expect(root.querySelector('.helper.offer')).not.toBeNull();
    await runOnce(); // stuck 3: the app shows the hint cell
    expect(root.querySelector('.hint-mark')).not.toBeNull();
    expect(root.querySelectorAll('.ghost-piece')).toHaveLength(0);
    await runOnce(); // stuck 4: ghost path, all but the final piece
    const ghosts = root.querySelectorAll('.ghost-piece');
    expect(ghosts.length).toBe(levelById('L07')!.solution.length - 1);
    // Tap each ghost, lay the last piece by hand, run.
    const sol = levelById('L07')!.solution;
    for (const p of sol.slice(0, -1)) tapCell(board, p.at[0], p.at[1]);
    expect(root.querySelectorAll('.ghost-piece')).toHaveLength(0);
    const last = sol.at(-1)!;
    tapTray(root, last.piece);
    tapCell(board, last.at[0], last.at[1]);
    if (root.querySelector('.go')) go.click();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: false, helped: true });
  });

  it('intro levels: the lamp-2 hint appears by itself 10 s after the look phase', async () => {
    const { root } = mount('L09');
    await vi.advanceTimersByTimeAsync(5000 + 9000);
    expect(root.querySelector('.hint-mark')).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    expect(root.querySelector('.hint-mark')).not.toBeNull();
    expect(root.querySelector('.tray-item.hinted')).not.toBeNull();
    expect(root.querySelectorAll('.lamp.used')).toHaveLength(0); // no lamp consumed
  });

  it('pause → end session: onEndSession, nothing solved', async () => {
    const onEnd = vi.fn();
    const onSolved = vi.fn();
    const { root } = mount('L05', { onEnd, onSolved });
    ptr(root.querySelector('.pause-ctl')!, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(1600);
    const [, end] = root.querySelectorAll('.pause-overlay button');
    (end as HTMLButtonElement).click();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onSolved).not.toHaveBeenCalled();
  });
});
