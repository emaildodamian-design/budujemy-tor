// Parent-facing screens (words allowed): the parent menu and the level preview.
//
// Entry: a 3 s hold on the END / LOCKED heading, or on the setup screen title.
//  - [Podgląd etapów]: every level and sibling by chapter, with its measured difficulty and
//    next / solved / helped marks. Tapping one plays it in a sandbox (the normal game screen
//    plus a parent bar). Nothing in preview writes to storage, except "Ustaw jako następny"
//    (3 s hold), which sets only the bookmark's `next` and clears `recent`.
//  - [Odblokuj dziś] (END / LOCKED only): exactly the v2 override: unlock, then setup.
//  - [Wróć]: back to the screen the menu was opened from (the lock stays).
// Preview never counts as a session and never unlocks.

import type { Level } from '../game/level';
import { type LevelStats, LEVELS, LEVEL_STATS, PREVIEW_ORDER } from '../game/levels';
import { type Bookmark, setNextLevel } from '../game/progress';
import type { T } from '../i18n';
import type { SoftAudio } from '../platform/audio';
import { type TIMING, mountLevel } from './game';
import { attachHold } from './longpress';
import { h } from './svg';

export interface ParentDeps {
  root: HTMLElement;
  t: T;
  audio: SoftAudio;
  /** END / LOCKED: the menu also offers [Odblokuj dziś]. */
  canUnlock: boolean;
  /** Exactly the v2 override: unlock, then go to setup. */
  onUnlock: () => void;
  /** Back to the screen the menu came from. */
  onBack: () => void;
  loadBookmark: () => Bookmark;
  saveBookmark: (b: Bookmark) => void;
  timing?: Partial<typeof TIMING>;
  levels?: readonly Level[];
  stats?: Record<string, LevelStats>;
}

/** Opens the parent menu in `deps.root`. Returns a cleanup function. */
export function showParentMenu(deps: ParentDeps): () => void {
  const { root, t } = deps;
  const order = deps.levels ?? PREVIEW_ORDER;
  const stats = deps.stats ?? LEVEL_STATS;
  let stop: (() => void) | null = null;
  const cleanup = () => {
    stop?.();
    stop = null;
  };
  const show = (el: HTMLElement) => {
    cleanup();
    root.replaceChildren(el);
    window.scrollTo?.(0, 0);
  };
  const button = (label: string, cls: string, onClick: () => void) => {
    const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  function menu() {
    const items = [button(t('previewLevels'), 'primary parent-preview', () => list())];
    if (deps.canUnlock)
      items.push(
        button(t('unlockToday'), 'secondary parent-unlock', () => {
          cleanup();
          deps.onUnlock();
        }),
      );
    items.push(
      button(t('back'), 'ghost-btn parent-back', () => {
        cleanup();
        deps.onBack();
      }),
    );
    show(h('main', { class: 'screen parent-menu' }, h('h1', {}, t('parentMenu')), ...items));
  }

  function statLine(id: string): string {
    const st = stats[id];
    if (!st) return '';
    return `${st.board} · ${t('statMin')} ${st.minLen} · +${st.distractors} · ${t('statPlan')} ${st.planDepth} · ${t('statDetour')} ${st.detour} · ${t('statSolutions')} ${st.solutions}`;
  }

  function list() {
    const bm = deps.loadBookmark();
    const nextId = LEVELS[Math.min(bm.next, LEVELS.length - 1)]?.id;
    const body = h('main', { class: 'screen parent-list' }, h('h1', {}, t('previewLevels')), h('p', { class: 'hint small' }, t('previewNote')));
    const back = button(t('back'), 'ghost-btn parent-back', () => menu());
    body.append(back);
    let chapter = 0;
    let section: HTMLElement | null = null;
    order.forEach((l, i) => {
      if (l.chapter !== chapter) {
        chapter = l.chapter;
        section = h('section', { class: 'settings preview-chapter' }, h('h3', {}, `${t('chapter')} ${chapter}`));
        body.append(section);
      }
      const sib = l.kind === 'sibling';
      const marks: string[] = [];
      if (!sib && l.id === nextId && bm.next < LEVELS.length) marks.push(t('markNext'));
      if (bm.solvedSelf.includes(l.id)) marks.push(t('markSolved'));
      if (bm.helped.includes(l.id)) marks.push(t('markHelped'));
      const play = h(
        'button',
        { class: `preview-item${sib ? ' is-sibling' : ''}`, type: 'button', 'data-id': l.id },
        h('strong', {}, sib ? `↳ ${l.id} (${t('sibling')})` : l.id),
        h('span', { class: 'preview-stats' }, statLine(l.id)),
        marks.length ? h('span', { class: 'preview-marks' }, marks.join(' · ')) : null,
      );
      play.addEventListener('click', () => sandbox(i));
      const row = h('div', { class: 'preview-row' }, play);
      if (!sib) {
        const setNext = h('button', { class: 'btn ghost-btn set-next', type: 'button', 'data-id': l.id }, t('setNext'));
        attachHold(setNext, () => {
          deps.saveBookmark(setNextLevel(deps.loadBookmark(), LEVELS.findIndex((x) => x.id === l.id)));
          list();
        });
        row.append(setNext);
      }
      section!.append(row);
    });
    body.append(button(t('back'), 'ghost-btn parent-back', () => menu()));
    show(body);
  }

  function sandbox(i: number) {
    const level = order[i];
    const controls: { showSolution?: () => void } = {};
    const bar = h('div', { class: 'preview-bar' });
    const badge = h('span', { class: 'preview-badge' }, `${t('previewBadge')} ${level.id}`);
    const sol = button(t('showSolution'), 'ghost-btn preview-solution', () => controls.showSolution?.());
    const prev = h('button', { class: 'btn ghost-btn preview-prev', type: 'button', 'aria-label': t('prevLevel') }, '◀');
    const next = h('button', { class: 'btn ghost-btn preview-next', type: 'button', 'aria-label': t('nextLevel') }, '▶');
    prev.addEventListener('click', () => sandbox((i - 1 + order.length) % order.length));
    next.addEventListener('click', () => sandbox((i + 1) % order.length));
    const exit = button(t('exit'), 'ghost-btn preview-exit', () => list());
    bar.append(badge, sol, prev, next, exit);
    const screen = h('div', { class: 'game-root' });
    show(screen);
    // Lamps, test runs and the stuck ladder work as in play; nothing is stored.
    stop = mountLevel(screen, {
      t: deps.t,
      audio: deps.audio,
      level,
      wagons: 1,
      timing: deps.timing,
      preview: { bar, controls },
      onSolved: () => sandbox(i),
      onEndSession: () => list(),
    });
  }

  menu();
  return cleanup;
}
