# Budujemy Tor

A calm **"program the train"** puzzle for a child of about 8, with one parent beside them.
Each board has a start shed, a depot, some scenery and a strip of empty command slots. The
child first **writes a program** of icon commands (arrows or curves, loops, a subroutine row),
and only then presses the engine button to watch the train run it: every command lays one piece
of track in front of the engine. After a few boards the train rolls into the depot and switches
off. Then: *"Koniec. Teraz: [kąpiel / jedzenie / spacer / książka]"*.

Offline-first PWA · wordless child screens (icons only; the only digits are Repeat counts) ·
Polish parent UI (Portuguese optional) · no backend, no accounts, no analytics, no network calls
· sound off by default · one session per day.

The contract is [`SPEC.md`](SPEC.md) (updated for v4). The level tables are
[`LEVELS_V4.md`](LEVELS_V4.md) (v4, the child flow) and [`LEVELS.md`](LEVELS.md) (v3, parent
preview only); both are generated and checked in CI.

## What changed from v3 (v4: program the train)

A v3 playtest found it still far too easy for an 8-year-old ("for a 4-year-old"), although its
48 levels were measured and banded: laying one route on a small, fully visible board is a maze
the eye solves at once, and free test runs let trial-and-error replace planning. v4 keeps the
boards and changes what the player does: they **write the whole program first**, then watch.
The benchmark is the commercial coding-logic games rated 8+ (sequences, loops, relative turns,
subroutines, debugging).

| v3 | v4 |
|---|---|
| Lay pieces on the board, test-run, adjust. | Write a program of commands in a fixed number of slots; Run is active only when every slot is filled. Each executed move lays **one piece in front of the engine**; bridges and tunnels are automatic (only a straight may cross a river / mountain). |
| 48 levels + 31 siblings, measured by the solver (`planDepth`, `detour`, …). | 40 levels P01–P40 in 8 chapters of 5, measured by an **enumerator of every program** that fits the slots: `candidates` (closed form), `solutions` ≤ 3, `guessRatio` = candidates / solutions ≥ 400, plus `needsLoop`, `nestDepth`, `needsFunction`, `bugs`. |
| Chapters: obstacles → bridges → tunnels → stations → lures → arrows → order → all. | Chapters: absolute arrows → **Repeat** → two loops → ordered stations / one-way track → **relative curves** (seen from the engine) → **a loop in a loop** → **the P row** (a subroutine called twice) → **debugging** a given program + finale. |
| 2 lamps, stuck ladder, ghost path, look phase, warm-up, step-down siblings, quiet skip, mirrored requeue, auto-rotation, hand-held intros. | **One lamp** per level: dots on the stored solution's route (to the halfway cell in chapter 1, the whole route from chapter 2); never commands. None of the other v3 helpers: the program is the challenge. |
| Session: 1 warm-up + 3 new levels (session 1: L01–L04). | Session: **N new puzzles** from the bookmark, no warm-up (N = 2, 3, 4 or 5, a parent setting, default 3). Session 1 starts at P01. |
| Bookmark `budujemy-tor:bookmark` (`levelSet: 3`). | Own bookmark `budujemy-tor:bookmark4` = `{ levelSet: 4, next, solved[], helped[] }`. The v3 bookmark and the lock are left as they are. Service worker cache `budujemy-tor-v4-*`. |

Reused, not rewritten: `grid.ts`; `level.ts` (terrain, stations, `order`, `oneWay`, fixed pieces);
`trace.ts` (the ride and its stop reasons — the program is compiled to v3 pieces and ridden by
`trace()`); `lock.ts` and `src/platform/*`; the art, SVG helpers, route geometry, long-press and
scenes; the start flow with the Potem card, the END screen and the next-day lock with its
parent override; the parent menu and preview; i18n; the band + CI pattern of `bands.ts` +
`curve.test.ts`. All v3 levels and v3 tests stay in the repo and stay green; v3 levels are
playable from the parent preview (**Plansze v3**).

## How a v4 session goes

1. **Parent setup** (words are fine here): the *Potem* card, optional local photo, sound (off by
   default), language (PL / PT), and **puzzles per session** (2 / 3 / 4 / 5, default 3). A
   progress box shows "N / 40" and the levels where the lamp was used. Start by **holding** the
   start button 1.5 s.
2. **Intro picture**: track → Potem card. No words.
3. **N puzzles** from the bookmark (wagons at the top; one uncouples after each puzzle). No warm-up.
4. Each puzzle: the board, the **program strip** (the main row; a second, purple **P row** from
   chapter 7), the **palette** and the **run** button (top right).
   - Tap a palette tile: it fills the selected slot (by default the first empty one), and the
     next empty slot is selected. Empty slots are dashed boxes, so the child can count what is
     left. A tile that cannot go anywhere wobbles softly.
   - Tap a filled slot to select it; a small **take-out** mark on it returns the command to the
     palette. Only the player removes a command; the app never deletes, reorders or edits one.
   - **Repeat** (loop arrow): it opens one slot inside a green bracket. On the selected Repeat,
     **+ / −** marks make its body longer (up to 3 commands) or shorter (when the last slot is
     empty); tapping the **count digit** cycles 2 → 3 → 4 → 5. A Repeat can be taken out once its
     body is empty. From chapter 6 a Repeat may sit inside a Repeat (a blue bracket).
   - **Call** (purple strip) runs the P row.
   - Chapters 1–4 use **arrows** (N E S W: the direction the new piece leads). From chapter 5 the
     commands are **curves as seen from the engine**: straight on, curve left, curve right.
5. **Run** (active only when every slot is filled): the train runs the program, laying one piece
   per move, ~0.6 s per cell; the command that is running glows. Fixed track and stations are
   ridden through without using a command.
6. **Why it stopped** (soft light only, never red, no error sound): the cell glows and the
   responsible command glows. New v4 stops: an arrow straight back (`reverse`), scenery in front
   (`blocked`), the depot reached with commands left (`early`), the program ended before the
   depot (`programEnd`: the empty cell in front glows). v3 stops: the depot door glows (wrong
   side), the station dots pulse (missed / wrong order), the arrow pulses (against one-way track),
   running into the track (`loop`), off the board (`edge`), a curve on a river / mountain. The
   program stays exactly as written; Run rests for 3 s.
7. **The lamp** (one per puzzle): tap to arm, tap again to light it: dots on the stored
   solution's route (to the halfway cell in chapter 1, the whole route from chapter 2). It never
   shows commands. Using it marks the level "lamp" in the parent view only.
8. **Debug levels** (P36–P39) start with a full program that fails; the child finds and fixes the
   1–3 wrong commands.
9. After the last puzzle: a slow depot ride, then "Koniec. Teraz: [card]", then the next-day lock.
10. **Parent pause**: hold the small corner control 1.5 s → continue / end session (pictures
    only). The puzzle in progress is not counted.

## Parent menu and level preview

Hold the **title of the setup screen**, or the **heading of the END / locked screen**, for 3 s.
The parent menu opens (words allowed):

- **Podgląd etapów** — the 40 v4 puzzles by chapter, each with board size, commands (arrows /
  curves), slots (`+P` = P row), `trasa` (pieces the shortest solution lays), `rozw.` (programs
  that work) and `1:N` (the guess ratio), and marks (next / solved / lamp). Tap one to play it in
  a **sandbox** with a parent bar: "PODGLĄD" badge, **Pokaż rozwiązanie** (puts the stored
  solution in the strip), **◀ ▶**, **Wyjdź**. **Ustaw jako następny** (hold 3 s) makes it the
  next new puzzle (only the v4 bookmark's `next` changes). Nothing else is stored.
- **Plansze v3** — the v3 levels and siblings exactly as in v3 (sandbox, measured difficulty, and
  its own "Ustaw jako następny" for the v3 bookmark).
- **Odblokuj dziś** (END / locked only) — the v2 override: unlock, then setup.
- **Wróć** — back to the screen you came from; the lock stays.

## v4 levels: program model, metrics, generator

Levels live in [`src/game/levels4.json`](src/game/levels4.json) as `ProgLevel`
(`src/game/program.ts`): the v3 fields `grid`, `start`, `depot`, `stations`, `fixed` (so the
board, the art and `trace()` work unchanged), plus `commands` (`absolute` | `relative`),
`repeat`, `nesting`, `slots`, `fslots`, `kind` (`practice` | `debug` | `finale`), one stored
`solution` and, on debug levels, the `given` program. Programs are written in a small notation:
moves are letters (`N E S W` / `F L R`), `P` runs the P row, `4[E N]` repeats its body 4 times,
and the P row follows ` ; ` — e.g. `P 3[L F] P ; 2[F R]`.

**Program model** (`src/game/program.ts`, pure). Slot cost: move = 1, Call = 1, Repeat = 1 +
its body (1–3 tokens; a Repeat in a body only when `nesting`, at most 2 deep; P never calls P).
Semantics: the engine starts on the shed heading `start.exit`; each executed move lays one piece
in the cell in front and moves onto it (absolute `d`: enters from the heading, leaves towards `d`,
`reverse` if `d` points back; relative: straight / 90° curve); river / mountain take only a
straight (auto bridge / tunnel), a curve there stops with `needsBridge` / `needsTunnel`; fixed
pieces and stations in front are ridden through without a command, with the v3 checks
(`mismatch`, `wrongWay`, `wrongOrder`); scenery → `blocked`, off the board → `edge`, a cell of the
route → `loop`, the depot while commands remain → `early`. After the last command the depot must
be in front, entered through its door (`depotSide`) with every station passed (`missedStation`),
else `programEnd`. The program is compiled to v3 `Placed[]` (recording the command that laid each
piece) and ridden by v3 `trace()`; only `reverse`, `blocked`, `early` and `programEnd` come from
the compiler. The ride stops at the first failure in route order; every stop names its cell and
its command. The editor model (`src/game/edit.ts`, pure) keeps each row at exactly its slot count
and only ever moves empty slots.

**Metrics** (`src/game/progMetrics.ts`, pure, deterministic):

| Metric | Meaning |
|---|---|
| `candidates` | programs that fit the rows exactly in the level's grammar, in closed form: f(0) = 1, f(s) = Σ_c t(c)·f(s − c), times the P row's count |
| `solutions` / `routes` | programs that succeed (cap 50) / distinct routes among them |
| `routeLen` | pieces laid by the shortest-route solution |
| `guessRatio` | `candidates` / `solutions` |
| `needsLoop` | the level allows Repeat and no solution is loop-free |
| `nestDepth` | the minimum, over solutions, of the deepest Repeat nesting |
| `needsFunction` | every solution runs P at least twice |
| `bugs` | debug levels: fewest single-token substitutions (same tree shape; counts may change) that turn `given` into a solution |
| `detour` | `routeLen` − v3 `naiveLen` on the same grid |
| `stationsMatter` / `arrowsMatter` | removing station order / one-way arrows changes the solution set |

The enumerator is depth-first, left to right; every completed top-level token is executed at once
(a Repeat runs its whole body `count` times) and the branch is pruned at the first stop; with a P
row the P row is enumerated first. The whole v4 metrics suite runs in about 2 s.

**Anchor fixtures** (`tests/progMetrics.test.ts`, exact): P01 (16,384 candidates, 3 solutions,
3 routes, routeLen 7), P06 (2,048 / 2 / 1 / 9, needsLoop) and P21 (873 / 2 / 1 / 9); the closed-form
`candidates` equals a brute-force enumeration for 1–4 slots in every grammar.

**Bands** (`src/game/bands4.ts`, enforced by `tests/curve4.test.ts`):

| Ch | Commands | slots | routeLen | Required |
|---|---|---|---|---|
| 1 | absolute, no Repeat | 7–10 | = slots | `detour` ≥ 2 |
| 2 | absolute + Repeat | 4–6 | 8–12 | `needsLoop` |
| 3 | absolute + Repeat | 5–7 | 10–16 | `needsLoop`; every solution has ≥ 2 Repeats or a 3-token body |
| 4 | absolute + Repeat + ordered stations / one-way track | 5–8 | 10–16 | `needsLoop`; `stationsMatter` or `arrowsMatter` |
| 5 | relative + Repeat | 4–7 | 9–16 | `needsLoop` |
| 6 | relative + nested Repeat | 5–8 | 12–24 | `nestDepth` = 2 |
| 7 | relative + P row (`fslots` 2–4) | 4–6 | 12–24 | `needsFunction` |
| 8 | P36–P39 debug; P40 finale | 4–8 | 12–24 | debug: `bugs` 1–3; finale: relative + nesting / P + ordered stations |

Global: `solutions` ≤ 3, `guessRatio` ≥ 400, board ≤ 6 × 6, ≤ 30 % blocked, terrain in clusters
(lake / river / mountain regions ≥ 2 cells, at most 2 lone blocked cells), the start not always
on the left, levels ordered by (`routeLen`, `slots`) inside a chapter, chapter medians of
`routeLen` never going down, and the stored solution succeeds.

**Generator** (`scripts/gen4.ts`, seeded, program-first, not run in CI):

```bash
npm run gen4 -- 3 1            # chapter 3, seed 1: print the chapter's levels (JSON lines)
npm run gen4 -- 3 1 --write    # … and merge them into src/game/levels4.json (anchors kept)
npm run gen4 -- 7 2 33         # only level 33 with seed 2
npm run gen4 -- 7 1 --reorder  # re-sort a chapter by (routeLen, slots) and renumber it
npm run levels4                # regenerate LEVELS_V4.md and levelStats4.json
```

Per level: draw a target program from the chapter's grammar; expand it to a route on an empty
board from every edge start (chapter 4: stations or one-way pieces dropped in front of the engine;
one-way track beside the route kept as a lure) and put the depot at the route's end; add terrain
on the most-used off-route cell of the competing programs until `solutions` ≤ 3 and every band
rule passes; dress the board with clustered terrain. At most 2,000 candidate programs per level;
the best-looking accepted board wins (clustered terrain, a route that keeps off the edge).
The shipped set: `--write` for chapters 1–8 with seed 1; chapter 7 levels 32–35 and a few chapter
5 / 8 levels (to keep the chapter medians rising) came from seeds 2–4 of single levels, then
`--reorder`. See the PR for the exact notes.

## v3 (kept: parent preview "Plansze v3")

The sections below describe v3, which is no longer the child flow but ships unchanged and
plays from the parent preview.

### What changed from v2

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

### How a v3 session went

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

### v3 level preview

- **Plansze v3** — all 48 levels and their siblings by chapter, each with its board size and
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

### v3 levels: generation and validation

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

**v4: interpretations of the brief**

| Brief item | How it is implemented |
|---|---|
| Order of the checks for one move | Off the board → `edge`; the depot in front → `early`; the start shed or a cell already on the route → `loop`; rock / house / tree / lake → `blocked`; an absolute arrow straight back → `reverse`; a curve on a river / mountain → `needsBridge` / `needsTunnel`. |
| Fixed pieces and stations | Ridden through eagerly (also right after the start shed and after the last command), with v3's order of checks: `mismatch`, `loop`, `wrongWay`, `wrongOrder`. |
| Compile + `trace()` | `trace()` rides the compiled pieces; a v3 failure earlier in route order wins. At the compiler's stop cell the compiler's reason is used: running into a piece the program laid itself is `loop` (v3 trace alone would read `mismatch`), and `trace` success with commands left is `early`. A test runs random programs on every level and checks the step machine, the compiler and `trace()` agree. |
| Nesting | A Repeat inside a body only when `nesting`, at most 2 deep (the strip stays readable at 360 px). |
| `needsFunction` | Runtime count: a Call inside `3[…]` counts 3 times. The generator's targets always have ≥ 2 Call slots. |
| `routeLen` | Pieces the program lays; fixed track and stations on the route are not counted. |
| `bugs` | Searched up to 3 substitutions (a move → another move of the family; a count → another count; Calls stay); "4" means more than 3. |
| Terrain in clusters | Lake / river / mountain regions ≥ 2 cells (v3 rule) and at most 2 blocked cells with no blocked neighbour (8 around). P06 has one lone rock. |
| Start not always on the left | In every chapter at least one start is not "column 0, leaving east". |
| Editor | A Repeat opens one body slot, taken from an empty slot next to it (same row, nearest first); + / − move empty slots in and out of the body. A Repeat can be taken out only once its body is empty (so no command ever disappears with it). A palette tap while a filled slot is selected goes to the first empty slot (never replaces a command). |
| Lamp | Two taps (arm, then light), as v3. Dots on the stored solution's route, fixed cells included; chapter 1 shows the first ⌊n/2⌋ + 1 cells. |
| After a stop | The laid track stays faded on the board until the next edit, and Run rests 3 s (v3's cool-down). |
| Bookmark and lock | v4 reads and writes only `budujemy-tor:bookmark4`. The lock key and format are v3's; a v4 session writes it once, at the end, exactly as v3 did. |
| After P40 | Each slot replays a solved chapter 5–8 puzzle, picked from the date; the bookmark does not move. |
| v3 test change | `tests/safeguards.test.ts` now expects the bumped cache name `budujemy-tor-v4-*` (the brief's bump) and also checks the v4 preview writes only through its "Ustaw jako następny". No other v3 test changed. |

## Project layout

```
src/game/       pure rules. v4: program (model, step machine, compiler over v3 trace), edit
                (editor model), progMetrics (closed form + enumerator), bands4, session4, levels4.
                v3 (reused): level model, trace, grid, lock; and v3's solver, hints, placement,
                progress, metrics and bands
src/game/levels4.json      P01–P40 (validated at load and in tests); levelStats4.json (generated)
src/game/levels.json       v3: 48 levels + 31 siblings; levelStats.json (generated)
src/platform/   localStorage settings (+ puzzles per session) + v3 / v4 bookmarks, IndexedDB photos, soft WebAudio
src/ui/         v4: editor (puzzle screen), art4 (command icons), layout4 (360 × 640 sizing);
                shared: SVG art, parent menu + preview, scenes, route geometry, long-press; v3: game, layout
src/main.ts     screens: setup → intro → N puzzles → depot ride → end / locked (+ parent menu)
sw/             service worker template (precache list filled in at build; cache budujemy-tor-v4-*)
tests/          vitest unit + happy-dom UI tests. v4: program, progMetrics, curve4, levels4, editor,
                session4 (drives src/main.ts end to end). v3: everything else, unchanged
scripts/        gen4.ts (v4 generator), v3 generator (gen/, gen-levels.ts, build-set.ts), run-ts.mjs, icons
```
