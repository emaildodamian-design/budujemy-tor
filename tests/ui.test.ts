// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Level, Placed } from '../src/game/level';
import { rotateCw, trayOrientation } from '../src/game/level';
import { UNLOCKED } from '../src/game/lock';
import { ALL_LEVELS, LEVELS, levelById } from '../src/game/levels';
import { EMPTY_BOOKMARK, type LevelResult, parseBookmark } from '../src/game/progress';
import { translator } from '../src/i18n';
import { SoftAudio } from '../src/platform/audio';
import { loadBookmark, loadLock, saveBookmark, saveLock } from '../src/platform/settings';
import { mountLevel, textNodes } from '../src/ui/game';
import { MIN_TILE, bottomBarWidth, tileSize } from '../src/ui/layout';
import { showParentMenu } from '../src/ui/parent';
import { depotRideScene, introScene } from '../src/ui/scenes';
import v2 from './fixtures/v2_levels.json';

const t = translator('pl');
const TILE = 64;
const V2 = (id: string) => (v2 as Level[]).find((l) => l.id === id)!;
const V3 = (id: string) => levelById(id)!;

function mockBoard(root: Element, level: Level) {
  const board = root.querySelector('svg.board') as SVGSVGElement;
  const cols = level.grid[0].length;
  const rows = level.grid.length;
  board.getBoundingClientRect = () => ({ left: 0, top: 100, width: cols * TILE, height: rows * TILE, right: cols * TILE, bottom: 100 + rows * TILE, x: 0, y: 100, toJSON() {} }) as DOMRect;
  return board;
}

function mount(level: Level, opts: { onSolved?: (r: LevelResult) => void; onEnd?: () => void } = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const stop = mountLevel(root, {
    t,
    audio: new SoftAudio(false),
    level,
    wagons: 4,
    onSolved: opts.onSolved ?? (() => {}),
    onEndSession: opts.onEnd ?? (() => {}),
  });
  return { root, board: mockBoard(root, level), stop, level };
}

const ptr = (el: Element, type: string, x = 0, y = 0) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
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
const go = (root: Element) => (root.querySelector('.go') as HTMLButtonElement).click();

/** Lay pieces on a free-rotation level: tray → cell, then tap until the orientation is right. */
function lay(root: Element, board: Element, pieces: readonly Placed[]) {
  for (const p of pieces) {
    tapTray(root, p.piece);
    tapCell(board, p.at[0], p.at[1]);
    let o = trayOrientation(p.piece);
    for (let i = 0; i < 4 && o !== p.openings; i++) {
      tapCell(board, p.at[0], p.at[1]);
      o = rotateCw(o);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('8. tiles are ≥ 56 px on a 360 × 640 phone (every level and sibling)', () => {
  it('6 × 7 is the largest board: 57 px across, 63 px down', () => {
    expect(MIN_TILE).toBe(56);
    expect(tileSize(6, 7, 360, 640)).toBe(57);
    expect(bottomBarWidth(4)).toBeLessThanOrEqual(360 - 16); // the tray stays usable with 4 piece kinds
  });
  for (const l of ALL_LEVELS) {
    it(l.id, () => {
      expect(tileSize(l.grid[0].length, l.grid.length, 360, 640)).toBeGreaterThanOrEqual(MIN_TILE);
      const kinds = new Set([...l.tray.map((x) => x.piece), ...(l.preplaced ?? []).map((p) => p.piece)]).size;
      expect(bottomBarWidth(kinds)).toBeLessThanOrEqual(360 - 16);
    });
  }
});

const onlyDigits = (root: Element) => {
  const texts = textNodes(root);
  for (const x of texts) expect(x).toMatch(/^\d$/);
  const inCounts = [...root.querySelectorAll('.tray-count')].map((e) => e.textContent);
  expect(texts).toEqual(inCounts);
};

describe('11. child-facing screens have no words (only tray count digits)', () => {
  for (const l of ALL_LEVELS) {
    it(`${l.id}: look phase, build phase, after a failed run`, async () => {
      const { root, stop } = mount(l);
      onlyDigits(root);
      await vi.advanceTimersByTimeAsync(5100);
      onlyDigits(root);
      go(root);
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
    const { root } = mount(V3('L04'));
    const ctl = root.querySelector('.pause-ctl')!;
    ptr(ctl, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector('.pause-overlay')).toBeNull();
    await vi.advanceTimersByTimeAsync(700);
    const overlay = root.querySelector('.pause-overlay')!;
    onlyDigits(overlay);
    expect(overlay.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('playing a level', () => {
  it('input waits for the 5 s look phase', async () => {
    const { root, board } = mount(V3('L01'));
    tapTray(root, 'straight');
    tapCell(board, 1, 3);
    expect(counts(root)).toEqual(['2', '3']);
    expect((root.querySelector('.go') as HTMLButtonElement).disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 3);
    expect(counts(root)).toEqual(['1', '3']);
  });

  it('tap-to-place, go, calm arrival → solved on the first run', async () => {
    const onSolved = vi.fn();
    const { root, board } = mount(V2('L03'), { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'curve');
    expect(root.querySelector('.tray-item.lifted')).not.toBeNull();
    tapCell(board, 1, 0);
    expect(counts(root)).toEqual(['0']);
    go(root);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: true, helped: false });
  });

  it('a failed run glows the break cell (never red), rests go for 3 s; lamp 1 on a short route glows the next cell', async () => {
    const onSolved = vi.fn();
    const { root, board } = mount(V2('L02'), { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 1);
    const goBtn = root.querySelector('.go') as HTMLButtonElement;
    goBtn.click();
    await vi.advanceTimersByTimeAsync(2500);
    expect(root.querySelector('.break-mark')).not.toBeNull();
    expect(goBtn.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(goBtn.disabled).toBe(false);
    const lamp = root.querySelector('.lamp') as HTMLButtonElement;
    lamp.click();
    expect(root.querySelector('.lamp.armed')).not.toBeNull();
    expect(root.querySelector('.hint-mark')).toBeNull();
    lamp.click();
    expect(root.querySelector('.hint-mark')!.getAttribute('x')).toBe(String(2 * 100 + 5));
    expect(root.querySelector('.half-flag-g')).toBeNull();
    tapTray(root, 'straight');
    tapCell(board, 2, 1);
    goBtn.click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: false, helped: false });
  });

  it('lamp 1 plants a flag on the halfway cell; lamp 2 glows the next cell, pulses the tray piece and outlines the piece', async () => {
    const l = V3('L05');
    const { root } = mount(l);
    await vi.advanceTimersByTimeAsync(5000);
    const lampClick = () => (root.querySelector('.lamp:not(.used)') as HTMLButtonElement).click();
    lampClick();
    lampClick();
    const flag = root.querySelector('.half-flag-g')!;
    const half = l.solution[Math.floor(l.solution.length / 2)];
    expect(flag.getAttribute('transform')).toBe(`translate(${half.at[0] * 100} ${half.at[1] * 100})`);
    expect(root.querySelector('.hint-mark')).toBeNull();
    lampClick();
    lampClick();
    const first = l.solution[0];
    expect(root.querySelector('.hint-mark')!.getAttribute('x')).toBe(String(first.at[0] * 100 + 5));
    expect(root.querySelector(`.tray-item.hinted[data-kind="${first.piece}"]`)).not.toBeNull();
    const outline = root.querySelector('.hint-piece')!;
    expect(outline.getAttribute('transform')).toBe(`translate(${first.at[0] * 100} ${first.at[1] * 100})`);
    // Hints never touch the player's pieces.
    expect(root.querySelectorAll('svg.board .piece.movable')).toHaveLength(0);
  });

  it('dropping on a movable piece swaps; tapping a piece turns it; holding it returns it', async () => {
    const { root, board } = mount(V2('L04'));
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 1, 0);
    expect(counts(root)).toEqual(['2', '2']);
    tapTray(root, 'curve');
    tapCell(board, 1, 0);
    expect(counts(root)).toEqual(['3', '1']);
    ptr(board, 'pointerdown', TILE * 1.5, 100 + TILE / 2);
    await vi.advanceTimersByTimeAsync(600);
    ptr(board, 'pointerup', TILE * 1.5, 100 + TILE / 2);
    expect(counts(root)).toEqual(['3', '2']);
  });

  it('free rotation: pieces arrive in their tray orientation and a tap turns them 90°', async () => {
    const { root, board } = mount(V2('L31'));
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'curve');
    tapCell(board, 1, 0);
    const before = root.querySelector('.piece.movable')!.innerHTML;
    tapCell(board, 1, 0);
    expect(root.querySelector('.piece.movable')!.innerHTML).not.toBe(before);
  });

  it('strict placement: a piece on the wrong terrain floats back', async () => {
    const { root, board } = mount(V2('L10'));
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'straight');
    tapCell(board, 0, 1);
    expect(counts(root)).toEqual(['2', '1', '1']);
    expect(root.querySelector('.tray-item.lifted')).toBeNull();
  });

  it('stuck ladder: offer, halfway flag, then ghost path of all but the last piece (marked helped)', async () => {
    const onSolved = vi.fn();
    const l = V2('L07');
    const { root, board } = mount(l, { onSolved });
    await vi.advanceTimersByTimeAsync(5000);
    const runOnce = async () => {
      go(root);
      await vi.advanceTimersByTimeAsync(6000);
    };
    await runOnce();
    await runOnce(); // stuck 1
    await runOnce(); // stuck 2: the lamp pulses once
    expect(root.querySelector('.helper.offer')).not.toBeNull();
    await runOnce(); // stuck 3: the halfway flag
    expect(root.querySelector('.half-flag-g')).not.toBeNull();
    expect(root.querySelectorAll('.ghost-piece')).toHaveLength(0);
    await runOnce(); // stuck 4: ghost path, all but the final piece
    expect(root.querySelectorAll('.ghost-piece').length).toBe(l.solution.length - 1);
    for (const p of l.solution.slice(0, -1)) tapCell(board, p.at[0], p.at[1]);
    expect(root.querySelectorAll('.ghost-piece')).toHaveLength(0);
    const last = l.solution.at(-1)!;
    tapTray(root, last.piece);
    tapCell(board, last.at[0], last.at[1]);
    go(root);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onSolved).toHaveBeenCalledWith({ clean: false, helped: true });
  });

  it('stuck 3 after the flag was shown gives the second-lamp hint', async () => {
    const { root } = mount(V2('L07'));
    await vi.advanceTimersByTimeAsync(5000);
    const lamp = () => (root.querySelector('.lamp:not(.used)') as HTMLButtonElement).click();
    lamp();
    lamp(); // flag shown
    for (let i = 0; i < 4; i++) {
      go(root);
      await vi.advanceTimersByTimeAsync(6000);
    }
    expect(root.querySelector('.hint-piece')).not.toBeNull();
    expect(root.querySelector('.tray-item.hinted')).not.toBeNull();
  });

  it('intro levels: after 10 s with no correct piece, only the introduced element glows (no piece hint, no lamp)', async () => {
    const l = V3('L07'); // bridge intro
    const { root } = mount(l);
    await vi.advanceTimersByTimeAsync(5000 + 9000);
    expect(root.querySelector('.intro-glow')).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    const glows = [...root.querySelectorAll('.intro-glow')];
    const rivers = l.grid.join('').split('~').length - 1;
    expect(glows).toHaveLength(rivers);
    expect(root.querySelector('.hint-mark')).toBeNull();
    expect(root.querySelector('.tray-item.hinted')).toBeNull();
    expect(root.querySelectorAll('.lamp.used')).toHaveLength(0);
    // The arrow intro glows the arrow; the order intro the first station.
    for (const [id, what] of [['L31', 'oneWay'], ['L37', 'order']] as const) {
      const m = mount(V3(id));
      await vi.advanceTimersByTimeAsync(15_100);
      const g = m.root.querySelectorAll('.intro-glow');
      expect(g.length, id).toBe(what === 'oneWay' ? V3(id).fixed!.filter((p) => p.oneWay).length : 1);
      m.stop();
    }
  });

  it('pause → end session: onEndSession, nothing solved', async () => {
    const onEnd = vi.fn();
    const onSolved = vi.fn();
    const { root } = mount(V3('L05'), { onEnd, onSolved });
    ptr(root.querySelector('.pause-ctl')!, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(1600);
    const [, end] = root.querySelectorAll('.pause-overlay button');
    (end as HTMLButtonElement).click();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onSolved).not.toHaveBeenCalled();
  });
});

describe('every stop shows its cause', () => {
  const tiny = (grid: string[], extra: Partial<Level>): Level => ({
    id: 'L99',
    chapter: 6,
    kind: 'practice',
    grid,
    start: { exit: 'E' },
    depot: { entry: 'W' },
    tray: [{ piece: 'straight', count: 2 }],
    rotate: 'free',
    placement: 'free',
    solution: [],
    ...extra,
  });
  const runAndWait = async (root: Element) => {
    go(root);
    await vi.advanceTimersByTimeAsync(3000);
  };

  it('wrong side of the depot: the depot door glows', async () => {
    const { root } = mount(tiny(['A.', '.B'], { depot: { entry: 'N' }, fixed: [{ at: [1, 0], piece: 'curve', openings: 'SW' }], tray: [{ piece: 'straight', count: 1 }] }));
    await vi.advanceTimersByTimeAsync(5000);
    await runAndWait(root);
    expect(root.querySelector('.roof.door-glow')).toBeNull(); // this one works: enters from N
    const bad = mount(tiny(['A.', '.B'], { depot: { entry: 'W' }, fixed: [{ at: [1, 0], piece: 'curve', openings: 'SW' }] }));
    await vi.advanceTimersByTimeAsync(5000);
    await runAndWait(bad.root);
    expect(bad.root.querySelector('.roof.door-glow')).not.toBeNull();
  });

  it('wrongWay: the arrow pulses', async () => {
    const { root } = mount(tiny(['A.B'], { tray: [], fixed: [{ at: [1, 0], piece: 'straight', openings: 'EW', oneWay: 'W' }] }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.querySelector('.one-way')).not.toBeNull();
    await runAndWait(root);
    expect(root.querySelector('.one-way.pulse')).not.toBeNull();
  });

  it('wrongOrder and missedStation: the station dots pulse', async () => {
    const l = tiny(['AS.SB'], {
      stations: [
        { at: [1, 0], openings: 'EW', order: 2 },
        { at: [3, 0], openings: 'EW', order: 1 },
      ],
      tray: [{ piece: 'straight', count: 1 }],
    });
    const { root } = mount(l);
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.querySelectorAll('.order-dot')).toHaveLength(3);
    await runAndWait(root);
    expect(root.querySelectorAll('.order-dots.pulse')).toHaveLength(2);
  });

  it('a gap before a river with no bridge left: the empty bridge slot pulses', async () => {
    const l = tiny(['A.~.B'], { tray: [{ piece: 'straight', count: 2 }, { piece: 'bridge', count: 1 }], fixed: [] });
    const { root, board } = mount(l);
    await vi.advanceTimersByTimeAsync(5000);
    tapTray(root, 'bridge');
    tapCell(board, 3, 0); // the bridge used up in the wrong place
    tapTray(root, 'straight');
    tapCell(board, 1, 0);
    await runAndWait(root);
    expect(root.querySelector('.tray-item.empty.need[data-kind="bridge"]')).not.toBeNull();
  });
});

describe('parent menu and preview', () => {
  const KEYS = ['budujemy-tor:settings', 'budujemy-tor:lock', 'budujemy-tor:bookmark'];
  const snapshot = () => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  function seed() {
    localStorage.setItem(KEYS[0], JSON.stringify({ lang: 'pl', sound: false, card: 'walk' }));
    localStorage.setItem(KEYS[1], JSON.stringify({ lastEndedDay: '2026-09-26' }));
    saveBookmark({ ...EMPTY_BOOKMARK, next: 9, sessions: 4, solvedSelf: ['L01', 'L02'], helped: ['L05'], recent: [true, false], lastEndedDay: '2026-09-26' });
  }
  function open(canUnlock: boolean) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const onUnlock = vi.fn(() => saveLock(UNLOCKED));
    const onBack = vi.fn();
    const stop = showParentMenu({ root, t, audio: new SoftAudio(false), canUnlock, onUnlock, onBack, loadBookmark, saveBookmark });
    return { root, onUnlock, onBack, stop };
  }
  const click = (root: Element, sel: string) => (root.querySelector(sel) as HTMLElement).click();

  it('5. preview isolation: play, solve and fail three levels, show a solution, exit → storage byte-identical', async () => {
    seed();
    const before = snapshot();
    const { root, onBack } = open(true);
    click(root, '.parent-preview');
    expect(root.querySelectorAll('.preview-item').length).toBe(ALL_LEVELS.length);
    click(root, '.preview-item[data-id="L04"]');
    for (const id of ['L04', 'L05', 'L06']) {
      const level = V3(id);
      expect(root.querySelector('.preview-badge')!.textContent).toContain(id);
      // Words only in the parent bar.
      const bar = root.querySelector('.preview-bar')!;
      const texts = textNodes(root).filter((x) => !textNodes(bar).includes(x));
      for (const x of texts) expect(x).toMatch(/^\d$/);
      const board = mockBoard(root, level);
      await vi.advanceTimersByTimeAsync(5000);
      go(root); // fail: an empty board
      await vi.advanceTimersByTimeAsync(4000);
      expect(root.querySelector('.break-mark')).not.toBeNull();
      click(root, '.preview-solution');
      expect(root.querySelectorAll('.solution-ghost').length).toBe(level.solution.length);
      click(root, '.preview-solution');
      lay(root, board, level.solution);
      go(root);
      await vi.advanceTimersByTimeAsync(20_000); // solved → the sandbox restarts the level
      expect(root.querySelector('.preview-badge')!.textContent).toContain(id);
      click(root, '.preview-next');
    }
    click(root, '.preview-exit');
    click(root, '.parent-back');
    click(root, '.parent-back');
    expect(onBack).toHaveBeenCalledOnce();
    expect(snapshot()).toBe(before);
    expect(loadLock()).toEqual({ lastEndedDay: '2026-09-26' });
  });

  it('"Ustaw jako następny" (3 s hold) changes only next and recent', async () => {
    seed();
    const before = parseBookmark(localStorage.getItem(KEYS[2]));
    const lockBefore = localStorage.getItem(KEYS[1]);
    const { root } = open(false);
    click(root, '.parent-preview');
    const btn = root.querySelector('.set-next[data-id="L20"]')!;
    ptr(btn, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(1000);
    ptr(btn, 'pointerup', 5, 5); // too short: nothing
    expect(parseBookmark(localStorage.getItem(KEYS[2]))).toEqual(before);
    ptr(root.querySelector('.set-next[data-id="L20"]')!, 'pointerdown', 5, 5);
    await vi.advanceTimersByTimeAsync(3100);
    const after = parseBookmark(localStorage.getItem(KEYS[2]));
    expect(after).toEqual({ ...before, next: 19, recent: [] });
    expect(localStorage.getItem(KEYS[1])).toBe(lockBefore);
    expect(root.querySelector('.preview-item[data-id="L20"] .preview-marks')!.textContent).toContain(t('markNext'));
  });

  it('6. [Odblokuj dziś] is the v2 override; [Wróć] and preview exit leave the lock on', () => {
    seed();
    let m = open(true);
    click(m.root, '.parent-back');
    expect(m.onBack).toHaveBeenCalledOnce();
    expect(loadLock()).toEqual({ lastEndedDay: '2026-09-26' });
    m = open(true);
    click(m.root, '.parent-preview');
    click(m.root, '.preview-item[data-id="L10"]');
    click(m.root, '.preview-exit');
    click(m.root, '.parent-back');
    click(m.root, '.parent-back');
    expect(loadLock()).toEqual({ lastEndedDay: '2026-09-26' });
    // No unlock from the setup screen menu.
    m = open(false);
    expect(m.root.querySelector('.parent-unlock')).toBeNull();
    m = open(true);
    click(m.root, '.parent-unlock');
    expect(m.onUnlock).toHaveBeenCalledOnce();
    expect(loadLock()).toEqual(UNLOCKED);
  });

  it('the preview list shows every level with its measured difficulty and marks', () => {
    seed();
    const { root } = open(false);
    click(root, '.parent-preview');
    const item = root.querySelector('.preview-item[data-id="L01"]')!;
    expect(item.textContent).toMatch(/5×4 · min 5 · \+0 · plan 2 · objazd 2 · rozw\. 1/);
    expect(item.textContent).toContain(t('markSolved'));
    expect(root.querySelector('.preview-item[data-id="L05"]')!.textContent).toContain(t('markHelped'));
    expect(root.querySelector('.preview-item[data-id="L10"]')!.textContent).toContain(t('markNext'));
    expect(root.querySelectorAll('.preview-chapter')).toHaveLength(8);
    expect(root.querySelectorAll('.set-next')).toHaveLength(LEVELS.length);
  });
});
