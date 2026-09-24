# SPEC — Budujemy Tor

> Source of truth for this project. Later sessions: read this first, then the
> PR checklist ("done / not done vs SPEC") to see what remains.

Build a small offline-first PWA called "Budujemy Tor" (Polish UI; optional Portuguese language toggle): a turn-based CO-PLAY game for one parent and one young child on ONE phone. They take turns laying track tiles for a toy train, then watch the train ride the track they built together.

## WORKING CONTRACT
- Target: PWA running in Chrome on Android (Google Pixel), installable via "Add to Home screen", fully offline after first load. Static files only: no backend, no accounts, no analytics.
- First, commit this spec as SPEC.md so later sessions can continue from it.
- Work on a feature branch and open a Pull Request. Do NOT merge it.
- Stop condition: the PR is open with tests green, plus a "done / not done vs SPEC" checklist in the PR description. If you cannot finish in this session, stop and write clearly what remains.

## CORE LOOP
- Grid board with large tiles and big touch targets (min 64 px). Players alternate turns: CHILD, then PARENT. Show a clear turn indicator (two different colour avatars, no names).
- On their turn a player drags one track tile (straight / curve) from a small tray onto an adjacent free cell. An invalid drop snaps back gently, with no error sound and no red flash.
- 1-2 times per session the PARENT's tile is a "broken bridge". The next CHILD turn is "fix it together": both tap the bridge to repair it.
- A session is FIXED at 6 turns per player. Remaining turns are shown as wagons that disappear one by one.
- After the last turn the train rides the built track slowly once, enters a DEPOT, and the engine switches off. Then show an END screen: "Koniec. Teraz: [card]".

## HARD SAFEGUARDS (acceptance-critical)
1. Before starting, the parent picks a "Potem" (next activity) card from simple built-in icons (bath, meal, walk, book). The parent can optionally add a photo, which is stored ONLY locally (IndexedDB) and never uploaded. The card is shown at start and on the END screen.
2. NO "play again" button. After a session ends, a new session is locked until the next calendar day. A parent-only override needs a 3-second long-press.
3. Sound OFF by default. If sound is enabled, use only soft sounds, never sudden or loud effects.
4. NO points, stars, streaks, unlockables, speed-pressure timers, ads, notifications, or network calls.
5. Input is accepted only after a gentle ~5 s delay at each turn start, with a visible soft countdown, so nobody is rushed.
6. One language per session (PL default; PT toggle in the parent settings).
7. Everything works offline after first load (service worker + manifest). No tracking.

## TECH
- Vanilla TypeScript or a lightweight framework (your choice; justify it in the README), static build, no backend.
- Unit tests for the turn logic, the session cap, the next-day lock and the bridge event.
- The README covers: running locally, deploying to GitHub Pages, and installing on Android Chrome.

## DELIVERABLE
A PR with the code, tests, README and the done / not-done checklist against SPEC.md.
