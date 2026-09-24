# Budujemy Tor

A calm, turn-based **co-play** game for one parent and one young child on one phone.
They take turns laying track tiles, then watch the toy train ride the track they built
together, park in the depot and switch off. Then: *"Koniec. Teraz: [kąpiel / jedzenie / spacer / książka]"*.

Offline-first PWA · Polish UI (Portuguese optional) · no backend, no accounts, no analytics,
no network calls · sound off by default · one session per day.

The contract is [`SPEC.md`](SPEC.md). The PR description tracks done / not done against it.

## How a session goes

1. **Parent setup**: pick the *Potem* card (bath, meal, walk, book), optionally add a photo
   (kept only on this phone in IndexedDB), set sound (off by default) and language (PL / PT).
2. **Intro**: "Najpierw budujemy tor. Potem: [card]".
3. **12 turns**, CHILD first, then PARENT, alternating. Each turn opens after a soft ~5 s pause
   (a ring fills around the active avatar and dots fade out). The player drags one tile
   (curve left / straight / curve right) from the tray onto the glowing cell at the end of the track.
   A drop anywhere else, or a tile that would box the track in, glides back: no sound, no red.
   Wagons at the top show the turns left and disappear one by one.
4. **Broken bridge** (1 or 2 times): on a PARENT turn the tiles are broken bridges. The next CHILD
   turn is "fix it together": the child and the parent each tap their own spot on the bridge.
5. **Ride**: the train rolls slowly along the whole track once, into the depot, and switches off
   (smoke stops, headlight dims).
6. **END**: "Koniec. Teraz: [card]". No play-again button. Until tomorrow the app shows
   "Tor na dziś gotowy". A parent can override by holding the lock button for 3 seconds.

## Run locally

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit tests (vitest)
npm run build      # static site in dist/ (typecheck + build + generated sw.js)
npm run preview    # serve dist/ at http://localhost:4173 (service worker active)
```

To try it on a phone on the same Wi-Fi: `npm run build && npx vite preview --host`, then open
`http://<your-computer-ip>:4173`. (Installing as an app and offline mode need HTTPS, so use
GitHub Pages for the real install.)

## Deploy to GitHub Pages

The build uses relative paths (`base: './'`), so it works at `https://<user>.github.io/<repo>/`.

1. Merge the PR into `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → "Deploy to GitHub Pages" → Run workflow** (branch `main`).
4. The URL appears in the workflow summary, e.g. `https://emaildodamian-design.github.io/budujemy-tor/`.

Re-run step 3 after each change. Alternative without Actions: `npm run build` and publish the
contents of `dist/` to a `gh-pages` branch.

## Install on Android (Chrome, Pixel)

1. Open the GitHub Pages URL in **Chrome** once while online. Wait until the setup screen shows
   (the service worker caches everything on this first load).
2. Chrome menu **⋮ → Add to Home screen → Install** (or accept the "Install app" prompt).
3. Launch it from the home-screen icon: it opens full screen, portrait.
4. Check offline: turn on airplane mode and open the app again. It should work fully.

Tips: turn on Android **Screen pinning** (Settings → Security → App pinning) so a child cannot
leave the app; the game keeps the screen awake while playing. Updates are picked up the next
time the app is opened online.

## Design decisions

**Tech: vanilla TypeScript + Vite (build only), no runtime framework.** The app is five small
screens and one SVG board. A framework would add weight and abstraction without value here;
vanilla TS keeps the bundle ~10 KB gzipped (fast first load on mobile, tiny offline cache),
gives direct control over pointer events and animation for drag-and-drop, and has zero runtime
dependencies to audit for tracking or network calls. Vite only bundles; Vitest runs the tests.

**All rules are pure functions** in `src/game/` (`session.ts`, `lock.ts`, `grid.ts`). Time and
randomness are passed in, so the turn logic, cap, input delay, bridge and lock are unit-tested
without a browser. The UI in `src/ui/` only draws and forwards input.

**Interpretations of the spec**

| Spec item | How it is implemented |
|---|---|
| "adjacent free cell" | The track grows from its open end, so exactly one cell is valid: the one the track points to. It glows in the active player's colour. |
| straight / curve | The tray shows *curve left, straight, curve right*, already drawn in board orientation: what you drag is what you get. |
| Never getting stuck | A tile is refused (it just slides back) if it would leave no room for all remaining turns plus the depot. Tested over 400 random games. |
| Broken bridge 1–2× | Scheduled at session start on the parent's 2nd–5th turn (never the first or the last parent turn; two bridges are never back to back). |
| "both tap the bridge" | The fix panel shows the bridge with one spot in each player's colour; both must be tapped (any order, simultaneous works). The fix uses up the child's turn. |
| Session end / lock | The lock is saved when the 12th turn is played (so closing the app during the ride does not re-open play). Unlocks at local midnight. Clock set backwards stays locked. |
| Parent override | Hold the lock button 3 s (ring fills; letting go early resets). Allows one more session today. |
| Soft sound | Synthesised sine tones only, max gain 0.08, ≥ 40 ms fade-in; no audio files. No sound at all for an invalid drop. |
| No network | No `fetch`/XHR/beacons in app code (tested), and the built page has CSP `connect-src 'none'`. The service worker only serves same-origin files from its cache. |

## Project layout

```
src/game/       pure rules: grid geometry, session state machine, next-day lock
src/platform/   localStorage settings, IndexedDB photos, soft WebAudio
src/ui/         SVG art, game screen (drag, countdown, bridge, ride), long-press
src/main.ts     screens: setup → intro → game → end / locked
sw/             service worker template (precache list filled in at build)
tests/          vitest unit tests
scripts/        icon generator (renders the PNG icons with Chromium)
```
