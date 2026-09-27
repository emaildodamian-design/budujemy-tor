// @vitest-environment happy-dom
// v4 sessions: N new puzzles from the bookmark (no warm-up), then the depot ride, END and the
// next-day lock; the v3 bookmark and the lock format are untouched; the 2–5 setting; preview
// isolation. The app shell (src/main.ts) is driven through the same taps a family makes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVELS_V4 } from '../src/game/levels4';
import { dayKey } from '../src/game/lock';
import { solutionOf, parseProgram } from '../src/game/program';
import { EMPTY_BOOKMARK4, finishPuzzle4, parseBookmark4, parsePuzzles, setNextLevel4, startSession4 } from '../src/game/session4';
import { translator } from '../src/i18n';
import { SoftAudio } from '../src/platform/audio';
import { BOOKMARK4_KEY, loadBookmark, parseSettings, saveBookmark } from '../src/platform/settings';
import { showParentMenu } from '../src/ui/parent';
import { click, enterProgram, programOf, runBtn } from './ui4';

const KEYS = { settings: 'budujemy-tor:settings', lock: 'budujemy-tor:lock', v3: 'budujemy-tor:bookmark', v4: BOOKMARK4_KEY };
const NOW = new Date(2026, 8, 27, 17, 0, 0);
const snapshot = () => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const byId = (id: string) => LEVELS_V4.find((l) => l.id === id)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});

describe('session model (pure)', () => {
  it('session 1: P01, P02, P03 in order, no warm-up', () => {
    let bm = { ...EMPTY_BOOKMARK4 };
    let run = startSession4(LEVELS_V4, bm, '2026-09-27');
    const served: string[] = [];
    for (;;) {
      served.push(run.current.id);
      const r = finishPuzzle4(LEVELS_V4, bm, run, { helped: served.length === 2 });
      bm = r.bm;
      run = r.run;
      if (r.over) break;
    }
    expect(served).toEqual(['P01', 'P02', 'P03']);
    expect(bm).toEqual({ levelSet: 4, next: 3, solved: ['P01', 'P02', 'P03'], helped: ['P02'] });
  });

  it('N new puzzles from the bookmark, N = 2–5', () => {
    for (const n of [2, 3, 4, 5] as const) {
      let bm = { ...EMPTY_BOOKMARK4, next: 10 };
      let run = startSession4(LEVELS_V4, bm, 'd', n);
      const served = [run.current.id];
      for (;;) {
        const r = finishPuzzle4(LEVELS_V4, bm, run, { helped: false });
        bm = r.bm;
        run = r.run;
        if (r.over) break;
        served.push(run.current.id);
      }
      expect(served).toEqual(LEVELS_V4.slice(10, 10 + n).map((l) => l.id));
      expect(bm.next).toBe(10 + n);
    }
  });

  it('after P40: replays of solved levels, the bookmark stays put', () => {
    const bm = { ...EMPTY_BOOKMARK4, next: 40, solved: LEVELS_V4.map((l) => l.id) };
    const run = startSession4(LEVELS_V4, bm, '2026-10-01');
    expect(run.current.index).toBeUndefined();
    expect(finishPuzzle4(LEVELS_V4, bm, run, { helped: true }).bm).toEqual(bm);
  });

  it('parsing: garbage and other level sets start fresh; the 2–5 setting defaults to 3', () => {
    expect(parseBookmark4(null)).toEqual(EMPTY_BOOKMARK4);
    expect(parseBookmark4('{oops')).toEqual(EMPTY_BOOKMARK4);
    expect(parseBookmark4('{"levelSet":3,"next":9}')).toEqual(EMPTY_BOOKMARK4);
    expect(parseBookmark4('{"levelSet":4,"next":7,"solved":["P01",2],"helped":"x"}')).toEqual({ levelSet: 4, next: 7, solved: ['P01'], helped: [] });
    expect(setNextLevel4({ ...EMPTY_BOOKMARK4, solved: ['P01'] }, 12)).toEqual({ ...EMPTY_BOOKMARK4, solved: ['P01'], next: 12 });
    expect([parsePuzzles(undefined), parsePuzzles(7), parsePuzzles(2), parsePuzzles(5)]).toEqual([3, 3, 2, 5]);
    expect(parseSettings('{"puzzles":4}').puzzles).toBe(4);
    expect(parseSettings(null).puzzles).toBe(3);
  });
});

// ---------- the app shell ----------

async function boot() {
  await import('../src/main');
  await vi.advanceTimersByTimeAsync(50);
}
const app = () => document.getElementById('app')!;
const levelOnScreen = () => app().querySelector('.screen.prog')?.getAttribute('data-level');

async function holdStart() {
  const btn = app().querySelector('.hold-start')!;
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1, isPrimary: true }));
  await vi.advanceTimersByTimeAsync(1700);
  expect(app().querySelector('.intro-scene')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(3600);
}

async function solveOnScreen(id: string) {
  const l = byId(id);
  expect(levelOnScreen()).toBe(id);
  expect(runBtn(app()).disabled).toBe(true); // Run needs a full program
  enterProgram(app(), l, solutionOf(l));
  click(runBtn(app()));
  await vi.advanceTimersByTimeAsync(40_000);
}

describe('the app: a first session at 360 × 640', () => {
  it('serves P01–P03 with no warm-up; a failed run keeps the program; then the ride, END and the lock', async () => {
    const v3 = JSON.stringify({ levelSet: 3, next: 9, solvedSelf: ['L01'], helped: [], requeue: [], sessions: 4, lastEndedDay: '2026-09-20', recent: [], log: [], stepDown: false });
    localStorage.setItem(KEYS.v3, v3);
    await boot();
    expect(app().querySelector('.screen.setup')).not.toBeNull();
    await holdStart();
    // P01: first a wrong program. The run stops, the program stays; then the player fixes it.
    const p01 = byId('P01');
    expect(levelOnScreen()).toBe('P01');
    expect(runBtn(app()).disabled).toBe(true);
    enterProgram(app(), p01, parseProgram('E E N N N W N'));
    click(runBtn(app()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(levelOnScreen()).toBe('P01');
    expect(programOf(app())).toBe('E E N N N W N');
    expect(app().querySelector('.slot.culprit')).not.toBeNull();
    // Take out the whole program (the player's taps), then type the solution.
    for (let i = 6; i >= 0; i--) {
      click(app().querySelector(`.slot[data-row="main"][data-i="${i}"]`));
      click(app().querySelector(`.slot[data-row="main"][data-i="${i}"] .take-out`));
    }
    expect(programOf(app())).toBe('_ _ _ _ _ _ _');
    expect(localStorage.getItem(KEYS.lock)).toBeNull();
    enterProgram(app(), p01, solutionOf(p01));
    click(runBtn(app()));
    await vi.advanceTimersByTimeAsync(40_000);
    await solveOnScreen('P02');
    expect(localStorage.getItem(KEYS.lock)).toBeNull(); // the lock comes only at the end
    // P03: solved, then the slow depot ride, then END.
    const p03 = byId('P03');
    expect(levelOnScreen()).toBe('P03');
    enterProgram(app(), p03, solutionOf(p03));
    click(runBtn(app()));
    let rode = false;
    for (let k = 0; k < 80 && !app().querySelector('.screen.end'); k++) {
      await vi.advanceTimersByTimeAsync(250);
      rode ||= !!app().querySelector('.depot-scene');
    }
    expect(rode).toBe(true);
    expect(app().querySelector('.screen.end')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(KEYS.lock)!)).toEqual({ lastEndedDay: dayKey(NOW) });
    expect(JSON.parse(localStorage.getItem(KEYS.v4)!)).toEqual({ levelSet: 4, next: 3, solved: ['P01', 'P02', 'P03'], helped: [] });
    expect(localStorage.getItem(KEYS.v3)).toBe(v3); // the v3 bookmark is untouched
    // Opening the app again today: locked.
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    await boot();
    expect(app().querySelector('.screen.locked')).not.toBeNull();
    // Tomorrow: open again, and the next session starts at P04.
    vi.setSystemTime(new Date(2026, 8, 28, 17, 0, 0));
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    await boot();
    expect(app().querySelector('.screen.setup')).not.toBeNull();
    await holdStart();
    expect(levelOnScreen()).toBe('P04');
  });

  it('the parent setting: 2 puzzles per session (chosen on the setup screen)', async () => {
    await boot();
    click(app().querySelector('.puzzles-2'));
    expect(JSON.parse(localStorage.getItem(KEYS.settings)!).puzzles).toBe(2);
    click(app().querySelector('.puzzles-5'));
    click(app().querySelector('.puzzles-2'));
    await holdStart();
    await solveOnScreen('P01');
    await solveOnScreen('P02');
    await vi.advanceTimersByTimeAsync(6000);
    expect(app().querySelector('.screen.end')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(KEYS.v4)!).next).toBe(2);
  });

  it('pause → end: the puzzle in progress is not counted, and the lock follows', async () => {
    localStorage.setItem(KEYS.v4, JSON.stringify({ levelSet: 4, next: 5, solved: [], helped: [] }));
    await boot();
    await holdStart();
    expect(levelOnScreen()).toBe('P06');
    const ctl = app().querySelector('.pause-ctl')!;
    ctl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1, isPrimary: true }));
    await vi.advanceTimersByTimeAsync(1700);
    click(app().querySelectorAll('.pause-overlay button')[1]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(app().querySelector('.screen.end')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(KEYS.v4)!).next).toBe(5);
    expect(JSON.parse(localStorage.getItem(KEYS.lock)!)).toEqual({ lastEndedDay: dayKey(NOW) });
  });
});

describe('parent preview (v4)', () => {
  const t = translator('pl');
  function seed() {
    localStorage.setItem(KEYS.settings, JSON.stringify({ lang: 'pl', sound: false, card: 'walk', puzzles: 3 }));
    localStorage.setItem(KEYS.lock, JSON.stringify({ lastEndedDay: '2026-09-26' }));
    saveBookmark({ ...(loadBookmark()), next: 9 });
    localStorage.setItem(KEYS.v4, JSON.stringify({ levelSet: 4, next: 6, solved: ['P01', 'P02'], helped: ['P02'] }));
  }
  function open() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    showParentMenu({ root, t, audio: new SoftAudio(false), canUnlock: true, onUnlock: vi.fn(), onBack: vi.fn(), loadBookmark, saveBookmark });
    return root;
  }

  it('play, solve and fail levels, show a solution, exit → storage byte-identical', async () => {
    seed();
    const before = snapshot();
    const root = open();
    click(root.querySelector('.parent-preview4'));
    expect(root.querySelectorAll('.preview4-item')).toHaveLength(40);
    expect(root.querySelectorAll('.preview4-chapter')).toHaveLength(8);
    expect(root.querySelector('.preview4-item[data-id="P02"]')!.textContent).toContain(t('lampUsed'));
    expect(root.querySelector('.preview4-item[data-id="P07"]')!.textContent).toContain(t('markNext'));
    click(root.querySelector('.preview4-item[data-id="P06"]'));
    for (const id of ['P06', 'P07']) {
      const l = byId(id);
      expect(root.querySelector('.preview-badge')!.textContent).toContain(id);
      enterProgram(root, l, solutionOf(l));
      click(runBtn(root));
      await vi.advanceTimersByTimeAsync(40_000); // solved → the sandbox restarts the level
      expect(programOf(root)).not.toBe(l.solution);
      click(root.querySelector('.preview-solution'));
      expect(programOf(root)).toBe(l.solution);
      click(root.querySelector('.lamp4'));
      click(root.querySelector('.lamp4'));
      click(root.querySelector('.preview-next'));
    }
    click(root.querySelector('.preview-exit'));
    click(root.querySelector('.parent-back'));
    // The v3 section is still there.
    click(root.querySelector('.parent-preview'));
    expect(root.querySelectorAll('.preview-item[data-id^="L"]').length).toBeGreaterThan(48);
    expect(snapshot()).toBe(before);
  });

  it('"Ustaw jako następny" (3 s hold) changes only the v4 next', async () => {
    seed();
    const v3 = localStorage.getItem(KEYS.v3);
    const lock = localStorage.getItem(KEYS.lock);
    const root = open();
    click(root.querySelector('.parent-preview4'));
    const btn = root.querySelector('.set-next4[data-id="P20"]')!;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1, isPrimary: true }));
    await vi.advanceTimersByTimeAsync(3100);
    expect(JSON.parse(localStorage.getItem(KEYS.v4)!)).toEqual({ levelSet: 4, next: 19, solved: ['P01', 'P02'], helped: ['P02'] });
    expect(localStorage.getItem(KEYS.v3)).toBe(v3);
    expect(localStorage.getItem(KEYS.lock)).toBe(lock);
  });
});
