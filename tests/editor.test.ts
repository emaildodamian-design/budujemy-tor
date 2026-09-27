// @vitest-environment happy-dom
// The v4 puzzle screen: fill-to-run, the player's program is never changed by the app, a failed
// run keeps the program and glows the command, wordless DOM, layout at 360 × 640.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Tile, boxesOf, canGrow, canShrink, canTakeOut, commandsOf, cycleCount, firstHole, grow, initialProgram, place, shrink, takeOut } from '../src/game/edit';
import { LEVELS_V4 } from '../src/game/levels4';
import { type ProgLevel, type Program, canRun, formatProgram, movesOf, parseProgram, rowCost, runProgram, solutionOf, solutionRoute } from '../src/game/program';
import { translator } from '../src/i18n';
import { SoftAudio } from '../src/platform/audio';
import { mountPuzzle, paletteOf } from '../src/ui/editor';
import { textNodes } from '../src/ui/game';
import { MIN_PAL4, MIN_SLOT4, MIN_TILE4, editorLayout } from '../src/ui/layout4';
import { seeded } from './helpers';
import { click, enterProgram, programOf, runBtn, slotEl, tileEl } from './ui4';

const t = translator('pl');
const byId = (id: string) => LEVELS_V4.find((l) => l.id === id)!;

function mount(level: ProgLevel, onSolved = vi.fn(), onEnd = vi.fn()) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const stop = mountPuzzle(root, { t, audio: new SoftAudio(false), level, wagons: 3, onSolved, onEndSession: onEnd });
  return { root, stop, onSolved, onEnd };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  localStorage.clear();
});

/** Wordless: every text node is a Repeat count digit. */
function wordless(root: Element) {
  const texts = textNodes(root);
  for (const x of texts) expect(x).toMatch(/^[2-5]$/);
  expect(texts).toEqual([...root.querySelectorAll('.rep-count')].map((e) => e.textContent));
}

describe('layout at 360 × 640: board tiles ≥ 48 px, slots ≥ 44 px, palette tiles ≥ 56 px', () => {
  for (const l of LEVELS_V4) {
    it(l.id, () => {
      const lay = editorLayout({ cols: l.grid[0].length, rows: l.grid.length, slots: l.slots, fslots: l.fslots, tiles: paletteOf(l).length }, 360, 640);
      expect(lay.fits).toBe(true);
      expect(lay.tile).toBeGreaterThanOrEqual(MIN_TILE4);
      expect(lay.slot).toBeGreaterThanOrEqual(MIN_SLOT4);
      expect(lay.pal).toBeGreaterThanOrEqual(MIN_PAL4);
      expect(lay.height).toBeLessThanOrEqual(640);
    });
  }
});

describe('every level can be solved through the screen: Run stays disabled until the rows are full', () => {
  for (const l of LEVELS_V4) {
    it(l.id, async () => {
      const { root, onSolved, stop } = mount(l);
      wordless(root);
      if (l.given) {
        // Debug levels start with the given program, full: Run is ready, and the run fails.
        expect(programOf(root)).toBe(l.given);
        expect(runBtn(root).disabled).toBe(false);
        click(runBtn(root));
        await vi.advanceTimersByTimeAsync(30_000);
        expect(programOf(root)).toBe(l.given);
        wordless(root);
        stop();
        return;
      }
      enterProgram(root, l, solutionOf(l), () => expect(runBtn(root).disabled).toBe(true));
      expect(programOf(root)).toBe(l.solution);
      expect(runBtn(root).disabled).toBe(false);
      wordless(root);
      click(runBtn(root));
      await vi.advanceTimersByTimeAsync(40_000);
      expect(onSolved).toHaveBeenCalledWith({ helped: false });
      stop();
    });
  }
});

describe('a failed run', () => {
  it('leaves the program byte-identical; the failing command and cell glow softly', async () => {
    const l = byId('P01');
    const { root, stop } = mount(l);
    const wrong = parseProgram('E E N N N W N'); // the last arrow points into a house
    enterProgram(root, l, wrong);
    const shape = () =>
      [...root.querySelectorAll('.slot')].map((e) => `${e.getAttribute('data-row')}${e.getAttribute('data-i')}:${e.querySelector('svg')?.getAttribute('class')}:${e.querySelector('.rep-count')?.textContent ?? ''}`).join('|');
    const before = programOf(root);
    const slotsBefore = shape();
    click(runBtn(root));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runProgram(l, wrong).reason).toBe('blocked');
    expect(programOf(root)).toBe(before);
    expect(shape()).toBe(slotsBefore);
    expect(slotEl(root, 'main', 6).classList.contains('culprit')).toBe(true);
    expect(root.querySelectorAll('.slot.culprit')).toHaveLength(1);
    const mark = root.querySelector('.break-mark')!;
    expect([mark.getAttribute('x'), mark.getAttribute('y')]).toEqual([String(2 * 100 + 4), String(0 * 100 + 4)]);
    wordless(root);
    stop();
  });

  it('each stop highlights its command: reverse on the first arrow', async () => {
    const l = byId('P01');
    const { root, stop } = mount(l);
    enterProgram(root, l, parseProgram('W N N E N E S'));
    click(runBtn(root));
    await vi.advanceTimersByTimeAsync(8000);
    expect(slotEl(root, 'main', 0).classList.contains('culprit')).toBe(true);
    expect(programOf(root)).toBe('W N N E N E S');
    stop();
  });

  it('Run rests for 3 s after a stop, then works again; nothing was removed', async () => {
    const l = byId('P01');
    const { root, stop } = mount(l);
    enterProgram(root, l, parseProgram('E N N E N E E'));
    click(runBtn(root));
    await vi.advanceTimersByTimeAsync(5500); // the ride ends; Run is resting
    expect(runBtn(root).disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(runBtn(root).disabled).toBe(false);
    expect(programOf(root)).toBe('E N N E N E E');
    stop();
  });
});

describe('editing: only the player takes a command out', () => {
  it('take out the selected command: the slot empties; a Repeat only once its body is empty', () => {
    const l = byId('P06');
    const { root, stop } = mount(l);
    enterProgram(root, l, solutionOf(l)); // N 4[E N]
    click(slotEl(root, 'main', 2));
    click(slotEl(root, 'main', 2).querySelector('.take-out'));
    expect(programOf(root)).toBe('N 4[_ N]');
    click(slotEl(root, 'main', 1));
    expect(slotEl(root, 'main', 1).querySelector('.take-out')).toBeNull(); // body not empty
    click(slotEl(root, 'main', 3));
    click(slotEl(root, 'main', 3).querySelector('.take-out'));
    click(slotEl(root, 'main', 1));
    click(slotEl(root, 'main', 1).querySelector('.shrink'));
    expect(programOf(root)).toBe('N 4[_] _');
    click(slotEl(root, 'main', 1).querySelector('.take-out'));
    expect(programOf(root)).toBe('N _ _ _');
    expect(runBtn(root).disabled).toBe(true);
    stop();
  });

  it('a palette tile fills the selected empty slot, else the first empty one; a full row refuses softly', () => {
    const l = byId('P01');
    const { root, stop } = mount(l);
    click(slotEl(root, 'main', 3));
    click(tileEl(root, 'N'));
    expect(programOf(root)).toBe('_ _ _ N _ _ _');
    click(slotEl(root, 'main', 3)); // select the filled slot: a tile goes to the first empty slot
    click(tileEl(root, 'E'));
    expect(programOf(root)).toBe('E _ _ N _ _ _');
    for (let k = 0; k < 5; k++) click(tileEl(root, 'S'));
    expect(programOf(root)).toBe('E S S N S S S');
    click(tileEl(root, 'W'));
    expect(programOf(root)).toBe('E S S N S S S');
    expect(tileEl(root, 'W').classList.contains('nope')).toBe(true);
    stop();
  });

  it('the count digit cycles 2 → 3 → 4 → 5 → 2', () => {
    const l = byId('P06');
    const { root, stop } = mount(l);
    click(tileEl(root, 'repeat'));
    const digits: string[] = [];
    for (let k = 0; k < 5; k++) {
      digits.push(slotEl(root, 'main', 0).querySelector('.rep-count')!.textContent!);
      click(slotEl(root, 'main', 0).querySelector('.rep-count'));
    }
    expect(digits).toEqual(['2', '3', '4', '5', '2']);
    stop();
  });

  it('random editing never deletes, reorders or edits a command; only takeOut removes exactly one', () => {
    const rnd = seeded(11);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    for (const l of LEVELS_V4) {
      const tiles: Tile[] = paletteOf(l);
      let p: Program = initialProgram(l);
      for (let step = 0; step < 120; step++) {
        const boxes = [...boxesOf(p.main, 'main'), ...boxesOf(p.p, 'p')];
        const ref = pick(boxes).ref;
        const op = Math.floor(rnd() * 6);
        const before = commandsOf(p);
        const beforeJson = JSON.stringify(p);
        let next: Program | null = null;
        if (op <= 1) next = place(l, p, firstHole(p) ?? ref, pick(tiles));
        else if (op === 2) next = canGrow(p, ref) ? grow(p, ref) : null;
        else if (op === 3) next = canShrink(p, ref) ? shrink(p, ref) : null;
        else if (op === 4) next = cycleCount(p, ref);
        else next = canTakeOut(p, ref) ? takeOut(p, ref) : null;
        expect(JSON.stringify(p)).toBe(beforeJson); // inputs are never mutated
        if (!next) continue;
        expect(rowCost(next.main), l.id).toBe(l.slots);
        expect(rowCost(next.p), l.id).toBe(l.fslots);
        const after = commandsOf(next);
        const strip = (s: string) => s.replace(/[2-5]\[/g, 'R[');
        if (op <= 1) {
          // Placing adds one command and keeps every other one, in order.
          const a = strip(before).replace(/[\[\] ;]/g, '');
          const b = strip(after).replace(/[\[\] ;]/g, '');
          expect(b.length, l.id).toBe(a.length + 1);
        } else if (op === 5) {
          const a = strip(before).replace(/[\[\] ;]/g, '');
          const b = strip(after).replace(/[\[\] ;]/g, '');
          expect(b.length, l.id).toBe(a.length - 1);
        } else if (op === 4) expect(strip(after)).toBe(strip(before));
        else expect(after, `${l.id} op ${op}`).toBe(before);
        p = next;
      }
    }
  });

  it('a full program can run only when every Repeat body is filled', () => {
    const l = byId('P06');
    let p = initialProgram(l);
    p = place(l, p, { row: 'main', i: 0 }, { t: 'move', m: 'N' })!;
    p = place(l, p, { row: 'main', i: 1 }, { t: 'repeat' })!;
    expect(formatProgram(p)).toBe('N 2[_] _');
    expect(canRun(l, p)).toBe(false);
  });
});

describe('the lamp (one per level)', () => {
  it('chapter 1: dots up to the halfway cell of the stored route; it marks the level helped', async () => {
    const l = byId('P02');
    const { root, onSolved, stop } = mount(l);
    click(root.querySelector('.lamp4'));
    expect(root.querySelectorAll('.lamp-dot-g')).toHaveLength(0); // first tap only arms it
    click(root.querySelector('.lamp4'));
    const route = solutionRoute(l);
    expect(root.querySelectorAll('.lamp-dot-g')).toHaveLength(Math.floor(route.length / 2) + 1);
    click(root.querySelector('.lamp4'));
    expect(root.querySelectorAll('.lamp-dot-g')).toHaveLength(Math.floor(route.length / 2) + 1); // one lamp only
    wordless(root);
    enterProgram(root, l, solutionOf(l));
    click(runBtn(root));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onSolved).toHaveBeenCalledWith({ helped: true });
    stop();
  });

  it('from chapter 2: the whole route; never a command', () => {
    const l = byId('P07');
    const { root, stop } = mount(l);
    click(root.querySelector('.lamp4'));
    click(root.querySelector('.lamp4'));
    expect(root.querySelectorAll('.lamp-dot-g')).toHaveLength(solutionRoute(l).length);
    expect(programOf(root)).toBe(formatProgram(initialProgram(l)));
    stop();
  });
});

describe('pause (parent long-press) and palettes', () => {
  it('pause → end session calls onEndSession; the pause screen is wordless', async () => {
    const { root, onEnd } = mount(byId('P01'));
    const ctl = root.querySelector('.pause-ctl')!;
    ctl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 1, isPrimary: true }));
    await vi.advanceTimersByTimeAsync(1700);
    const overlay = root.querySelector('.pause-overlay')!;
    wordless(overlay);
    click(overlay.querySelectorAll('button')[1]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('palettes: the level family, Repeat when allowed, Call only with a P row', () => {
    for (const l of LEVELS_V4) {
      const want = [...movesOf(l.commands), ...(l.repeat ? ['repeat'] : []), ...(l.fslots ? ['call'] : [])];
      expect(paletteOf(l).map((x) => (x.t === 'move' ? x.m : x.t)), l.id).toEqual(want);
    }
  });
});
