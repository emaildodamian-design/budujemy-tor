// Parent settings, the next-day lock and the puzzle bookmark, kept in localStorage on
// this device only. Every access is wrapped: the app works without storage.

import type { LockState } from '../game/lock';
import { UNLOCKED } from '../game/lock';
import { type Bookmark, parseBookmark } from '../game/progress';
import { type CardId, CARD_IDS, type Lang, LANGS } from '../i18n';

export interface Settings {
  lang: Lang;
  /** Sound is OFF by default. */
  sound: boolean;
  card: CardId;
}

export const DEFAULT_SETTINGS: Settings = { lang: 'pl', sound: false, card: 'bath' };

const SETTINGS_KEY = 'budujemy-tor:settings';
const LOCK_KEY = 'budujemy-tor:lock';
const BOOKMARK_KEY = 'budujemy-tor:bookmark';

/** Parse stored settings, falling back to safe defaults for anything unknown. */
export function parseSettings(raw: string | null): Settings {
  let v: Partial<Settings> = {};
  try {
    v = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    v = {};
  }
  return {
    lang: LANGS.includes(v.lang as Lang) ? (v.lang as Lang) : DEFAULT_SETTINGS.lang,
    sound: v.sound === true,
    card: CARD_IDS.includes(v.card as CardId) ? (v.card as CardId) : DEFAULT_SETTINGS.card,
  };
}

export function parseLock(raw: string | null): LockState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<LockState>) : null;
    return typeof v?.lastEndedDay === 'string' ? { lastEndedDay: v.lastEndedDay } : UNLOCKED;
  } catch {
    return UNLOCKED;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode): the app still works for this visit.
  }
}

export const loadSettings = (): Settings => parseSettings(read(SETTINGS_KEY));
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
export const loadLock = (): LockState => parseLock(read(LOCK_KEY));
export const saveLock = (l: LockState): void => write(LOCK_KEY, l);
export const loadBookmark = (): Bookmark => parseBookmark(read(BOOKMARK_KEY));
export const saveBookmark = (b: Bookmark): void => write(BOOKMARK_KEY, b);
