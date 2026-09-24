// The game screen: turn indicator, wagons, board, tray, bridge repair and the ride.
// All rules live in ../game/session.ts; this file only draws and forwards input.

import { type Cell, type TileKind, TILE_KINDS, cellKey, opposite } from '../game/grid';
import {
  type Player,
  type SessionState,
  BOARD,
  STATION,
  STATION_HEADING,
  TOTAL_TURNS,
  brokenTileIndex,
  canAct,
  createSession,
  currentPlayer,
  depot,
  finishRide,
  inputWaitMs,
  isBridgeTurn,
  placeTile,
  playerForTurn,
  tapBridge,
  turnKind,
} from '../game/session';
import type { T } from '../i18n';
import type { SoftAudio } from '../platform/audio';
import {
  CELL,
  avatarArt,
  depotFloorArt,
  depotRoofArt,
  engineArt,
  ridePath,
  stationArt,
  tileArt,
  trayTileSvg,
  wagonArt,
} from './art';
import { h, s } from './svg';

export interface GameDeps {
  t: T;
  audio: SoftAudio;
  /** All 12 turns are played: the session counts as finished (the ride is the ending). */
  onBuildDone: () => void;
  /** Engine is off in the depot: show the END screen. */
  onFinished: () => void;
}

const now = () => Date.now();
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Drop tolerance: the tile counts as "on" the target cell if its centre is this far outside it. */
const DROP_SLACK = 0.35;

export function mountGame(root: HTMLElement, deps: GameDeps): () => void {
  const { t, audio } = deps;
  let state: SessionState = createSession(now());
  let unlockTimer = 0;
  let disposed = false;
  let justPlacedKey: string | null = null;

  // ---------- static layout ----------
  const avatars: Record<Player, HTMLElement> = {
    child: h('div', { class: 'avatar child', 'aria-label': t('childTurn') }, avatarArt('child')),
    parent: h('div', { class: 'avatar parent', 'aria-label': t('parentTurn') }, avatarArt('parent')),
  };
  const wagons = h('div', { class: 'wagons', role: 'img', 'aria-label': t('wagonsLeft') });
  const wagonEls = Array.from({ length: TOTAL_TURNS }, (_, i) => {
    const w = h('div', { class: `wagon ${playerForTurn(i)}` }, wagonArt(playerForTurn(i)));
    wagons.append(w);
    return w;
  });
  const status = h('p', { class: 'status', 'aria-live': 'polite' });

  const board = s('svg', {
    class: 'board',
    viewBox: `0 0 ${BOARD.cols * CELL} ${BOARD.rows * CELL}`,
    role: 'img',
    'aria-label': t('appTitle'),
  });
  const layers = {
    grid: s('g', { class: 'grid' }),
    tiles: s('g', {}),
    target: s('g', {}),
    depotFloor: s('g', {}),
    engine: s('g', {}),
    depotRoof: s('g', {}),
  };
  board.append(...Object.values(layers));
  for (let y = 0; y < BOARD.rows; y++)
    for (let x = 0; x < BOARD.cols; x++)
      layers.grid.append(s('rect', { class: 'cell', x: x * CELL + 3, y: y * CELL + 3, width: 94, height: 94, rx: 14 }));

  const engine = engineArt();
  layers.engine.append(engine);
  placeEngine(STATION.x * CELL + 50, STATION.y * CELL + 50, [-90, 0, 90, 180][STATION_HEADING]);

  const tray = h('div', { class: 'tray' });
  const boardWrap = h('div', { class: 'board-wrap' }, board);
  const screen = h(
    'main',
    { class: 'screen game' },
    h('header', { class: 'turnbar' }, avatars.child, h('div', { class: 'turnbar-mid' }, wagons, status), avatars.parent),
    boardWrap,
    tray,
  );
  root.replaceChildren(screen);

  // ---------- rendering ----------
  function placeEngine(x: number, y: number, deg: number) {
    engine.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(0.9)`);
  }

  function cellG(c: Cell, child: SVGGElement, cls = ''): SVGGElement {
    return s('g', { class: `cell-g ${cls}`, transform: `translate(${c.x * CELL} ${c.y * CELL})` }, child);
  }

  function renderBoard() {
    layers.tiles.replaceChildren(cellG(STATION, stationArt(STATION_HEADING)));
    state.tiles.forEach((tile) => {
      const key = cellKey(tile.cell);
      const g = cellG(tile.cell, tileArt(tile), key === justPlacedKey ? 'settle' : '');
      if (tile.broken && turnKind(state) === 'fix') g.classList.add('needs-fix');
      layers.tiles.append(g);
    });
    justPlacedKey = null;

    layers.target.replaceChildren();
    if (state.phase === 'build' && turnKind(state) === 'place') {
      const c = state.head.cell;
      layers.target.append(
        s('rect', {
          class: `target ${currentPlayer(state)}${canAct(state, now()) ? ' ready' : ''}`,
          x: c.x * CELL + 6,
          y: c.y * CELL + 6,
          width: 88,
          height: 88,
          rx: 14,
        }),
      );
    }
  }

  function renderTurnbar() {
    const who = currentPlayer(state);
    const building = state.phase === 'build';
    for (const p of ['child', 'parent'] as const) {
      const el = avatars[p];
      el.classList.toggle('active', building && p === who);
      el.querySelector('.countdown')?.remove();
    }
    if (building && !canAct(state, now())) {
      // Soft ring that fills during the pause. Restarted per turn.
      const ring = s('svg', { class: 'countdown', viewBox: '0 0 100 100', 'aria-hidden': 'true' }, s('circle', { cx: 50, cy: 50, r: 46, pathLength: 100 }));
      ring.style.setProperty('--wait', `${inputWaitMs(state, now())}ms`);
      avatars[who].append(ring);
    }
    wagonEls.forEach((w, i) => {
      w.classList.toggle('gone', i < state.turn);
      w.classList.toggle('current', building && i === state.turn);
    });
    screen.dataset.player = building ? who : '';
  }

  function renderTray() {
    tray.replaceChildren();
    if (state.phase !== 'build') {
      tray.append(h('p', { class: 'tray-note' }, t('ride')));
      status.textContent = '';
      return;
    }
    const ready = canAct(state, now());
    status.textContent = !ready
      ? t('waiting')
      : turnKind(state) === 'fix'
        ? t('fixTogether')
        : isBridgeTurn(state)
          ? t('bridgeHint')
          : t('yourMove');

    if (!ready) {
      const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
      const secs = Math.ceil(inputWaitMs(state, now()) / 1000);
      for (let i = 0; i < secs; i++) {
        const d = h('span', { class: 'dot' });
        d.style.animationDelay = `${(i + 1) * 1000 - 600}ms`;
        dots.append(d);
      }
      tray.append(dots);
    }

    if (turnKind(state) === 'fix') {
      tray.append(fixPanel(ready));
      return;
    }
    const row = h('div', { class: `tray-tiles${ready ? '' : ' resting'}` });
    for (const kind of TILE_KINDS) row.append(trayTile(kind));
    tray.append(row);
  }

  function render() {
    renderTurnbar();
    renderBoard();
    renderTray();
  }

  // ---------- turn flow ----------
  function commit(next: SessionState) {
    state = next;
    render();
    scheduleUnlock();
    if (state.phase === 'ride') {
      deps.onBuildDone();
      void ride();
    }
  }

  function scheduleUnlock() {
    clearTimeout(unlockTimer);
    if (state.phase !== 'build') return;
    const ms = inputWaitMs(state, now());
    if (ms > 0) unlockTimer = window.setTimeout(render, ms + 20);
  }

  // ---------- tray tiles & drag ----------
  function trayTile(kind: TileKind): HTMLElement {
    const look = { heading: state.head.heading, kind, bridge: isBridgeTurn(state), broken: isBridgeTurn(state) };
    const el = h('div', { class: 'tray-tile', role: 'button', 'aria-label': t(`tile_${kind}`) }, trayTileSvg(look));
    el.addEventListener('pointerdown', (e) => startDrag(e, kind, el, look));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  function targetRect(): DOMRect {
    const b = board.getBoundingClientRect();
    const size = b.width / BOARD.cols;
    const c = state.head.cell;
    return new DOMRect(b.left + c.x * size, b.top + c.y * size, size, size);
  }

  function startDrag(e: PointerEvent, kind: TileKind, src: HTMLElement, look: Parameters<typeof trayTileSvg>[0]) {
    if (!e.isPrimary || !canAct(state, now()) || turnKind(state) !== 'place') return;
    e.preventDefault();
    const size = board.getBoundingClientRect().width / BOARD.cols;
    const ghost = h('div', { class: 'ghost' }, trayTileSvg(look));
    ghost.style.width = ghost.style.height = `${size}px`;
    document.body.append(ghost);
    src.classList.add('lifted');
    src.setPointerCapture(e.pointerId);

    const lift = size * 0.35; // keep the tile visible above the finger
    let cx = e.clientX;
    let cy = e.clientY - lift;
    const moveTo = (x: number, y: number) => {
      cx = x;
      cy = y;
      ghost.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(1.06)`;
    };
    const overTarget = () => {
      const r = targetRect();
      const slack = r.width * DROP_SLACK;
      return cx >= r.left - slack && cx <= r.right + slack && cy >= r.top - slack && cy <= r.bottom + slack;
    };
    const targetEl = () => layers.target.querySelector('.target');
    moveTo(cx, cy);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      moveTo(ev.clientX, ev.clientY - lift);
      targetEl()?.classList.toggle('hover', overTarget());
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      src.removeEventListener('pointermove', onMove);
      src.removeEventListener('pointerup', end);
      src.removeEventListener('pointercancel', end);
      const result = ev.type === 'pointerup' && overTarget() ? placeTile(state, kind, state.head.cell, now()) : null;
      if (result?.ok) {
        ghost.remove();
        justPlacedKey = cellKey(state.head.cell);
        audio.play('place');
        commit(result.state);
        return;
      }
      snapBack(ghost, src);
      targetEl()?.classList.remove('hover');
    };
    src.addEventListener('pointermove', onMove);
    src.addEventListener('pointerup', end);
    src.addEventListener('pointercancel', end);
  }

  /** Invalid drop: the tile glides home. No sound, no red, no shake. */
  function snapBack(ghost: HTMLElement, src: HTMLElement) {
    const r = src.getBoundingClientRect();
    const size = parseFloat(ghost.style.width);
    ghost.classList.add('returning');
    ghost.style.transform = `translate(${r.left + r.width / 2 - size / 2}px, ${r.top + r.height / 2 - size / 2}px) scale(${r.width / size})`;
    const done = () => {
      ghost.remove();
      src.classList.remove('lifted');
    };
    ghost.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 700); // in case transitionend never fires
  }

  // ---------- fix it together ----------
  function fixPanel(ready: boolean): HTMLElement {
    const panel = h('div', { class: `fix-panel${ready ? '' : ' resting'}` });
    const art = s('svg', { class: 'fix-bridge', viewBox: '0 0 300 120', 'aria-hidden': 'true' });
    art.append(
      s('rect', { class: 'tile-water', x: 0, y: 0, width: 300, height: 120, rx: 18 }),
      s('rect', { class: 'deck', x: 0, y: 34, width: 80, height: 52 }),
      s('rect', { class: 'deck', x: 220, y: 34, width: 80, height: 52 }),
    );
    for (const p of ['child', 'parent'] as const) {
      if (state.repairTaps[p]) art.append(s('rect', { class: `deck patch fill-${p}-soft`, x: p === 'child' ? 80 : 150, y: 34, width: 70, height: 52 }));
    }
    for (const y of [44, 76]) {
      art.append(s('path', { class: 'rail', d: `M0 ${y} H80 M220 ${y} H300` }));
      if (state.repairTaps.child) art.append(s('path', { class: 'rail', d: `M80 ${y} H150` }));
      if (state.repairTaps.parent) art.append(s('path', { class: 'rail', d: `M150 ${y} H220` }));
    }
    panel.append(art);
    for (const p of ['child', 'parent'] as const) {
      const btn = h(
        'button',
        { class: `fix-spot ${p}${state.repairTaps[p] ? ' done' : ''}`, type: 'button', 'aria-label': `${t('fixHint')} (${t(p === 'child' ? 'childTurn' : 'parentTurn')})` },
        avatarArt(p),
      );
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const r = tapBridge(state, p, now());
        if (!r.ok) return;
        const fixed = brokenTileIndex(r.state) === -1;
        audio.play(fixed ? 'repaired' : 'repairTap');
        if (fixed) justPlacedKey = cellKey(state.tiles[brokenTileIndex(state)].cell);
        commit(r.state);
      });
      panel.append(btn);
    }
    return panel;
  }

  // ---------- the ride ----------
  async function ride() {
    const d = depot(state);
    layers.depotFloor.replaceChildren(cellG(d.cell, depotFloorArt()));
    const roof = cellG(d.cell, depotRoofArt(opposite(d.heading)), 'roof-in');
    layers.depotRoof.replaceChildren(roof);

    const path = s('path', { d: ridePath(STATION, STATION_HEADING, state.tiles, d.cell), fill: 'none' });
    layers.target.replaceChildren(path);
    await wait(1200);
    if (disposed) return;

    const total = path.getTotalLength();
    const cells = state.tiles.length + 1;
    const duration = prefersReducedMotion() ? 4000 : Math.max(9000, cells * 1150);
    const start = performance.now();
    let lastChug = -Infinity;
    engine.classList.add('running');

    await new Promise<void>((resolve) => {
      const frame = (ts: number) => {
        if (disposed) return resolve();
        const k = Math.min(1, (ts - start) / duration);
        const eased = 0.5 - Math.cos(Math.PI * k) / 2; // gentle start and stop
        const len = eased * total;
        const p = path.getPointAtLength(len);
        const q = path.getPointAtLength(Math.min(total, len + 2));
        const back = path.getPointAtLength(Math.max(0, len - 2));
        const deg = (Math.atan2(q.y - back.y, q.x - back.x) * 180) / Math.PI;
        placeEngine(p.x, p.y, deg);
        if (len - lastChug >= CELL * 0.8 && k < 0.97) {
          lastChug = len;
          audio.play('chug');
        }
        if (k < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    if (disposed) return;

    // Parked in the depot: engine switches off.
    engine.classList.remove('running');
    engine.classList.add('off');
    roof.classList.add('closed');
    audio.play('engineOff');
    await wait(2600);
    if (disposed) return;
    state = finishRide(state);
    deps.onFinished();
  }

  // ---------- start ----------
  render();
  scheduleUnlock();

  return () => {
    disposed = true;
    clearTimeout(unlockTimer);
    document.querySelectorAll('.ghost').forEach((g) => g.remove());
  };
}
