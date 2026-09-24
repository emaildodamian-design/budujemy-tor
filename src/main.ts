// App shell: setup (parent) → intro (Potem card) → game → END. Locked until tomorrow afterwards.

import './style.css';
import { isLocked, markSessionEnded, UNLOCKED } from './game/lock';
import { type CardId, CARD_IDS, type Lang, LANGS, type T, translator } from './i18n';
import { SoftAudio } from './platform/audio';
import { deletePhoto, getPhoto, savePhoto, shrinkPhoto } from './platform/photos';
import { type Settings, loadLock, loadSettings, saveLock, saveSettings } from './platform/settings';
import { cardIcon } from './ui/art';
import { mountGame } from './ui/game';
import { holdButton } from './ui/longpress';
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

  const next = h('button', { class: 'btn primary big', type: 'button' }, t('start'));
  next.addEventListener('click', () => showIntro());

  show(
    h(
      'main',
      { class: 'screen setup' },
      h('h1', {}, t('appTitle')),
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
      ),
      next,
    ),
  );
}

// ---------- intro: the Potem card is shown before play ----------
function showIntro() {
  // The language is fixed from here until the session is over.
  const t = translator(settings.lang);
  setLang(settings.lang);
  const go = h('button', { class: 'btn primary big', type: 'button' }, t('go'));
  go.addEventListener('click', () => showGame(t));
  show(h('main', { class: 'screen intro' }, h('p', { class: 'lead' }, t('introFirst')), h('p', { class: 'lead' }, t('then')), cardView(settings.card, photoUrl, t, true), go));
}

// ---------- game ----------
function showGame(t: T) {
  const screen = h('div', { class: 'game-root' });
  show(screen);
  void keepAwake(true);
  const card = settings.card;
  cleanup = mountGame(screen, {
    t,
    audio,
    onBuildDone: () => saveLock(markSessionEnded(new Date())),
    onFinished: () => {
      void keepAwake(false);
      showEnd(t, card);
    },
  });
}

// ---------- END / locked ----------
function overrideButton(t: T): HTMLElement {
  return holdButton(t('parentHold'), () => {
    saveLock(UNLOCKED);
    void showSetup();
  });
}

function showEnd(t: T, card: CardId) {
  show(
    h(
      'main',
      { class: 'screen end' },
      h('h1', { class: 'end-title' }, t('endTitle'), ' ', t('endNow')),
      cardView(card, photoUrl, t, true),
      h('div', { class: 'corner' }, overrideButton(t)),
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
      h('h1', {}, t('lockedTitle')),
      h('p', { class: 'lead' }, t('lockedSub')),
      h('p', { class: 'lead small' }, t('endNow')),
      cardView(settings.card, url, t),
      h('div', { class: 'corner' }, overrideButton(t)),
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
