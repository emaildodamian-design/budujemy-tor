# Budujemy Tor

A calm **track-building puzzle** for a young child, with one parent beside them as a helper.
Each board has a start shed, a depot, some scenery and a small tray of track pieces. The child
lays the pieces to join the start to the depot (bridges over rivers, tunnels through mountains,
past every station), then presses the big engine button to watch the train test the track.
After four boards the train rolls into the depot and switches off. Then:
*"Koniec. Teraz: [kąpiel / jedzenie / spacer / książka]"*.

Offline-first PWA · pre-reader friendly (no words on any child-facing screen) · Polish parent UI
(Portuguese optional) · no backend, no accounts, no analytics, no network calls · sound off by
default · one session per day.

The v1 contract is [`SPEC.md`](SPEC.md); the v2 puzzle brief is tracked in the PR description
(done / not done). The level table is [`LEVELS.md`](LEVELS.md) (generated).

## What changed from v1

| v1 (turn-taking toy) | v2 (puzzle) |
|---|---|
| Parent and child alternate 12 turns, the track grows from its open end. | One child builds, the parent helps with a limited hint lamp. 40 fixed boards in 8 chapters. |
| Tiles are relative to the train's heading (left / straight / right). | Pieces have absolute orientations (`NS`, `EW`, `NE`, `ES`, `SW`, `NW`); straight, curve, bridge, tunnel. |
| Any track is accepted. | The **test run** (`trace`) shows where the track breaks: the train slows, stops with a puff, the break cell glows soft warm white. |
| Broken-bridge "fix it together" event. | Repair boards: pre-laid track with 1–2 wrong pieces to swap or turn. |
| `src/game/session.ts` turn state machine. | Removed. Replaced by `level.ts`, `trace.ts`, `solver.ts`, `hints.ts`, `placement.ts`, `progress.ts` (all pure). |

Kept from v1: grid geometry, the next-day lock and the **hidden** 3 s parent override (hold the
heading of the END / locked screen; there is no visible override button), audio / photos /
settings, the Potem card flow, the END screen, the service worker (cache renamed
`budujemy-tor-v2-*` so installed copies update) and the Pages workflow.

## How a session goes

1. **Parent setup** (words are fine here): pick the *Potem* card, optional local photo, sound
   (off by default), language (PL / PT). A progress box shows "N / 40" and, for the last 5
   sessions, boards solved without / with help. Start by **holding** the start button 1.5 s.
2. **Intro picture**: track → Potem card. No words.
3. **4 boards** (wagons at the top; one uncouples after each board). Session 1 plays L01–L04.
   Later sessions: one warm-up (a mirrored copy of a board solved without help, picked from the
   date), then 3 more boards.
4. Each board: a **5 s look phase** (tray resting, a soft ring fills round the go button), then
   build. Tap a tray piece to lift it and tap a cell, or drag it. Dropping on a movable piece swaps
   (the old one floats back). Tap a placed piece to turn it; hold it 0.5 s, or drag it to the tray,
   to take it back. Press go: the train rides at ~0.6 s per cell.
5. **Helper lamp** (2 per board, beside the parent avatar): first tap moves the lamp onto the
   avatar, second tap shows the hint (lamp 1: glow the cell; lamp 2: also pulse the tray piece).
6. After the 4th board: a slow depot ride (engine off, lights dim), then "Koniec. Teraz: [card]",
   then the next-day lock.
7. **Parent pause**: hold the small corner control 1.5 s → continue / end session (pictures only).
   Ending goes to the depot ride and END card; the board in progress is not counted.

## Levels: how they are authored and validated

Levels live in [`src/game/levels.json`](src/game/levels.json), one per line, in the format of
`Level` in `src/game/level.ts`: grid rows (`.` grass, `R` rock, `H` house, `T` tree, `~` river,
`^` mountain, `A` start, `B` depot, `S` station), start exit, depot entry, stations, pre-laid
pieces, tray, `rotate`, `placement`, `goalStrip` and one declared `solution`.

To add or change a level:

1. Edit `levels.json` (coordinates are `[x, y]`, rows top to bottom; boards ≤ 5 × 6).
2. `npm run levels` regenerates [`LEVELS.md`](LEVELS.md) with the solver's solution count.
3. `npm test` checks, for every level: schema, the declared solution passes `trace` with owned
   pieces on legal terrain, the **solver** solves it independently, intro boards have ≤ 2
   solutions, chapters 1–5 use every tray piece, repair boards fail their first run and are
   fixable by swaps, mirrored copies stay solvable, hints finish it from empty and from 200 random
   partial boards, and tiles stay ≥ 64 px at 360 × 640. `levels.json` is also validated at load.

L01–L12 ship exactly as specified. L13–L40 were authored to the chapter plan and checked with the
solver (see LEVELS.md for board, pieces, distractors and solution counts).

## Run locally

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit + UI tests (vitest)
npm run levels     # regenerate LEVELS.md after editing levels.json
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

**Tech: vanilla TypeScript + Vite (build only), no runtime framework.** A handful of screens and
one SVG board; vanilla TS keeps the bundle ~20 KB gzipped, gives direct control over pointer
events and animation, and has zero runtime dependencies to audit for tracking or network calls.

**All rules are pure functions** in `src/game/`. Time, the date and randomness are passed in, so
trace, solver, hints, placement and the session rules are unit-tested without a browser. The UI
in `src/ui/` only draws and forwards input; happy-dom tests drive it (no words on child screens,
tap / drag / swap / turn / hold, stuck ladder, pause).

**Interpretations of the brief**

| Brief item | How it is implemented |
|---|---|
| `trace` order | As specified: mismatch is checked before loop, so running back into laid track reads as `mismatch`; `loop` is running back into the start shed. A bridge/tunnel on grass (free placement) stops the train with `needsTrack`. |
| Hint step 3 "walk back" | Removal order is: the piece that stopped the train (if it is off the route), then the route's movable pieces from the end. The hint names the earliest removed piece and the piece that should go there. |
| Hints pick | The fewest-pieces completion (branch and bound), so from an empty board a hint sequence never exceeds the solution length. |
| Auto orientation | Connect to neighbouring open ends; prefer two connections; never point a loose end into scenery or off the board; ties by side order. A tap cycles the (≤ 2) connecting orientations. |
| Free rotation | Tray pieces arrive as straight `EW` / curve `ES`; a tap turns 90° clockwise. |
| Stuck ladder | +1 when a run gets no further than the best so far, or after 90 s with no input; reset when a run gets further. 2 → lamp pulses once; 3 → hint cell; 4 → ghost path (all but the final piece), level marked helped. |
| Quiet skip | Counts new boards only (not warm-ups/replays); after a skip the count restarts, so at most every other board is skipped. Never skips intro or repair boards. |
| Requeue | A board solved with help returns mirrored 2 sessions later; at most 2 requeues per session so there is always a new board while any remain. |
| After L40 | Each slot draws a mirrored solved board from L20–L40, picked from the date and slot. |
| Station intro (L19) | 4 × 3 like the given obstacle intro (L05), per the chapter table. |
| Goal strip | `full`: one icon per bridge / tunnel in the declared solution plus stations; `stations-only`: stations. The depot icon lights on arrival. |
| Parent override | Unchanged from main: hidden 3 s hold on the END / locked heading. The start and pause holds (1.5 s) reuse the same `attachHold` with a shorter time. |
| No network | No `fetch`/XHR/beacons in app code (tested), CSP `connect-src 'none'`, same-origin service worker. |

## Project layout

```
src/game/       pure rules: level model, trace, solver, hints, placement, progress, lock, grid
src/game/levels.json   the 40 levels (validated at load and in tests)
src/platform/   localStorage settings + bookmark, IndexedDB photos, soft WebAudio
src/ui/         SVG art, level screen, scenes, layout, route geometry, long-press
src/main.ts     screens: setup → intro → 4 boards → depot ride → end / locked
sw/             service worker template (precache list filled in at build)
tests/          vitest unit + happy-dom UI tests; levelsReport.ts builds LEVELS.md
scripts/        icon generator (renders the PNG icons with Chromium)
```
