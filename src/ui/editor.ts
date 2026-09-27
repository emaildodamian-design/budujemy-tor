// One v4 puzzle on screen: the board, the program strip (main row, and the P row when the
// level has one), the palette, the run button, the lamp and the parent pause.
// Child-facing: no words anywhere. The only text nodes are the Repeat count digits.
//
// The player writes the whole program first; Run is active only when every slot is filled.
// Then the train runs it, laying one piece per move, and the running command glows in step.
// A stop glows its cell and the responsible command softly; the program stays exactly as
// written. Only the player takes a command out.

import { type Cell, E, cellKey } from '../game/grid';
import { type Tile, boxesOf, canGrow, canShrink, canTakeOut, cycleCount, firstHole, grow, initialProgram, place, shrink, takeOut, tokenAt } from '../game/edit';
import { sideDir, terrainAt } from '../game/level';
import { type ProgLevel, type ProgRun, type Program, type SlotRef, boardOfProg, canRun, formatProgram, movesOf, runProgram, solutionOf, solutionRoute } from '../game/program';
import type { T } from '../i18n';
import type { SoftAudio } from '../platform/audio';
import {
  CELL,
  arrowArt,
  continueIcon,
  depotFloorArt,
  depotRoofArt,
  endIcon,
  engineArt,
  goIcon,
  lampArt,
  orderDots,
  pauseIcon,
  pieceArt,
  startArt,
  terrainArt,
  wagonArt,
} from './art';
import { callIcon, dotArt, minusIcon, moveIcon, plusIcon, repeatIcon, takeOutIcon } from './art4';
import { editorLayout } from './layout4';
import { attachHold } from './longpress';
import { pointAt, polylineLength, routePoints } from './route';
import { h, s } from './svg';

export const TIMING4 = {
  /** The train rides one cell in this time. */
  cellMs: 600,
  /** Run rests for this long after a run that did not arrive. */
  cooldownMs: 3000,
  /** Parent pause: long-press on the small corner control. */
  pauseHoldMs: 1500,
};

export interface PuzzleDeps {
  t: T;
  audio: SoftAudio;
  level: ProgLevel;
  /** Wagons still coupled at the top (puzzles left in the session, this one included). */
  wagons: number;
  onSolved: (r: { helped: boolean }) => void;
  /** Parent chose "end session" on the pause screen. */
  onEndSession: () => void;
  timing?: Partial<typeof TIMING4>;
  /** Parent preview: a parent bar above the board (the only words), and a way to load the stored solution. */
  preview?: { bar: HTMLElement; controls: { showSolution?: () => void } };
}

type Phase = 'edit' | 'riding' | 'done';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};

/** Palette tiles of a level, in order. */
export function paletteOf(level: ProgLevel): Tile[] {
  const out: Tile[] = movesOf(level.commands).map((m) => ({ t: 'move', m }));
  if (level.repeat) out.push({ t: 'repeat' });
  if (level.fslots > 0) out.push({ t: 'call' });
  return out;
}

export function mountPuzzle(root: HTMLElement, deps: PuzzleDeps): () => void {
  const { t, audio, level } = deps;
  const tm = { ...TIMING4, ...deps.timing };
  const b = boardOfProg(level);
  let prog: Program = initialProgram(level);
  let sel: SlotRef | null = null;
  let phase: Phase = 'edit';
  let cooling = false;
  let paused = false;
  let disposed = false;
  let lampArmed = false;
  let lampUsed = false;
  /** The last failed run: its track stays faded on the board until the next edit. */
  let failedRun: ProgRun | null = null;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };

  // ---------- layout ----------
  const pauseCtl = h('button', { class: 'pause-ctl', type: 'button', 'aria-label': t('pause') }, pauseIcon());
  attachHold(pauseCtl, () => showPause(), tm.pauseHoldMs);
  const wagons = h('div', { class: 'wagons', 'aria-hidden': 'true' });
  for (let i = 0; i < deps.wagons; i++) wagons.append(h('div', { class: 'wagon' }, wagonArt()));
  const lamp = h('button', { class: 'lamp lamp4', type: 'button', 'aria-label': t('lamp') }, lampArt());
  lamp.addEventListener('click', onLamp);
  const runBtn = h('button', { class: 'go run4', type: 'button', 'aria-label': t('go') }, goIcon());
  runBtn.addEventListener('click', () => void run());

  const board = s('svg', { class: 'board', viewBox: `0 0 ${b.cols * CELL} ${b.rows * CELL}`, role: 'img', 'aria-label': t('board') });
  const L = { terrain: s('g', {}), track: s('g', {}), pieces: s('g', {}), marks: s('g', { class: 'marks' }), train: s('g', {}), roof: s('g', {}) };
  board.append(...Object.values(L));
  const boardWrap = h('div', { class: 'board-wrap' }, board);

  const mainRow = h('div', { class: 'prog-row prog-main', role: 'group', 'aria-label': t('program') });
  const pRow = h('div', { class: 'prog-row prog-p', role: 'group', 'aria-label': t('function') });
  const strip = h('div', { class: 'prog-strip' }, mainRow, level.fslots > 0 ? pRow : null);
  const palette = h('div', { class: 'palette', role: 'group', 'aria-label': t('palette') });
  const tiles = paletteOf(level);

  const screen = h(
    'main',
    { class: `screen game prog${deps.preview ? ' previewing' : ''}`, 'data-level': level.id },
    deps.preview?.bar ?? null,
    h('header', { class: 'topbar topbar4' }, pauseCtl, h('div', { class: 'topbar-mid' }, wagons), lamp, runBtn),
    boardWrap,
    strip,
    palette,
  );
  root.replaceChildren(screen);
  if (deps.preview) {
    deps.preview.controls.showSolution = () => {
      // Parent preview only: the stored solution goes into the strip.
      prog = solutionOf(level);
      sel = null;
      edited();
    };
  }

  const fit = () => {
    const barPx = deps.preview ? Math.ceil(deps.preview.bar.getBoundingClientRect().height || 48) + 8 : 0;
    const lay = editorLayout(
      { cols: b.cols, rows: b.rows, slots: level.slots, fslots: level.fslots, tiles: tiles.length },
      window.innerWidth || 360,
      (window.innerHeight || 640) - barPx,
    );
    boardWrap.style.width = `${lay.tile * b.cols}px`;
    boardWrap.style.height = `${lay.tile * b.rows}px`;
    screen.style.setProperty('--tile', `${lay.tile}px`);
    screen.style.setProperty('--slot', `${lay.slot}px`);
    screen.style.setProperty('--pal', `${lay.pal}px`);
  };
  fit();
  window.addEventListener('resize', fit);

  // ---------- static board ----------
  const cellG = (c: Cell, child: SVGElement, cls = '') => s('g', { class: `cell-g ${cls}`, transform: `translate(${c.x * CELL} ${c.y * CELL})` }, child);
  const view = b.view;
  for (let y = 0; y < b.rows; y++)
    for (let x = 0; x < b.cols; x++) {
      const c = { x, y };
      const tt = terrainAt(view, c);
      if (tt === 'start') L.terrain.append(cellG(c, startArt(b.startExit)));
      else if (tt === 'depot') L.terrain.append(cellG(c, depotFloorArt(b.depotEntry)));
      else L.terrain.append(cellG(c, terrainArt(tt === 'station' ? 'grass' : tt), `k-${x}-${y}`));
    }
  for (const p of b.fixed.values()) {
    const cls = p.piece === 'station' ? 'station-cell' : 'fixed-cell';
    const art = pieceArt(p.piece, p.openings);
    if (p.oneWay) art.append(arrowArt(sideDir(p.oneWay)));
    if (p.order) art.append(orderDots(p.order, p.openings));
    L.track.append(cellG({ x: p.at[0], y: p.at[1] }, art, `${cls} k-${p.at[0]}-${p.at[1]}`));
  }
  const roof = cellG(b.depot, depotRoofArt(b.depotEntry), 'roof');
  L.roof.append(roof);
  const engine = engineArt();
  L.train.append(engine);
  const placeEngine = (x: number, y: number, deg: number) =>
    engine.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(0.82)`);
  const parkEngine = () => placeEngine(b.start.x * CELL + 50, b.start.y * CELL + 50, [-90, 0, 90, 180][b.startExit]);
  parkEngine();

  // ---------- program strip ----------
  function renderStrip() {
    for (const [rowEl, rowId] of [
      [mainRow, 'main'],
      [pRow, 'p'],
    ] as const) {
      rowEl.replaceChildren();
      if (rowId === 'p') {
        if (level.fslots === 0) continue;
        rowEl.append(h('div', { class: 'slot p-marker', 'aria-hidden': 'true' }, callIcon()));
      }
      for (const box of boxesOf(rowId === 'main' ? prog.main : prog.p, rowId)) {
        const tok = box.tok;
        const isSel = !!sel && sel.row === box.ref.row && sel.i === box.ref.i;
        const cls = [
          'slot',
          tok.t === 'hole' ? 'empty' : `filled k-${tok.t}`,
          box.depth ? `in-${box.depth}` : '',
          box.opens ? `opens-${box.opens}` : '',
          box.closes ? `closes-${box.closes}` : '',
          isSel ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const el = h('button', { class: cls, type: 'button', 'data-row': box.ref.row, 'data-i': box.ref.i, 'aria-label': t('slot') });
        if (tok.t === 'move') el.append(moveIcon(tok.m));
        else if (tok.t === 'call') el.append(callIcon());
        else if (tok.t === 'repeat') {
          el.append(repeatIcon());
          const count = h('span', { class: 'rep-count', 'data-row': box.ref.row, 'data-i': box.ref.i }, String(tok.n));
          count.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!canEdit()) return;
            const next = cycleCount(prog, box.ref);
            if (next) {
              prog = next;
              sel = box.ref;
              edited();
            }
          });
          el.append(count);
        }
        el.addEventListener('click', () => {
          if (!canEdit()) return;
          sel = isSel && tok.t === 'hole' ? null : box.ref;
          renderStrip();
        });
        if (isSel) el.append(...handles(box.ref));
        rowEl.append(el);
      }
    }
    runBtn.disabled = !(phase === 'edit' && !cooling && canRun(level, prog));
    // For tests and the parent preview: the program as written (an attribute, not text).
    strip.dataset.program = formatProgram(prog);
  }

  /** Marks on the selected slot: take out; and on a Repeat, a longer / shorter body. */
  function handles(ref: SlotRef): HTMLElement[] {
    const out: HTMLElement[] = [];
    const mark = (cls: string, icon: SVGSVGElement, label: string, fn: () => Program | null) => {
      const m = h('span', { class: `slot-mark ${cls}`, role: 'button', 'aria-label': label }, icon);
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canEdit()) return;
        const next = fn();
        if (!next) return;
        const tok = tokenAt(prog, ref);
        const ord = tok?.t === 'repeat' ? repeatOrdinal(prog, ref) : -1;
        prog = next;
        // A Repeat keeps its selection while its body changes.
        sel = ord >= 0 && cls !== 'take-out' ? repeatRef(prog, ref.row, ord) : ref;
        edited();
      });
      out.push(m);
    };
    if (canTakeOut(prog, ref)) mark('take-out', takeOutIcon(), t('takeOut'), () => takeOut(prog, ref));
    const tok = tokenAt(prog, ref);
    if (tok?.t === 'repeat') {
      if (canGrow(prog, ref)) mark('grow', plusIcon(), t('longer'), () => grow(prog, ref));
      if (canShrink(prog, ref)) mark('shrink', minusIcon(), t('shorter'), () => shrink(prog, ref));
    }
    return out;
  }

  function renderPalette() {
    palette.replaceChildren();
    tiles.forEach((tile, k) => {
      const icon = tile.t === 'move' ? moveIcon(tile.m) : tile.t === 'repeat' ? repeatIcon() : callIcon();
      const el = h('button', { class: `pal-tile k-${tile.t}`, type: 'button', 'data-k': k, 'data-tile': tile.t === 'move' ? tile.m : tile.t, 'aria-label': t(`tile_${tile.t === 'move' ? tile.m : tile.t}`) }, icon);
      el.addEventListener('click', () => onTile(tile, el));
      palette.append(el);
    });
  }

  function onTile(tile: Tile, el: HTMLElement) {
    if (!canEdit()) return;
    const target = sel && tokenAt(prog, sel)?.t === 'hole' ? sel : firstHole(prog);
    const next = target ? place(level, prog, target, tile) : null;
    if (!next || !target) {
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope'); // a soft wobble: it does not fit there
      return;
    }
    prog = next;
    audio.play('place');
    sel = firstHole(prog, target);
    edited();
  }

  const canEdit = () => phase === 'edit' && !paused;

  /** The program changed (only ever by the player): clear the last run's marks. */
  function edited() {
    failedRun = null;
    clearMarks();
    renderPieces([]);
    renderStrip();
  }

  // ---------- board marks ----------
  function renderPieces(pieces: ProgRun['pieces'], faded = false) {
    L.pieces.replaceChildren();
    for (const p of pieces) L.pieces.append(cellG({ x: p.at[0], y: p.at[1] }, pieceArt(p.piece, p.openings, { movable: true }), faded ? 'laid faded' : 'laid'));
  }

  function clearMarks() {
    L.marks.querySelectorAll('.break-mark').forEach((m) => m.remove());
    roof.classList.remove('gate-shut', 'door-glow');
    L.track.querySelectorAll('.station-cell').forEach((g) => g.classList.remove('missed'));
    L.track.querySelectorAll('.pulse').forEach((g) => g.classList.remove('pulse'));
    screen.querySelectorAll('.slot.culprit, .slot.running').forEach((e) => e.classList.remove('culprit', 'running'));
  }

  function glowSlots(refs: readonly SlotRef[], cls: string) {
    screen.querySelectorAll(`.slot.${cls}`).forEach((e) => e.classList.remove(cls));
    for (const r of refs) screen.querySelector(`.slot[data-row="${r.row}"][data-i="${r.i}"]`)?.classList.add(cls);
  }

  // ---------- lamp ----------
  function onLamp() {
    if (phase !== 'edit' || lampUsed) return;
    if (!lampArmed) {
      lampArmed = true;
      lamp.classList.add('armed');
      return;
    }
    lampArmed = false;
    lampUsed = true;
    lamp.classList.remove('armed');
    lamp.classList.add('used');
    // Dots on the stored solution's route: up to the halfway cell in chapter 1, all of it later.
    const route = solutionRoute(level);
    const upto = level.chapter === 1 ? Math.floor(route.length / 2) + 1 : route.length;
    for (const c of route.slice(0, upto)) L.marks.append(cellG(c, dotArt(), 'lamp-dot-g'));
  }

  // ---------- the run ----------
  async function run() {
    if (phase !== 'edit' || cooling || paused || !canRun(level, prog)) return;
    phase = 'riding';
    sel = null;
    lampArmed = false;
    lamp.classList.remove('armed');
    clearMarks();
    renderPieces([]);
    renderStrip();
    screen.classList.add('riding');
    const r = runProgram(level, prog);
    const pts = routePoints(view, r.pieces, r.trace, b.start, b.startExit, b.depot);
    const total = polylineLength(pts);
    const duration = Math.max(800, (total / CELL) * tm.cellMs);
    const shown = new Set<string>();
    const pathIndex = new Map(r.path.map((c, i) => [cellKey(c), i]));
    engine.classList.add('running');
    let lastCell = -2;
    let lastChug = -Infinity;
    await animate(duration, (k) => {
      const eased = r.success ? k : k < 0.8 ? k * 1.1 : 0.88 + (1 - Math.pow(1 - (k - 0.8) / 0.2, 2)) * 0.12;
      const len = Math.min(1, eased) * total;
      const p = pointAt(pts, len);
      placeEngine(p.x, p.y, p.angle);
      if (p.cell !== lastCell) {
        lastCell = p.cell;
        // Pieces appear as the engine lays them; the command that laid them glows.
        for (const piece of r.pieces) {
          const key = `${piece.at[0]},${piece.at[1]}`;
          const idx = pathIndex.get(key);
          if (idx !== undefined && idx <= p.cell && !shown.has(key)) {
            shown.add(key);
            L.pieces.append(cellG({ x: piece.at[0], y: piece.at[1] }, pieceArt(piece.piece, piece.openings, { movable: true }), 'laid settle'));
          }
        }
        glowSlots(r.stepCmds[p.cell] ?? [], 'running');
      }
      if (len - lastChug >= CELL * 0.9) {
        lastChug = len;
        audio.play('chug');
      }
    });
    if (disposed) return;
    engine.classList.remove('running');
    screen.classList.remove('riding');
    glowSlots([], 'running');
    if (r.success) return arrive();
    failed(r);
  }

  function animate(duration: number, frame: (k: number) => void): Promise<void> {
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (ts: number) => {
        if (disposed) return resolve();
        if (paused) {
          requestAnimationFrame(step);
          return;
        }
        const k = Math.min(1, (ts - start) / duration);
        frame(k);
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  async function arrive() {
    phase = 'done';
    roof.classList.add('closed');
    engine.classList.add('off');
    audio.play('arrive');
    renderStrip();
    await wait(reducedMotion() ? 600 : 1600);
    if (disposed) return;
    wagons.firstElementChild?.classList.add('uncouple');
    await wait(reducedMotion() ? 300 : 1100);
    if (disposed) return;
    deps.onSolved({ helped: lampUsed });
  }

  /** Every stop shows its cause, softly (never red, no error sound). The program is untouched. */
  function failed(r: ProgRun) {
    phase = 'edit';
    cooling = true;
    failedRun = r;
    renderPieces(r.pieces, true);
    const at = (c: Cell) => L.track.querySelector(`.k-${c.x}-${c.y}`);
    if (r.breakCell && r.reason !== 'missedStation' && r.reason !== 'depotSide') {
      const c = r.breakCell;
      L.marks.append(s('rect', { class: 'break-mark', x: c.x * CELL + 4, y: c.y * CELL + 4, width: 92, height: 92, rx: 16 }));
    }
    if (r.reason === 'depotSide') roof.classList.add('door-glow');
    if (r.reason === 'missedStation') roof.classList.add('gate-shut');
    if (r.reason === 'wrongWay' && r.breakCell) at(r.breakCell)?.querySelector('.one-way')?.classList.add('pulse');
    if (r.reason === 'wrongOrder' || r.reason === 'missedStation') {
      for (const c of [...(r.reason === 'wrongOrder' && r.breakCell ? [r.breakCell] : []), ...r.missingStations]) {
        at(c)?.classList.add('missed');
        at(c)?.querySelector('.order-dots')?.classList.add('pulse');
      }
    }
    renderStrip();
    glowSlots(r.cmd, 'culprit');
    later(() => {
      cooling = false;
      engine.classList.add('fade');
      later(() => {
        parkEngine();
        engine.classList.remove('fade');
      }, 450);
      renderStrip();
      if (failedRun === r) glowSlots(r.cmd, 'culprit');
    }, tm.cooldownMs);
  }

  // ---------- pause (parent) ----------
  function showPause() {
    if (phase === 'done' || paused) return;
    paused = true;
    const art = s('svg', { viewBox: '0 0 200 120', class: 'pause-art', 'aria-hidden': 'true' });
    const shed = startArt(E);
    shed.setAttribute('transform', 'translate(50 10)');
    const e = engineArt();
    e.setAttribute('transform', 'translate(100 60) scale(0.9)');
    e.classList.add('off');
    art.append(shed, e);
    const cont = h('button', { class: 'big-btn', type: 'button', 'aria-label': t('continue') }, continueIcon());
    const end = h('button', { class: 'big-btn', type: 'button', 'aria-label': t('endSession') }, endIcon());
    const overlay = h('div', { class: 'pause-overlay', role: 'dialog', 'aria-label': t('pause') }, art, h('div', { class: 'pause-actions' }, cont, end));
    cont.addEventListener('click', () => {
      overlay.remove();
      paused = false;
    });
    end.addEventListener('click', () => {
      overlay.remove();
      deps.onEndSession();
    });
    screen.append(overlay);
  }

  // ---------- start ----------
  renderPalette();
  sel = firstHole(prog);
  renderStrip();

  return () => {
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    window.removeEventListener('resize', fit);
  };
}

/** Index of the Repeat at `ref` among the row's Repeats (pre-order). */
function repeatOrdinal(p: Program, ref: SlotRef): number {
  const boxes = boxesOf(ref.row === 'main' ? p.main : p.p, ref.row);
  return boxes.filter((b) => b.tok.t === 'repeat').findIndex((b) => b.ref.i === ref.i);
}
function repeatRef(p: Program, row: SlotRef['row'], ord: number): SlotRef | null {
  const boxes = boxesOf(row === 'main' ? p.main : p.p, row).filter((b) => b.tok.t === 'repeat');
  return boxes[ord]?.ref ?? null;
}
