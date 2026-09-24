// One puzzle level on screen: board, tray, go button, helper lamps, test run, pause.
// All rules live in ../game/ (trace, hints, placement); this file draws and forwards input.
// Child-facing: no words anywhere. The only text nodes are the tray count digits.

import { type Cell, E, cellKey } from '../game/grid';
import { type Hint, ghostPath, nextHint, plan } from '../game/hints';
import { type Level, type PieceKind, type Placed, boardOf, goalStripOf, initialPieces, terrainAt, trayOrientation } from '../game/level';
import { drop, move, pieceOn, placeGhost, takeBack, trayView, turn } from '../game/placement';
import type { LevelResult } from '../game/progress';
import { type TraceResult, trace } from '../game/trace';
import type { T } from '../i18n';
import type { SoftAudio } from '../platform/audio';
import {
  CELL,
  avatarArt,
  continueIcon,
  depotFloorArt,
  depotIcon,
  depotRoofArt,
  endIcon,
  engineArt,
  goIcon,
  lampArt,
  pauseIcon,
  pieceArt,
  pieceIcon,
  startArt,
  terrainArt,
  wagonArt,
} from './art';
import { tileSize } from './layout';
import { attachHold } from './longpress';
import { pointAt, polylineLength, routePoints } from './route';
import { h, s } from './svg';

export const TIMING = {
  /** Look phase at each level start: board visible, tray resting. */
  lookMs: 5000,
  /** The train rides one cell in this time, at one slow constant speed. */
  cellMs: 600,
  /** Go is resting for this long after a run that did not arrive. */
  cooldownMs: 3000,
  /** No input for this long counts as being stuck once. */
  idleStuckMs: 90_000,
  /** Intro levels: show the lamp-2 hint if no correct piece is down by then. */
  introPromptMs: 10_000,
  /** Press and hold a placed piece this long to send it back to the tray. */
  holdReturnMs: 500,
  /** Parent pause: long-press on the small corner control. */
  pauseHoldMs: 1500,
};

export interface LevelDeps {
  t: T;
  audio: SoftAudio;
  level: Level;
  /** Wagons still coupled at the top (the session's remaining slots, this one included). */
  wagons: number;
  onSolved: (r: LevelResult) => void;
  /** Parent chose "end session" on the pause screen. */
  onEndSession: () => void;
  timing?: Partial<typeof TIMING>;
}

type Phase = 'look' | 'build' | 'riding' | 'done';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const reducedMotion = () => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};
const DRAG_START_PX = 12;

export function mountLevel(root: HTMLElement, deps: LevelDeps): () => void {
  const { t, audio, level } = deps;
  const tm = { ...TIMING, ...deps.timing };
  const b = boardOf(level);
  let pieces: Placed[] = initialPieces(level);
  let phase: Phase = 'look';
  let cooling = false;
  let paused = false;
  let disposed = false;
  let selected: PieceKind | null = null;
  let justPlaced: string | null = null;

  // Helper state (never shown to the child as anything but light).
  let lampsLeft = 2;
  let lampsUsed = 0;
  let armed = false;
  let stuck = 0;
  let best = -1;
  let runs = 0;
  let helped = false;
  let ghostMode = false;
  let shownHint: { hint: Hint; strong: boolean } | null = null;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  let idleTimer = 0;

  // ---------- layout ----------
  const pauseCtl = h('button', { class: 'pause-ctl', type: 'button', 'aria-label': t('pause') }, pauseIcon());
  attachHold(pauseCtl, () => showPause(), tm.pauseHoldMs);

  const wagons = h('div', { class: 'wagons', 'aria-hidden': 'true' });
  for (let i = 0; i < deps.wagons; i++) wagons.append(h('div', { class: 'wagon' }, wagonArt()));

  const goal = h('div', { class: 'goal-strip', 'aria-hidden': 'true' });
  const goalIcons: { kind: 'bridge' | 'tunnel' | 'station'; el: HTMLElement }[] = [];
  const sol = level.solution;
  const want: ('bridge' | 'tunnel' | 'station')[] = [];
  if (goalStripOf(level) === 'full') {
    for (const p of sol) if (p.piece === 'bridge' || p.piece === 'tunnel') want.push(p.piece);
  }
  for (let i = 0; i < b.stations.length; i++) want.push('station');
  for (const k of want) {
    const el = h('span', { class: `goal-icon g-${k}` }, pieceIcon(k, 'EW', 'goal-svg'));
    goalIcons.push({ kind: k, el });
    goal.append(el);
  }
  const depotGoal = h('span', { class: 'goal-icon g-depot' }, depotIcon());
  goal.append(depotGoal);

  const avatar = h('button', { class: 'avatar parent', type: 'button', 'aria-label': t('helper') }, avatarArt('parent'));
  const lamps = h('div', { class: 'lamps' });
  const lampEls = [0, 1].map(() => {
    const el = h('button', { class: 'lamp', type: 'button', 'aria-label': t('lamp') }, lampArt());
    el.addEventListener('click', onLamp);
    lamps.append(el);
    return el;
  });
  avatar.addEventListener('click', () => armed && onLamp());
  const helper = h('div', { class: 'helper' }, avatar, lamps);

  const board = s('svg', { class: 'board', viewBox: `0 0 ${b.cols * CELL} ${b.rows * CELL}`, role: 'img', 'aria-label': t('board') });
  const L = {
    terrain: s('g', {}),
    track: s('g', {}),
    pieces: s('g', {}),
    ghosts: s('g', { class: 'ghosts' }),
    marks: s('g', { class: 'marks' }),
    train: s('g', {}),
    roof: s('g', {}),
  };
  board.append(...Object.values(L));
  const boardWrap = h('div', { class: 'board-wrap' }, board);

  const tray = h('div', { class: 'tray', role: 'group', 'aria-label': t('tray') });
  const goBtn = h('button', { class: 'go', type: 'button', 'aria-label': t('go') }, goIcon());
  goBtn.addEventListener('click', () => void run());

  const screen = h(
    'main',
    { class: 'screen game looking' },
    h('header', { class: 'topbar' }, pauseCtl, h('div', { class: 'topbar-mid' }, wagons, goal), helper),
    boardWrap,
    h('footer', { class: 'bottombar' }, tray, goBtn),
  );
  screen.style.setProperty('--look', `${tm.lookMs}ms`);
  root.replaceChildren(screen);

  const fit = () => {
    const px = tileSize(b.cols, b.rows, window.innerWidth || 360, window.innerHeight || 640);
    boardWrap.style.width = `${px * b.cols}px`;
    boardWrap.style.height = `${px * b.rows}px`;
    screen.style.setProperty('--tile', `${px}px`);
  };
  fit();
  window.addEventListener('resize', fit);

  // ---------- static board ----------
  const cellG = (c: Cell, child: SVGElement, cls = '') => s('g', { class: `cell-g ${cls}`, transform: `translate(${c.x * CELL} ${c.y * CELL})` }, child);
  for (let y = 0; y < b.rows; y++)
    for (let x = 0; x < b.cols; x++) {
      const c = { x, y };
      const tt = terrainAt(level, c);
      if (tt === 'start') L.terrain.append(cellG(c, startArt(b.startExit)));
      else if (tt === 'depot') L.terrain.append(cellG(c, depotFloorArt(b.depotEntry)));
      else L.terrain.append(cellG(c, terrainArt(tt === 'station' ? 'grass' : tt)));
    }
  for (const p of b.fixed.values()) {
    const cls = p.piece === 'station' ? 'station-cell' : 'fixed-cell';
    L.track.append(cellG({ x: p.at[0], y: p.at[1] }, pieceArt(p.piece, p.openings), `${cls} k-${p.at[0]}-${p.at[1]}`));
  }
  const roof = cellG(b.depot, depotRoofArt(b.depotEntry), 'roof');
  L.roof.append(roof);
  const engine = engineArt();
  L.train.append(engine);
  const parkEngine = () => {
    const d = b.startExit;
    placeEngine(b.start.x * CELL + 50, b.start.y * CELL + 50, [-90, 0, 90, 180][d]);
  };
  function placeEngine(x: number, y: number, deg: number) {
    engine.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(0.82)`);
  }
  parkEngine();

  // ---------- rendering ----------
  function renderPieces() {
    L.pieces.replaceChildren();
    for (const p of pieces) {
      const key = cellKey({ x: p.at[0], y: p.at[1] });
      L.pieces.append(cellG({ x: p.at[0], y: p.at[1] }, pieceArt(p.piece, p.openings, { movable: true }), key === justPlaced ? 'settle' : ''));
    }
    justPlaced = null;
    L.ghosts.replaceChildren();
    if (ghostMode) for (const g of ghostPath(level, pieces)) L.ghosts.append(cellG({ x: g.at[0], y: g.at[1] }, pieceArt(g.piece, g.openings), 'ghost-piece'));
  }

  function renderTray() {
    tray.replaceChildren();
    for (const item of trayView(level, pieces)) {
      const o = trayOrientation(item.piece);
      const el = h(
        'button',
        {
          class: `tray-item k-${item.piece}${item.count === 0 ? ' empty' : ''}${selected === item.piece ? ' lifted' : ''}`,
          type: 'button',
          'aria-label': t(`piece_${item.piece}`),
          'data-kind': item.piece,
        },
        pieceIcon(item.piece, o),
        h('span', { class: 'tray-count', 'aria-hidden': 'true' }, String(item.count)),
      );
      el.addEventListener('pointerdown', (e) => startTrayPress(e, item.piece, el));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      tray.append(el);
    }
  }

  function renderMarks() {
    L.marks.querySelectorAll('.hint-mark').forEach((m) => m.remove());
    tray.querySelectorAll('.hinted').forEach((m) => m.classList.remove('hinted'));
    if (!shownHint) return;
    const hint = shownHint.hint;
    const mark = (c: Cell, cls: string) =>
      L.marks.append(s('rect', { class: `hint-mark ${cls}`, x: c.x * CELL + 5, y: c.y * CELL + 5, width: 90, height: 90, rx: 16 }));
    if (hint.type === 'place') {
      mark(hint.cell, 'hint-cell');
      if (shownHint.strong) tray.querySelector(`[data-kind="${hint.piece}"]`)?.classList.add('hinted');
    } else if (hint.type === 'change') {
      mark(hint.cell, 'hint-outline');
      if (shownHint.strong) tray.querySelector(`[data-kind="${hint.piece}"]`)?.classList.add('hinted');
    } else if (hint.type === 'blocked') for (const c of hint.cells) mark(c, 'hint-outline');
  }

  function renderHelper() {
    lampEls.forEach((el, i) => {
      el.classList.toggle('used', i >= lampsLeft);
      el.classList.toggle('armed', armed && i === lampsLeft - 1);
    });
    helper.classList.toggle('armed', armed);
  }

  function render() {
    renderPieces();
    renderTray();
    renderMarks();
    renderHelper();
    goBtn.disabled = phase !== 'build' || cooling;
    screen.classList.toggle('looking', phase === 'look');
    screen.classList.toggle('riding', phase === 'riding');
    screen.classList.toggle('cooling', cooling);
  }

  // ---------- input ----------
  const canBuild = () => phase === 'build' && !paused;

  function touched() {
    window.clearTimeout(idleTimer);
    idleTimer = later(() => {
      if (!paused && phase === 'build') bumpStuck();
      touched();
    }, tm.idleStuckMs);
  }

  function setPieces(next: Placed[], placedAt?: Cell) {
    pieces = next;
    if (placedAt) {
      justPlaced = cellKey(placedAt);
      audio.play('place');
    }
    shownHint = null;
    clearBreak();
    touched();
    render();
  }

  function cellFromPoint(x: number, y: number): Cell | null {
    const r = board.getBoundingClientRect();
    if (r.width === 0) return null;
    const cx = Math.floor(((x - r.left) / r.width) * b.cols);
    const cy = Math.floor(((y - r.top) / r.height) * b.rows);
    return cx >= 0 && cy >= 0 && cx < b.cols && cy < b.rows ? { x: cx, y: cy } : null;
  }
  const overTray = (x: number, y: number) => {
    const r = tray.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top - 16 && y <= r.bottom;
  };

  function floating(kind: PieceKind, o: Placed['openings']): HTMLElement {
    const size = board.getBoundingClientRect().width / b.cols || 64;
    const el = h('div', { class: 'drag-ghost' }, pieceIcon(kind, o));
    el.style.width = el.style.height = `${size}px`;
    document.body.append(el);
    return el;
  }
  const moveFloat = (el: HTMLElement, x: number, y: number) => {
    const size = parseFloat(el.style.width);
    el.style.transform = `translate(${x - size / 2}px, ${y - size * 0.85}px) scale(1.06)`;
  };
  function floatBack(el: HTMLElement, to: HTMLElement | null) {
    const size = parseFloat(el.style.width);
    const r = to?.getBoundingClientRect();
    el.classList.add('returning');
    if (r) el.style.transform = `translate(${r.left + r.width / 2 - size / 2}px, ${r.top + r.height / 2 - size / 2}px) scale(${r.width / size || 1})`;
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 700);
  }

  /** Tray: tap lifts the piece (then tap a cell); drag drops it on a cell. */
  function startTrayPress(e: PointerEvent, kind: PieceKind, src: HTMLElement) {
    if (!e.isPrimary || !canBuild()) return;
    e.preventDefault();
    touched();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let drag: HTMLElement | null = null;
    try {
      src.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!drag && Math.hypot(ev.clientX - x0, ev.clientY - y0) > DRAG_START_PX && trayView(level, pieces).find((i) => i.piece === kind)!.count > 0) {
        drag = floating(kind, trayOrientation(kind));
        src.classList.add('lifted');
      }
      if (drag) moveFloat(drag, ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      src.removeEventListener('pointermove', onMove);
      src.removeEventListener('pointerup', onUp);
      src.removeEventListener('pointercancel', onUp);
      if (!drag) {
        if (ev.type === 'pointerup') {
          selected = selected === kind ? null : kind;
          render();
        }
        return;
      }
      const size = parseFloat(drag.style.width);
      const c = ev.type === 'pointerup' ? cellFromPoint(ev.clientX, ev.clientY - size * 0.35) : null;
      const r = c ? drop(level, pieces, c, kind) : null;
      if (r?.ok && c) {
        drag.remove();
        selected = null;
        setPieces(r.pieces, c);
      } else {
        floatBack(drag, src);
        render();
      }
    };
    src.addEventListener('pointermove', onMove);
    src.addEventListener('pointerup', onUp);
    src.addEventListener('pointercancel', onUp);
  }

  /** Board: tap to lay the lifted piece, tap a piece to turn it, hold or drag it to the tray to take it back. */
  board.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || !canBuild()) return;
    const c = cellFromPoint(e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    touched();
    const p = pieceOn(pieces, c);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let drag: HTMLElement | null = null;
    let consumed = false;
    try {
      board.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
    const hold = p
      ? later(() => {
          if (drag) return;
          consumed = true;
          setPieces(takeBack(pieces, c));
        }, tm.holdReturnMs)
      : 0;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || consumed) return;
      if (p && !drag && Math.hypot(ev.clientX - x0, ev.clientY - y0) > DRAG_START_PX) {
        window.clearTimeout(hold);
        drag = floating(p.piece, p.openings);
        L.pieces.querySelector(`[transform="translate(${c.x * CELL} ${c.y * CELL})"]`)?.classList.add('lifted');
      }
      if (drag) moveFloat(drag, ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.clearTimeout(hold);
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerup', onUp);
      board.removeEventListener('pointercancel', onUp);
      if (consumed || ev.type !== 'pointerup') {
        drag?.remove();
        return;
      }
      if (drag && p) {
        const size = parseFloat(drag.style.width);
        if (overTray(ev.clientX, ev.clientY)) {
          drag.remove();
          setPieces(takeBack(pieces, c));
          return;
        }
        const to = cellFromPoint(ev.clientX, ev.clientY - size * 0.35);
        const r = to ? move(level, pieces, c, to) : null;
        if (r?.ok && to) {
          drag.remove();
          setPieces(r.pieces, to);
        } else {
          floatBack(drag, null);
          render();
        }
        return;
      }
      tapCell(c);
    };
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
  });

  function tapCell(c: Cell) {
    if (ghostMode) {
      const pl = plan(level, pieces);
      const g = ghostPath(level, pieces).find((x) => x.at[0] === c.x && x.at[1] === c.y);
      if (g) {
        const r = placeGhost(level, pieces, g, pl.completion);
        if (r.ok) return setPieces(r.pieces, c);
      }
    }
    if (selected) {
      const r = drop(level, pieces, c, selected);
      if (r.ok) {
        selected = null;
        return setPieces(r.pieces, c);
      }
      // Cannot go there: the lifted piece settles back into the tray.
      selected = null;
      return render();
    }
    if (pieceOn(pieces, c)) setPieces(turn(level, pieces, c));
  }

  // ---------- helper lamps & hints ----------
  function onLamp() {
    if (phase !== 'build' || lampsLeft === 0) return;
    if (!armed) {
      armed = true;
      return renderHelper();
    }
    armed = false;
    lampsLeft--;
    lampsUsed++;
    showHint(lampsUsed >= 2);
    renderHelper();
  }

  function showHint(strong: boolean) {
    const hint = nextHint(level, pieces);
    shownHint = hint.type === 'none' ? null : { hint, strong };
    renderMarks();
  }

  function bumpStuck() {
    stuck++;
    if (stuck === 2) {
      helper.classList.remove('offer');
      void helper.offsetWidth;
      helper.classList.add('offer'); // the lamp pulses once: an offer, nothing more
    } else if (stuck === 3) {
      showHint(false);
    } else if (stuck >= 4 && !ghostMode) {
      ghostMode = true;
      helped = true;
      renderPieces();
    }
  }

  const correctPlaced = () => {
    const tr = trace(level, pieces);
    return tr.success || tr.path.some((c) => !!pieceOn(pieces, c));
  };

  // ---------- the test run ----------
  const goalLit = new Set<HTMLElement>();
  function clearBreak() {
    L.marks.querySelectorAll('.break-mark').forEach((m) => m.remove());
    roof.classList.remove('gate-shut');
    L.track.querySelectorAll('.station-cell').forEach((g) => g.classList.remove('missed'));
    goalIcons.forEach((g) => g.el.classList.remove('missed'));
  }

  function lightGoal(kind: 'bridge' | 'tunnel' | 'station') {
    const g = goalIcons.find((x) => x.kind === kind && !goalLit.has(x.el));
    if (g) {
      goalLit.add(g.el);
      g.el.classList.add('lit');
    }
  }

  async function run() {
    if (phase !== 'build' || cooling || paused) return;
    phase = 'riding';
    selected = null;
    armed = false;
    runs++;
    touched();
    clearBreak();
    goalLit.clear();
    goalIcons.forEach((g) => g.el.classList.remove('lit'));
    depotGoal.classList.remove('lit');
    render();
    const tr = trace(level, pieces);
    const pts = routePoints(level, pieces, tr, b.start, b.startExit, b.depot);
    const total = polylineLength(pts);
    const cells = total / CELL;
    const duration = Math.max(800, cells * tm.cellMs);
    engine.classList.add('running');
    let lastCell = -2;
    let lastChug = -Infinity;
    await animate(duration, (k) => {
      // Constant speed; on a stop it slows down over the last stretch.
      const eased = tr.success ? k : k < 0.8 ? k * 1.1 : 0.88 + (1 - Math.pow(1 - (k - 0.8) / 0.2, 2)) * 0.12;
      const len = Math.min(1, eased) * total;
      const p = pointAt(pts, len);
      placeEngine(p.x, p.y, p.angle);
      if (p.cell !== lastCell) {
        lastCell = p.cell;
        const c = tr.path[p.cell];
        const piece = c && (b.fixed.get(cellKey(c)) ?? pieceOn(pieces, c));
        if (piece && (piece.piece === 'bridge' || piece.piece === 'tunnel' || piece.piece === 'station')) lightGoal(piece.piece);
      }
      if (len - lastChug >= CELL * 0.9) {
        lastChug = len;
        audio.play('chug');
      }
    });
    if (disposed) return;
    engine.classList.remove('running');
    puff();
    if (tr.success) return arrive();
    failed(tr);
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

  function puff() {
    engine.classList.remove('puffing');
    void (engine as unknown as HTMLElement).getBoundingClientRect?.();
    engine.classList.add('puffing');
  }

  async function arrive() {
    phase = 'done';
    depotGoal.classList.add('lit');
    roof.classList.add('closed');
    engine.classList.add('off');
    audio.play('arrive');
    render();
    await wait(reducedMotion() ? 600 : 1600);
    if (disposed) return;
    wagons.firstElementChild?.classList.add('uncouple');
    await wait(reducedMotion() ? 300 : 1100);
    if (disposed) return;
    deps.onSolved({ clean: runs === 1 && lampsUsed === 0 && !helped, helped });
  }

  function failed(tr: TraceResult) {
    phase = 'build';
    cooling = true;
    if (tr.breakCell && tr.reason !== 'missedStation') {
      const c = tr.breakCell;
      L.marks.append(s('rect', { class: 'break-mark', x: c.x * CELL + 4, y: c.y * CELL + 4, width: 92, height: 92, rx: 16 }));
    }
    if (tr.reason === 'missedStation') {
      roof.classList.add('gate-shut');
      for (const m of tr.missingStations) L.track.querySelector(`.k-${m.x}-${m.y}`)?.classList.add('missed');
      const litStations = goalIcons.filter((g) => g.kind === 'station' && !goalLit.has(g.el));
      litStations.forEach((g) => g.el.classList.add('missed'));
    }
    if (tr.reason === 'depotSide' && tr.breakCell) roof.classList.add('gate-shut');
    // Stuck ladder: a run that gets no further than before counts once.
    if (tr.path.length > best) {
      best = tr.path.length;
      stuck = 0;
    } else bumpStuck();
    render();
    later(() => {
      cooling = false;
      engine.classList.add('fade');
      later(() => {
        parkEngine();
        engine.classList.remove('fade');
      }, 450);
      render();
    }, tm.cooldownMs);
  }

  // ---------- pause (parent) ----------
  function showPause() {
    if (phase === 'done' || paused) return;
    paused = true;
    const engineSvg = s('svg', { viewBox: '0 0 200 120', class: 'pause-art', 'aria-hidden': 'true' });
    const shed = startArt(E);
    shed.setAttribute('transform', 'translate(50 10)');
    const e = engineArt();
    e.setAttribute('transform', 'translate(100 60) scale(0.9)');
    e.classList.add('off');
    engineSvg.append(shed, e);
    const cont = h('button', { class: 'big-btn', type: 'button', 'aria-label': t('continue') }, continueIcon());
    const end = h('button', { class: 'big-btn', type: 'button', 'aria-label': t('endSession') }, endIcon());
    const overlay = h('div', { class: 'pause-overlay', role: 'dialog', 'aria-label': t('pause') }, engineSvg, h('div', { class: 'pause-actions' }, cont, end));
    cont.addEventListener('click', () => {
      overlay.remove();
      paused = false;
      touched();
    });
    end.addEventListener('click', () => {
      overlay.remove();
      deps.onEndSession();
    });
    screen.append(overlay);
  }

  // ---------- start ----------
  render();
  later(() => {
    phase = 'build';
    touched();
    render();
    if (level.intro) {
      later(() => {
        if (phase === 'build' && !correctPlaced() && !shownHint) showHint(true); // does not use a lamp
      }, tm.introPromptMs);
    }
  }, tm.lookMs);

  return () => {
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    window.removeEventListener('resize', fit);
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
  };
}

/** Test hook: every text node inside `el` (trimmed, non-empty). */
export function textNodes(el: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3 && n.textContent && n.textContent.trim()) out.push(n.textContent.trim());
    n.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}
