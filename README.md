# Budujemy Tor

A calm **track-building puzzle** for a young child, with one parent beside them as a helper.
Each board has a start shed, a depot, some scenery and a small tray of track pieces. The child
lays the pieces to join the start to the depot (bridges over rivers, tunnels through mountains,
through every station, in the right order, with the arrows), then presses the big engine button
to watch the train test the track. After four boards the train rolls into the depot and
switches off. Then: *"Koniec. Teraz: [kąpiel / jedzenie / spacer / książka]"*.

Offline-first PWA · pre-reader friendly (no words on any child-facing screen) · Polish parent UI
(Portuguese optional) · no backend, no accounts, no analytics, no network calls · sound off by
default · one session per day.

The contract is [`SPEC.md`](SPEC.md) (updated for v3). The level table is
[`LEVELS.md`](LEVELS.md) (generated, checked in CI).

## What changed from v2

A v2 playtest found the game far too easy, and the solver agreed: in 33 of 40 levels a player
won by always laying the piece that points closest to the goal, 33 levels had no detour, piece
counts never constrained the route, and five levels needed a single piece. Difficulty grew by
board size, not by decisions. v3 measures difficulty and enforces it:

| v2 | v3 |
|---|---|
| 40 hand-authored levels, ≤ 5 × 6. | 48 generated levels in 8 chapters (6 × 7 max, 56 px min tiles) + 31 easier **siblings**. Every level's difficulty is measured by the solver and must sit in its chapter band (CI). |
| Difficulty = board size. | Difficulty = decisions: detours (`detour`), look-ahead (`planDepth`), spare pieces (`distractors`, `lures`), near-unique answers (`solutions` ≤ 2). |
| Terrain: rock, house, tree, river, mountain. | + **lake** (round pond, takes nothing, not even a bridge). |
| Stations in any order. | + **one-way track** (arrow; `wrongWay` stop) and **ordered stations** (1–3 dots on the roof; `wrongOrder` stop). |
| Lamp: glow the next cell. | Lamp 1: a **flag on the halfway cell** of the remaining route. Lamp 2: next cell + tray piece + **outline of the piece**. Every stop shows its cause. |
| Warm-up: any self-solved level. | Warm-up from ≥ 2 chapters back; after a helped level the next one's **sibling** is played first (quiet step-down). |
| Parent: hidden 3 s unlock. | Parent **menu** (hidden 3 s hold): level **preview** sandbox, unlock, back. |
| Bookmark v2. | Bookmark `levelSet: 3` (a v2 bookmark resets; the next-day lock is untouched). Service worker cache `budujemy-tor-v3-*`. |

Kept from v2 (reused, not rewritten): grid, trace, solver, hints, placement, progress and lock
modules; tap-and-drag input; the test run with its gentle stop and break marks; 2 lamps per
level and the stuck ladder; repair levels, mirroring, the mirrored requeue and the quiet skip;
the parent pause; the start flow with the Potem card; the END screen and the next-day lock.

## How a session goes

1. **Parent setup** (words are fine here): pick the *Potem* card, optional local photo, sound
   (off by default), language (PL / PT). A progress box shows "N / 48" and, for the last 5
   sessions, boards solved without / with help. Start by **holding** the start button 1.5 s.
2. **Intro picture**: track → Potem card. No words.
3. **4 boards** (wagons at the top; one uncouples after each board). Session 1 plays L01–L04.
   Later sessions: one warm-up, then 3 more boards.
4. Each board: a **5 s look phase** (tray resting, a soft ring fills round the go button), then
   build. Tap a tray piece to lift it and tap a cell, or drag it. Dropping on a movable piece swaps
   (the old one floats back). Tap a placed piece to turn it (L01–L03 turn it for you; from L04 a
   tap turns it 90°); hold it 0.5 s, or drag it to the tray, to take it back. Press go: the train
   rides at ~0.6 s per cell and stops gently where the track breaks.
5. **Why it stopped** (soft light only): the break cell glows; the depot door glows (wrong side);
   the arrow pulses (against a one-way piece); the station dots pulse (wrong order / missed
   station); the empty bridge / tunnel slot pulses (a gap before a river / mountain with none left).
6. **Helper lamps** (2 per board, beside the parent avatar): first tap moves the lamp onto the
   avatar, second tap shows the hint (lamp 1: a flag on the halfway cell of the remaining route,
   or the next cell on a short route; lamp 2: next cell, tray piece, piece outline).
   **Stuck ladder** (a run that gets no further, or 90 s idle, counts once): 2 → the lamp pulses;
   3 → the flag (or the lamp-2 hint if the flag was shown); 4 → ghost path of every piece but the
   last, level marked helped. The child always lays the last piece. **Intro boards**: after 10 s
   with no correct piece, the new element glows (river, mountain, arrow, first station). No piece hint.
7. After the 4th board: a slow depot ride, then "Koniec. Teraz: [card]", then the next-day lock.
8. **Parent pause**: hold the small corner control 1.5 s → continue / end session (pictures only).

## Parent menu and level preview

Hold the **title of the setup screen**, or the **heading of the END / locked screen**, for 3 s.
The parent menu opens (words allowed):

- **Podgląd etapów** — all 48 levels and their siblings by chapter, each with its board size and
  measured difficulty (`min` = shortest route, `+N` = spare pieces, `plan` = look-ahead needed,
  `objazd` = detour, `rozw.` = number of solutions) and marks (next / solved / with help). Tap a
  level to play it in a **sandbox**: the normal game screen with a parent bar — "PODGLĄD" badge,
  **Pokaż rozwiązanie** (ghost of the stored solution), **◀ ▶** (previous / next level),
  **Wyjdź**. Lamps, test runs and the stuck ladder work as in play.
  **Ustaw jako następny** (hold 3 s) makes that level the next new one (and clears the
  recent-solves memory used by the quiet skip). Nothing else in preview is stored: it never
  counts as a session and never unlocks.
- **Odblokuj dziś** (END / locked only) — the v2 override: unlock, then setup.
- **Wróć** — back to the screen you came from; the lock stays.

## Levels: generation and validation

Levels live in [`src/game/levels.json`](src/game/levels.json) (the 48 main levels in order, then
the siblings), in the format of `Level` in `src/game/level.ts`: grid rows (`.` grass, `R` rock,
`H` house, `T` tree, `L` lake, `~` river, `^` mountain, `A` start, `B` depot, `S` station), start
exit, depot entry, `stations` (with `order` on ordered levels), `fixed` pieces (with `oneWay`),
`preplaced` (repair), `tray`, `kind` (`practice` / `intro` / `repair` / `finale` / `sibling`),
`siblingOf`, `intro`, `rotate`, `placement` and one shortest `solution`.

**Metrics** (`src/game/metrics.ts`, pure; computed from the initial state; repair levels on the
empty board with the pre-laid pieces in hand; inventory = tray + pre-laid):

| Metric | Meaning |
|---|---|
| `minLen` | pieces in the shortest solution |
| `solutions` | distinct solutions (cap 50) |
| `distractors` | inventory − `minLen` |
| `naiveLen` | fewest pieces from the cell in front of the start to any cell next to the depot (0-1 BFS; ignores counts, turns, the door side, arrows and stations) |
| `detour` | `minLen` − `naiveLen` |
| `freeLen` / `countSlack` | `minLen` with unlimited straights and curves / `minLen` − `freeLen` |
| `planDepth` | smallest look-ahead `k` (1–8; 9 = none) with which a greedy player who never takes a piece back reaches the depot |
| `lures` | bridges / tunnels in the inventory the shortest solution leaves unused (only where a river / mountain exists) |
| `faults` | repair: fewest wrong pre-laid pieces against any solution |
| `arrowMatters` / `orderMatters` | removing the arrows / the order adds solutions or changes `minLen` |

The fixtures from the brief (L01–L04 and v2 L01 / L20 / L35 / L40, plus v2's planDepth
distribution) are asserted in `tests/metrics.test.ts`; v2's levels are kept in
`tests/fixtures/v2_levels.json` for that.

**Bands** (`src/game/bands.ts`): the chapter plan, the practice band per chapter (board size,
`minLen`, `distractors`, `solutions` ≤ 2, `detour`, `planDepth`, required mechanics), and the
global, intro, repair, finale, ordering and sibling rules. `tests/curve.test.ts` checks every
level and sibling against them.

**Generator** (`scripts/gen/generate.ts`, seeded and reproducible, not run in CI):

```bash
npm run gen -- --chapter 6 --count 4 --seed 1          # candidates + metrics → scripts/out/, ASCII preview
npm run gen -- --chapter 3 --kind repair --n 18 --why  # --why: rejection statistics
npm run gen:set -- --chapter 5                         # a whole chapter (main + siblings) → scripts/out/set-ch5.json
npm run gen:set -- --merge                             # merge the chapters into src/game/levels.json
npm run levels                                         # regenerate LEVELS.md and levelStats.json
```

The shipped set was built with `npm run gen:set -- --chapter N` for chapters 1–5, 7 and 8, and
`npm run gen:set -- --chapter 6 --min-plan 5 --min-len 11` for chapter 6 (floors that keep its
medians at or above chapter 5's), then `--merge` and `npm run levels`.

Method: place the start and the depot (random door side); add terrain as clustered blobs
(rivers as full lines), obstacles, stations; hand = unlimited straights and curves + the
chapter's bridges / tunnels; find the shortest legal route, pick a random route of length
shortest + 0..2; tray = exactly that route's pieces, distractors added last (bridges / tunnels
weighted where their terrain exists); arrows are **blockers** (a fixed one-way straight on a
competing solution's cell, pointing against its travel, up to 2, until `solutions` ≤ 2; the
arrow intro puts its arrow on the route); station order is **counter-intuitive** (the order whose
shortest route is longer); repair levels pre-lay part of the route with 2–3 faults of ≥ 2 types.
A candidate is kept only if every band rule passes. `gen:set` builds a pool per slot and picks,
per chapter, a sequence that is non-decreasing by (planDepth, minLen), spread across the band,
preferring boards with mixed terrain and routes that use the board. The run is reproducible: the
seed of each slot is derived from its level number.

`npm test` then checks every level and sibling: schema, the stored solution is a shortest one
and passes `trace`, the solver solves it independently, mirrored copies keep their solution
count, repair boards fail their first run and are fixable, hints finish it from empty and from
random partial boards, bands, and tiles ≥ 56 px at 360 × 640.

## Run locally

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (no service worker in dev)
npm test           # unit + UI tests (vitest)
npm run levels     # regenerate LEVELS.md + levelStats.json after editing levels.json
npm run gen -- --chapter 2 --count 4 --seed 1   # level generator (see above)
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
4. The URL appears in the workflow summary, e.g. `https://<user>.github.io/budujemy-tor/`.

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
| Stuck ladder | +1 when a run gets no further than the best so far, or after 90 s with no input; reset when a run gets further. 2 → lamp pulses once; 3 → halfway flag (lamp-2 hint if the flag was already shown); 4 → ghost path (all but the final piece), level marked helped. |
| `wrongWay` / `wrongOrder` order | Checked after `loop`: running back into laid track is still `mismatch`/`loop`; then a one-way piece entered against its arrow stops the train before that cell; then a station reached before a lower-numbered one stops the train before the station (`missingStations` = the lower-numbered ones not passed). |
| Mechanics "on the shortest solution" | Bridge / tunnel: laid by the solver's shortest solution. Station / arrow / order: the shortest solution rides through a station / a one-way cell (stations are always on the route). Chapter 6 blocker arrows are off the route by design; the arrow intro (L31) puts its arrow on the route. |
| Ordering exemption | L01–L03 ship as given and read (planDepth, minLen) = (2, 5), (3, 7), (2, 6); L03 is exempt from the within-chapter ordering rule (L05 and L06 continue from L02). |
| Intro prompt for rotation (L04) | There is no "rotation cell": after 10 s the placed pieces (if any) glow, inviting a tap. |
| Goal strip | Chapters 1–4: one icon per bridge / tunnel in the stored solution plus stations; from chapter 5 only stations (so the strip does not give away the lures). The depot icon lights on arrival. |
| Sibling rules | A sibling meets the global rules, its chapter's board size, required mechanic and `solutions` ≤ 2, and the sibling limits (planDepth, distractors, minLen relative to the main level; detour ≥ 2) instead of the practice band's planDepth / minLen / distractors / detour. |
| Siblings in progress | A sibling slot does not move the bookmark and is not recorded as solved or helped (so it is never requeued and never a warm-up). |
| Quiet skip | Counts new boards only (not warm-ups/replays/siblings); after a skip the count restarts, so at most every other board is skipped. Never skips intro or repair boards. |
| Requeue | A board solved with help returns mirrored 2 sessions later; at most 2 requeues per session so there is always a new board while any remain. |
| After L48 | Each slot draws a mirrored solved board from L25–L48, picked from the date and slot. |
| Parent menu | Hidden 3 s hold on the END / locked heading and on the setup title (same `attachHold` as v2's override). The start and pause holds (1.5 s) reuse it with a shorter time. |
| No network | No `fetch`/XHR/beacons in app code (tested), CSP `connect-src 'none'`, same-origin service worker. |

## Project layout

```
src/game/       pure rules: level model, trace, solver, hints, placement, progress, lock, grid,
                metrics (difficulty) and bands (chapter plan + rules)
src/game/levels.json      48 levels + 31 siblings (validated at load and in tests)
src/game/levelStats.json  measured difficulty per level for the preview (generated)
src/platform/   localStorage settings + bookmark, IndexedDB photos, soft WebAudio
src/ui/         SVG art, level screen, parent menu + preview, scenes, layout, route geometry, long-press
src/main.ts     screens: setup → intro → 4 boards → depot ride → end / locked (+ parent menu)
sw/             service worker template (precache list filled in at build)
tests/          vitest unit + happy-dom UI tests; levelsReport.ts builds LEVELS.md; fixtures/ (v2 levels, L01–L04)
scripts/        level generator (gen/, gen-levels.ts, build-set.ts, run-ts.mjs), icon generator
```
