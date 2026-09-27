# SPEC — Budujemy Tor (v4)

> Source of truth for this project. v1 was a turn-taking co-play toy, v2 turned it into a
> track-building puzzle, v3 gave the puzzle a measured difficulty curve, v4 turns it into
> "program the train" for a child of about 8. This file describes the game as it is now; the PR
> descriptions hold the done / not-done lists per version.

A small offline-first PWA, "Budujemy Tor": a calm coding-logic puzzle for one child of about 8
(who may not read yet), with one parent beside them, on ONE phone. The player writes a program of
icon commands first and only then watches the train run it. The challenge comes from planning,
never from pressure.

## WORKING CONTRACT
- PWA for Chrome on Android (Google Pixel), installable, fully offline after first load.
  Static files only: no backend, no accounts, no analytics.
- Work on a feature branch and open a Pull Request. Do NOT merge it (merging deploys; the
  owner merges after a real-device playtest).
- Stop condition: the PR is open with CI green and a done / not-done list against the brief.

## CORE LOOP (v4)
- A board (max 6 × 6, portrait) with a start shed, a depot (door on one side), scenery (rock,
  house, tree, lake), rivers and mountains (only a straight crosses them: bridge / tunnel are
  automatic), stations (ordered), and fixed one-way track.
- The program strip: a main row of `slots` empty boxes (and a P row of `fslots` from chapter 7),
  a palette (absolute arrows N E S W in chapters 1–4, relative curves straight / left / right as
  seen from the engine from chapter 5; Repeat; Call) and a Run button.
- Run is active only when every slot is filled. Each executed move lays one piece in front of
  the engine and moves onto it; Repeat runs its body 2–5 times; Call runs the P row. The running
  command glows. Every stop is gentle: the cell and the responsible command glow softly (never
  red, no error sound) and the program stays exactly as written. The app never deletes, reorders
  or edits a command; only the player takes one out.
- One lamp per level: dots on the stored solution's route (halfway in chapter 1, all of it
  later); never commands; marks the level helped (parent view only).
- Debug levels start with a full program that fails; the player fixes it.
- A session is N new puzzles from the bookmark (N = 2–5, parent setting, default 3; no warm-up;
  session 1 starts at P01), then a slow depot ride and the END screen "Koniec. Teraz: [card]",
  then the next-day lock.

## LEVELS AND DIFFICULTY (v4)
- 40 levels P01–P40 in 8 chapters of 5 (`src/game/levels4.json`): absolute arrows → Repeat →
  two loops → ordered stations / one-way track → relative curves → a loop in a loop → the P row →
  debugging + finale.
- Difficulty is measured by enumerating every program that fits the slots
  (`src/game/progMetrics.ts`: candidates in closed form, solutions, routes, routeLen, guessRatio,
  needsLoop, nestDepth, needsFunction, bugs, detour, stationsMatter, arrowsMatter). Every band in
  `src/game/bands4.ts` is enforced in CI: solutions ≤ 3 and guessRatio ≥ 400 on every level.
  P01, P06 and P21 are fixed anchors whose metrics are asserted exactly.
- Levels come from a seeded, program-first generator (`npm run gen4`). `LEVELS_V4.md` is
  generated (`npm run levels4`) and CI fails if it is stale.

## HARD SAFEGUARDS (acceptance-critical)
1. Before starting, the parent picks a "Potem" (next activity) card: bath, meal, walk, book,
   optionally with a photo stored ONLY locally (IndexedDB), shown at start and on the END screen.
2. NO "play again". After a session ends, a new one is locked until the next calendar day. The
   parent menu (hidden 3 s hold on the END / LOCKED heading) can unlock ("Odblokuj dziś").
3. Sound OFF by default; if enabled, only soft sounds.
4. NO points, stars, streaks, collectibles, badges, timers, ads, notifications, analytics or
   network calls. No score and no "par" display.
5. One language per session (PL default; PT toggle in the parent settings).
6. Offline after first load (service worker + manifest); photos never leave the device.
7. No words on child-facing screens: icons and art only; the only digits are Repeat counts.
   Parent screens (setup, parent menu, level preview and its bar) may use words.
8. The train never crashes or derails: every failure is a gentle stop with the cause glowing
   softly.

## PARENT PREVIEW
- A 3 s hold on the setup title, or on the END / LOCKED heading, opens the parent menu:
  [Podgląd etapów] (v4), [Plansze v3], [Odblokuj dziś] (END / LOCKED only), [Wróć].
- The v4 preview lists P01–P40 by chapter with their measured difficulty and next / solved /
  lamp marks; any level plays in a sandbox with a parent bar (show solution, previous / next,
  exit). Preview never counts as a session, never unlocks and never writes to storage, except
  "Ustaw jako następny" (3 s hold), which sets only the v4 bookmark's next level.
- The v3 section plays the v3 levels and siblings exactly as in v3.

## v3 (kept, not the child flow)
- 48 track-laying levels + 31 siblings (`src/game/levels.json`, `LEVELS.md`), measured by the v3
  solver and banded in `src/game/bands.ts`; all v3 tests still run in CI. The v3 bookmark
  (`budujemy-tor:bookmark`) is left as it is.

## TECH
- Vanilla TypeScript + Vite (build only), no runtime dependencies. Pure game rules in
  `src/game/`, drawing and input in `src/ui/`.
- Vitest unit, property and happy-dom UI tests (including the app shell end to end), run in CI
  together with the typecheck and the build.
- The README covers running locally, the program model, metrics, bands and generator, the parent
  preview, deploying to GitHub Pages and installing on Android Chrome.
