// Static and unit checks for the hard safeguards that are not turn logic.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n';
import { MAX_GAIN, MIN_ATTACK_S, SOUNDS } from '../src/platform/audio';
import { DEFAULT_SETTINGS, parseLock, parseSettings } from '../src/platform/settings';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const APP = sources('src').map((p) => ({ p, code: readFileSync(p, 'utf8') }));

describe('no network, no tracking, no notifications (safeguards 4 & 7)', () => {
  const forbidden: [string, RegExp][] = [
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['sendBeacon', /sendBeacon/],
    ['WebSocket', /WebSocket/],
    ['EventSource', /EventSource/],
    ['Notification', /\bNotification\b/],
    ['push subscription', /pushManager/i],
    ['remote URL', /https?:\/\/(?!www\.w3\.org\/2000\/svg)/],
    ['analytics', /analytics|gtag|googletagmanager|sentry/i],
  ];
  for (const [name, re] of forbidden) {
    it(`app code never uses ${name}`, () => {
      const hits = APP.filter(({ code }) => re.test(code)).map(({ p }) => p);
      expect(hits).toEqual([]);
    });
  }

  it('the service worker only answers same-origin GET requests', () => {
    const sw = readFileSync('sw/sw.template.js', 'utf8');
    expect(sw).toMatch(/req\.method !== 'GET' \|\| url\.origin !== self\.location\.origin\) return;/);
  });

  it('v2 bumps the service-worker cache name, and old caches are cleared on activate', () => {
    const sw = readFileSync('sw/sw.template.js', 'utf8');
    expect(sw).toContain('const CACHE = `budujemy-tor-v2-${VERSION}`;');
    expect(sw).toMatch(/k\.startsWith\('budujemy-tor-'\) && k !== CACHE/);
  });

  it('the built page is locked down with connect-src none', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toContain(`"connect-src 'none'"`);
  });
});

describe('no scores or rewards (safeguard 4)', () => {
  it('no UI text about points, stars, streaks, levels or playing again', () => {
    const all = Object.values(STRINGS).flatMap((t) => Object.values(t)).join(' ').toLowerCase();
    for (const word of ['punkt', 'gwiazd', 'seria', 'poziom', 'jeszcze raz', 'ponownie', 'pontos', 'estrela', 'nível', 'outra vez', 'de novo']) {
      expect(all).not.toContain(word);
    }
  });
});

describe('language (safeguard 6)', () => {
  it('Polish is the default and Portuguese has every string', () => {
    expect(DEFAULT_SETTINGS.lang).toBe('pl');
    expect(Object.keys(STRINGS.pt).sort()).toEqual(Object.keys(STRINGS.pl).sort());
    for (const v of Object.values(STRINGS.pt)) expect(v.length).toBeGreaterThan(0);
  });

  it('the END screen reads "Koniec. Teraz:" in Polish', () => {
    expect(`${STRINGS.pl.endTitle} ${STRINGS.pl.endNow}`).toBe('Koniec. Teraz:');
  });
});

describe('sound (safeguard 3)', () => {
  it('is OFF by default, including for missing or corrupt settings', () => {
    expect(DEFAULT_SETTINGS.sound).toBe(false);
    expect(parseSettings(null).sound).toBe(false);
    expect(parseSettings('{not json').sound).toBe(false);
    expect(parseSettings('{"sound":"yes"}').sound).toBe(false);
    expect(parseSettings('{"sound":true}').sound).toBe(true);
  });

  it('every sound is quiet and fades in (never sudden or loud)', () => {
    expect(MAX_GAIN).toBeLessThanOrEqual(0.1);
    expect(MIN_ATTACK_S).toBeGreaterThanOrEqual(0.03);
    for (const notes of Object.values(SOUNDS)) {
      for (const n of notes) {
        expect(n.gain).toBeLessThanOrEqual(1);
        expect(n.freq).toBeGreaterThanOrEqual(100); // no rumble
        expect(n.freq).toBeLessThanOrEqual(800); // no shrill tones
      }
    }
  });
});

describe('stored state parsing', () => {
  it('unknown values fall back to safe defaults', () => {
    expect(parseSettings('{"lang":"de","card":"tv"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseLock('garbage')).toEqual({ lastEndedDay: null });
    expect(parseLock('{"lastEndedDay":"2026-09-24"}')).toEqual({ lastEndedDay: '2026-09-24' });
  });
});

describe('parent override stays hidden (next-day lock)', () => {
  it('no visible override button anywhere; the END and locked headings carry the 3 s hold', () => {
    for (const { p, code } of APP) {
      expect(code, p).not.toMatch(/holdButton|hold-btn|parentHold'/);
    }
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/withOverride\(h\('h1', \{ class: 'end-title' \}/);
    expect(main).toMatch(/withOverride\(h\('h1', \{\}, t\('lockedTitle'\)\)\)/);
    // The override itself uses the default 3 s hold.
    expect(main).toMatch(/attachHold\(heading, \(\) => \{/);
  });
});
