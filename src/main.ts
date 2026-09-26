// App shell: setup (parent) → intro picture → a session of 4 puzzle levels → depot ride → END.
// Locked until tomorrow afterwards. A hidden 3 s hold on the END / LOCKED heading (or on the
// setup title) opens the parent menu: level preview, and on END / LOCKED the v2 unlock.

import './style.css';
import { dayKey, isLocked, markSessionEnded, UNLOCKED } from './game/lock';
import { ALL_LEVELS, LEVEL_COUNT } from './game/levels';
import { type Bookmark, type SessionRun, SLOTS, endSession, finishLevel, levelForSlot, progressCount, startSession } from './game/progress';
import { type CardId, CARD_IDS, type Lang, LANGS, type T, translator } from './i18n';
import { SoftAudio } from './platform/audio';
import { deletePhoto, getPhoto, savePhoto, shrinkPhoto } from './platform/photos';
import { type Settings, loadBookmark, loadLock, loadSettings, saveBookmark, saveLock, saveSettings } from './platform/settings';
import { cardIcon } from './ui/art';
import { mountLevel } from './ui/game';
import { showParentMenu } from './ui/parent';
import { depotRideScene, introScene } from './ui/scenes';
import { attachHold } from './ui/longpress';
import { h } from './ui/svg';

const root = document.getElementById('app')!;
let settings: Settings = loadSettings();
const audio = new SoftAudio(settings.sound);
let photoUrl: string | null = null;
let cleanup: (() => void) | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

function setLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.title = translator(lang)('appTitle');
}

async function loadPhotoUrl(card: CardId): Promise<string | null> {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  const blob = await getPhoto(card);
  photoUrl = blob ? URL.createObjectURL(blob) : null;
  return photoUrl;
}

function cardView(card: CardId, url: string | null, t: T, big = false): HTMLElement {
  return h(
    'figure',
    { class: `potem-card${big ? ' big' : ''}` },
    url ? h('img', { src: url, alt: '', class: 'card-photo', draggable: 'false' }) : cardIcon(card),
    h('figcaption', {}, t(`card_${card}`)),
  );
}

function show(screen: HTMLElement) {
  cleanup?.();
  cleanup = null;
  root.replaceChildren(screen);
  window.scrollTo(0, 0);
}

// ---------- setup (parent) ----------
async function showSetup() {
  setLang(settings.lang);
  const t = translator(settings.lang);
  const url = await loadPhotoUrl(settings.card);

  const update = (patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    audio.setEnabled(settings.sound);
    void showSetup();
  };

  const cards = h('div', { class: 'card-grid', role: 'radiogroup', 'aria-label': t('setupHeading') });
  for (const id of CARD_IDS) {
    const b = h(
      'button',
      { class: `card-choice${id === settings.card ? ' selected' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(id === settings.card) },
      cardIcon(id),
      h('span', {}, t(`card_${id}`)),
    );
    b.addEventListener('click', () => update({ card: id }));
    cards.append(b);
  }

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-input' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await savePhoto(settings.card, await shrinkPhoto(file));
    void showSetup();
  });
  const photoRow = h(
    'div',
    { class: 'photo-row' },
    url ? h('img', { src: url, alt: '', class: 'photo-preview' }) : null,
    h('label', { for: 'photo-input', class: 'btn secondary' }, url ? t('changePhoto') : t('addPhoto')),
    fileInput,
  );
  if (url) {
    const rm = h('button', { class: 'btn ghost-btn', type: 'button' }, t('removePhoto'));
    rm.addEventListener('click', async () => {
      await deletePhoto(settings.card);
      void showSetup();
    });
    photoRow.append(rm);
  }

  const soundBtn = h(
    'button',
    { class: `toggle${settings.sound ? ' on' : ''}`, type: 'button', 'aria-pressed': String(settings.sound) },
    settings.sound ? t('soundOn') : t('soundOff'),
  );
  soundBtn.addEventListener('click', () => {
    update({ sound: !settings.sound });
    if (!settings.sound) return;
    audio.play('place'); // let the parent hear how soft it is
  });

  const langRow = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('language') });
  for (const lang of LANGS) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(lang === settings.lang), class: lang === settings.lang ? 'on' : '' }, lang.toUpperCase());
    b.addEventListener('click', () => update({ lang }));
    langRow.append(b);
  }

  // Parent-facing: the start button needs a 1.5 s hold, so a child's tap does nothing.
  const next = h('button', { class: 'btn primary big hold-start', type: 'button' }, t('start'));
  attachHold(next, () => showIntro(), 1500);

  const bm = loadBookmark();
  const recent = bm.log.length
    ? h('p', { class: 'hint small' }, `${t('progressRecent')}: `, bm.log.map((l) => `${l.self} / ${l.helped}`).join(' · '))
    : h('p', { class: 'hint small' }, t('progressNone'));
  const progress = h(
    'section',
    { class: 'settings', 'aria-label': t('progress') },
    h('h3', {}, t('progress')),
    h('div', { class: 'setting' }, h('span', {}, t('progressBoards')), h('strong', {}, `${progressCount(bm, LEVEL_COUNT)} / ${LEVEL_COUNT}`)),
    recent,
  );

  // Hidden 3 s hold on the title: the parent menu (preview only; nothing to unlock here).
  const title = h('h1', {}, t('appTitle'));
  attachHold(title, () => openParentMenu(false, () => void showSetup()));

  show(
    h(
      'main',
      { class: 'screen setup' },
      title,
      h('h2', {}, t('setupHeading')),
      h('p', { class: 'hint' }, t('setupHint')),
      cards,
      photoRow,
      h('p', { class: 'hint small' }, t('photoLocal')),
      h(
        'section',
        { class: 'settings', 'aria-label': t('settings') },
        h('h3', {}, t('settings')),
        h('div', { class: 'setting' }, h('span', {}, t('sound')), soundBtn),
        h('div', { class: 'setting' }, h('span', {}, t('language')), langRow),
        h('p', { class: 'hint small' }, t('parentHoldHint')),
      ),
      progress,
      next,
    ),
  );
}

// ---------- intro: track, then the Potem card (pictures only) ----------
function showIntro() {
  // The language is fixed from here until the session is over.
  const t = translator(settings.lang);
  setLang(settings.lang);
  const scene = introScene(settings.card, photoUrl, () => showSession(t));
  show(scene.el);
  cleanup = scene.stop;
}

// ---------- a session: 4 slots ----------
function showSession(t: T) {
  const card = settings.card;
  const day = dayKey(new Date());
  let bm: Bookmark = loadBookmark();
  let run: SessionRun = startSession(ALL_LEVELS, bm, day);
  let ended = false;
  void keepAwake(true);

  const finish = () => {
    if (ended) return;
    ended = true;
    // Saved before the ride, so closing the app now does not re-open play today.
    bm = endSession(bm, run, dayKey(new Date()));
    saveBookmark(bm);
    saveLock(markSessionEnded(new Date()));
    const scene = depotRideScene(() => {
      void keepAwake(false);
      showEnd(t, card);
    });
    show(scene.el);
    cleanup = scene.stop;
  };

  const play = () => {
    const screen = h('div', { class: 'game-root' });
    show(screen);
    cleanup = mountLevel(screen, {
      t,
      audio,
      level: levelForSlot(ALL_LEVELS, run.current),
      wagons: SLOTS - run.slot,
      onSolved: (result) => {
        const r = finishLevel(ALL_LEVELS, bm, run, result);
        bm = r.bm;
        run = r.run;
        saveBookmark(bm);
        if (r.over) finish();
        else play();
      },
      // Parent pause → end: the level in progress is not counted (the bookmark is unchanged).
      onEndSession: finish,
    });
  };
  play();
}

// ---------- parent menu ----------
/** Parent menu (words allowed). Preview writes nothing except "Ustaw jako następny". */
function openParentMenu(canUnlock: boolean, back: () => void) {
  const screen = h('div', { class: 'parent-root' });
  show(screen);
  cleanup = showParentMenu({
    root: screen,
    t: translator(settings.lang),
    audio,
    canUnlock,
    // Exactly the v2 override: unlock, then go to setup.
    onUnlock: () => {
      saveLock(UNLOCKED);
      void showSetup();
    },
    onBack: back,
    loadBookmark,
    saveBookmark,
  });
}

// ---------- END / locked ----------
/** The heading doubles as the hidden parent menu (hold 3 s). No visible button. */
function withOverride(heading: HTMLElement, back: () => void): HTMLElement {
  attachHold(heading, () => openParentMenu(true, back));
  return heading;
}

function showEnd(t: T, card: CardId) {
  show(
    h(
      'main',
      { class: 'screen end' },
      withOverride(h('h1', { class: 'end-title' }, t('endTitle'), ' ', t('endNow')), () => showEnd(t, card)),
      cardView(card, photoUrl, t, true),
    ),
  );
}

async function showLocked() {
  setLang(settings.lang);
  const t = translator(settings.lang);
  const url = await loadPhotoUrl(settings.card);
  show(
    h(
      'main',
      { class: 'screen locked' },
      h('div', { class: 'moon', 'aria-hidden': 'true' }),
      withOverride(h('h1', {}, t('lockedTitle')), () => void showLocked()),
      h('p', { class: 'lead' }, t('lockedSub')),
      h('p', { class: 'lead small' }, t('endNow')),
      cardView(settings.card, url, t),
    ),
  );
}

async function keepAwake(on: boolean) {
  try {
    if (on) wakeLock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null;
    else {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch {
    // Not supported or not allowed: harmless.
  }
}

// ---------- boot ----------
async function boot() {
  if (isLocked(loadLock(), new Date())) await showLocked();
  else await showSetup();
}

void boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', { scope: './' });
  });
}
