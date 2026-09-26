# Levels

Generated from `src/game/levels.json` by `npm run levels` (checked in CI: the test fails if this file is stale).
The 48 main levels come first, then the step-down siblings. Definitions: `src/game/metrics.ts` and the README.

- **inventory**: tray + pre-laid pieces (s = straight, c = curve, b = bridge, t = tunnel).
- **minLen**: pieces in the shortest solution. **distractors**: inventory − minLen. **solutions**: distinct solutions (cap 50).
- **naiveLen**: fewest pieces from the cell in front of the start to any cell next to the depot, ignoring counts, turns, the depot side, arrows and stations. **detour** = minLen − naiveLen.
- **countSlack** = minLen − freeLen (freeLen: minLen with unlimited straights and curves).
- **planDepth**: the smallest look-ahead (1–8, 9 = none) with which a greedy player who never takes a piece back reaches the depot.
- **lures**: bridges / tunnels in the inventory the shortest solution does not use (only where a river / mountain exists). **faults**: repair levels, wrong pre-laid pieces.
- **mechanics**: bridge, tunnel, station, arrow, order on the shortest solution.

| id | kind | ch | board | inventory | minLen | distractors | solutions | naiveLen | detour | countSlack | planDepth | lures | faults | mechanics |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L01 | practice | 1 | 5×4 | 2s 3c | 5 | 0 | 1 | 3 | 2 | 0 | 2 | 0 | 0 | – |
| L02 | practice | 1 | 5×4 | 4s 3c | 7 | 0 | 1 | 5 | 2 | 0 | 3 | 0 | 0 | – |
| L03 | practice | 1 | 5×5 | 6c | 6 | 0 | 1 | 2 | 4 | 2 | 2 | 0 | 0 | – |
| L04 | intro: rotation | 1 | 5×4 | 2s 3c | 5 | 0 | 1 | 3 | 2 | 0 | 2 | 0 | 0 | – |
| L05 | practice | 1 | 5×5 | 3s 4c | 7 | 0 | 2 | 5 | 2 | 0 | 3 | 0 | 0 | – |
| L06 | practice | 1 | 5×5 | 4s 5c | 8 | 1 | 1 | 6 | 2 | 0 | 3 | 0 | 0 | – |
| L07 | intro: bridge | 2 | 5×5 | 3s 3c 1b | 7 | 0 | 1 | 7 | 0 | 0 | 2 | 0 | 0 | bridge |
| L08 | practice | 2 | 5×6 | 4s 3c 3b | 8 | 2 | 1 | 4 | 4 | 0 | 2 | 2 | 0 | bridge |
| L09 | practice | 2 | 5×5 | 2s 7c 1b | 8 | 2 | 1 | 6 | 2 | 0 | 3 | 0 | 0 | bridge |
| L10 | practice | 2 | 5×6 | 4s 5c 1b | 9 | 1 | 1 | 3 | 6 | 0 | 3 | 0 | 0 | bridge |
| L11 | practice | 2 | 5×6 | 2s 6c 2b | 8 | 2 | 1 | 6 | 2 | 0 | 4 | 1 | 0 | bridge |
| L12 | repair | 2 | 5×5 | 3s 4c 2b (4 pre-laid) | 7 | 2 | 1 | 3 | 4 | 0 | 3 | 1 | 1 | bridge |
| L13 | intro: tunnel | 3 | 5×5 | 3s 5c 2t | 10 | 0 | 1 | 2 | 8 | 0 | 3 | 0 | 0 | tunnel |
| L14 | practice | 3 | 5×5 | 3s 5c 3t | 9 | 2 | 1 | 3 | 6 | 0 | 3 | 1 | 0 | tunnel |
| L15 | practice | 3 | 5×5 | 2s 6c 4t | 9 | 3 | 1 | 5 | 4 | 0 | 3 | 2 | 0 | tunnel |
| L16 | practice | 3 | 5×5 | 5s 4c 2t | 10 | 1 | 1 | 6 | 4 | 0 | 3 | 0 | 0 | tunnel |
| L17 | practice | 3 | 5×5 | 3s 7c 3t | 11 | 2 | 1 | 1 | 10 | 0 | 4 | 1 | 0 | tunnel |
| L18 | repair | 3 | 5×6 | 4s 8c 2t (11 pre-laid) | 12 | 2 | 1 | 6 | 6 | 2 | 4 | 0 | 3 | tunnel |
| L19 | intro: station | 4 | 5×6 | 4s 5c | 9 | 0 | 1 | 3 | 6 | 0 | 3 | 0 | 0 | station |
| L20 | practice | 4 | 6×6 | 4s 6c 1b | 9 | 2 | 2 | 4 | 5 | 0 | 3 | 1 | 0 | station |
| L21 | practice | 4 | 6×6 | 4s 6c 2b 1t | 10 | 3 | 2 | 6 | 4 | 0 | 3 | 1 | 0 | bridge, tunnel, station |
| L22 | practice | 4 | 6×6 | 6s 6c 2t | 12 | 2 | 1 | 5 | 7 | 0 | 4 | 2 | 0 | station |
| L23 | practice | 4 | 5×6 | 7s 8c | 12 | 3 | 1 | 5 | 7 | 0 | 5 | 0 | 0 | station |
| L24 | repair | 4 | 5×6 | 8s 6c (10 pre-laid) | 11 | 3 | 2 | 2 | 9 | 0 | 4 | 0 | 3 | station |
| L25 | practice | 5 | 6×6 | 6s 6c 1b 1t | 11 | 3 | 1 | 1 | 10 | 0 | 4 | 2 | 0 | – |
| L26 | practice | 5 | 6×6 | 4s 8c 1b 1t | 11 | 3 | 1 | 7 | 4 | 0 | 5 | 1 | 0 | bridge |
| L27 | practice | 5 | 6×6 | 7s 7c 1b 1t | 12 | 4 | 2 | 8 | 4 | 0 | 5 | 1 | 0 | bridge |
| L28 | practice | 5 | 6×6 | 9s 5c 1b 1t | 12 | 4 | 2 | 6 | 6 | 0 | 5 | 1 | 0 | bridge |
| L29 | practice | 5 | 6×6 | 6s 7c 1b 1t | 11 | 4 | 1 | 1 | 10 | 0 | 6 | 1 | 0 | tunnel |
| L30 | repair | 5 | 6×6 | 7s 8c 1b 1t (10 pre-laid) | 14 | 3 | 2 | 4 | 10 | 0 | 5 | 1 | 3 | bridge |
| L31 | intro: oneWay | 6 | 6×6 | 3s 5c 1b | 9 | 0 | 1 | 6 | 3 | 0 | 2 | 0 | 0 | bridge, arrow |
| L32 | practice | 6 | 6×7 | 6s 5c 1b 3t | 12 | 3 | 2 | 7 | 5 | 0 | 5 | 2 | 0 | bridge, tunnel |
| L33 | practice | 6 | 6×6 | 3s 9c 1b 2t | 12 | 3 | 2 | 7 | 5 | 0 | 5 | 2 | 0 | bridge |
| L34 | practice | 6 | 6×6 | 9s 4c 3t | 13 | 3 | 1 | 3 | 10 | 0 | 5 | 2 | 0 | tunnel |
| L35 | practice | 6 | 6×7 | 4s 9c 2t | 11 | 4 | 2 | 3 | 8 | 0 | 6 | 1 | 0 | tunnel |
| L36 | repair | 6 | 6×6 | 10s 6c (7 pre-laid) | 13 | 3 | 1 | 7 | 6 | 0 | 5 | 0 | 3 | – |
| L37 | intro: order | 7 | 6×6 | 5s 7c | 12 | 0 | 1 | 4 | 8 | 0 | 5 | 0 | 0 | station, order |
| L38 | practice | 7 | 6×6 | 9s 9c | 14 | 4 | 1 | 2 | 12 | 0 | 5 | 0 | 0 | station, order |
| L39 | practice | 7 | 6×6 | 9s 8c | 13 | 4 | 1 | 5 | 8 | 0 | 6 | 0 | 0 | station, order |
| L40 | practice | 7 | 6×6 | 9s 9c | 14 | 4 | 1 | 5 | 9 | 0 | 7 | 0 | 0 | station, order |
| L41 | practice | 7 | 6×6 | 9s 9c | 15 | 3 | 2 | 4 | 11 | 0 | 8 | 0 | 0 | station, order |
| L42 | repair | 7 | 6×7 | 7s 8c 2b (13 pre-laid) | 14 | 3 | 1 | 4 | 10 | 0 | 5 | 2 | 2 | station, order |
| L43 | practice | 8 | 6×7 | 5s 8c 2b 4t | 14 | 5 | 1 | 5 | 9 | 0 | 6 | 4 | 0 | bridge, tunnel, station |
| L44 | practice | 8 | 6×7 | 8s 8c 1b 2t | 15 | 4 | 1 | 4 | 11 | 0 | 6 | 2 | 0 | bridge, station, order |
| L45 | practice | 8 | 6×7 | 8s 5c 4b 2t | 14 | 5 | 2 | 4 | 10 | 0 | 7 | 4 | 0 | bridge, tunnel, station |
| L46 | practice | 8 | 6×7 | 6s 7c 4b 2t | 15 | 4 | 1 | 5 | 10 | 0 | 8 | 4 | 0 | bridge, tunnel, station, order |
| L47 | practice | 8 | 6×7 | 7s 9c 4b 3t | 18 | 5 | 2 | 7 | 11 | 0 | 9 | 4 | 0 | bridge, tunnel, station |
| L48 | finale | 8 | 6×7 | 7s 8c 1b 4t | 16 | 4 | 1 | 8 | 8 | 0 | 9 | 3 | 0 | bridge, tunnel, station, order |
| L08s | sibling of L08 | 2 | 5×5 | 1s 4c 1b | 6 | 0 | 1 | 4 | 2 | 0 | 1 | 0 | 0 | bridge |
| L09s | sibling of L09 | 2 | 5×6 | 4c 1b | 5 | 0 | 2 | 3 | 2 | 2 | 1 | 0 | 0 | bridge |
| L10s | sibling of L10 | 2 | 5×6 | 2s 3c 1b | 6 | 0 | 1 | 4 | 2 | 0 | 1 | 0 | 0 | bridge |
| L11s | sibling of L11 | 2 | 5×5 | 4c 1b | 5 | 0 | 1 | 3 | 2 | 0 | 1 | 0 | 0 | bridge |
| L14s | sibling of L14 | 3 | 6×6 | 2s 2c 2t | 6 | 0 | 1 | 2 | 4 | 0 | 1 | 0 | 0 | tunnel |
| L15s | sibling of L15 | 3 | 5×5 | 4c 3t | 6 | 1 | 1 | 4 | 2 | 0 | 1 | 1 | 0 | tunnel |
| L16s | sibling of L16 | 3 | 5×5 | 1s 4c 2t | 7 | 0 | 2 | 5 | 2 | 0 | 1 | 0 | 0 | tunnel |
| L17s | sibling of L17 | 3 | 5×5 | 1s 3c 2t | 6 | 0 | 1 | 2 | 4 | 0 | 2 | 0 | 0 | tunnel |
| L20s | sibling of L20 | 4 | 6×6 | 1s 5c 1b | 7 | 0 | 1 | 5 | 2 | 0 | 1 | 0 | 0 | bridge, station |
| L21s | sibling of L21 | 4 | 5×6 | 5s 4c | 8 | 1 | 1 | 1 | 7 | 0 | 1 | 0 | 0 | station |
| L22s | sibling of L22 | 4 | 5×6 | 5s 4c | 9 | 0 | 1 | 5 | 4 | 0 | 1 | 0 | 0 | station |
| L23s | sibling of L23 | 4 | 6×6 | 4s 4c 1b | 8 | 1 | 1 | 4 | 4 | 0 | 3 | 0 | 0 | bridge, station |
| L25s | sibling of L25 | 5 | 6×6 | 2s 5c 1b 1t | 8 | 1 | 1 | 4 | 4 | 0 | 1 | 1 | 0 | bridge |
| L26s | sibling of L26 | 5 | 6×6 | 2s 4c 1b 1t | 7 | 1 | 1 | 5 | 2 | 0 | 2 | 1 | 0 | bridge |
| L27s | sibling of L27 | 5 | 6×6 | 2s 3c 1b 1t | 5 | 2 | 1 | 1 | 4 | 0 | 1 | 2 | 0 | – |
| L28s | sibling of L28 | 5 | 6×6 | 2s 5c 1b 1t | 7 | 2 | 1 | 5 | 2 | 0 | 3 | 1 | 0 | bridge |
| L29s | sibling of L29 | 5 | 6×6 | 4s 4c 1b 1t | 8 | 2 | 1 | 2 | 6 | 0 | 2 | 1 | 0 | bridge |
| L32s | sibling of L32 | 6 | 6×6 | 5s 4c | 8 | 1 | 1 | 6 | 2 | 0 | 3 | 0 | 0 | – |
| L33s | sibling of L33 | 6 | 6×7 | 3s 3c | 6 | 0 | 1 | 3 | 3 | 0 | 3 | 0 | 0 | – |
| L34s | sibling of L34 | 6 | 6×6 | 2s 4c | 6 | 0 | 1 | 3 | 3 | 0 | 3 | 0 | 0 | – |
| L35s | sibling of L35 | 6 | 6×7 | 5s 3c | 7 | 1 | 1 | 4 | 3 | 0 | 1 | 0 | 0 | – |
| L38s | sibling of L38 | 7 | 6×7 | 7s 7c | 12 | 2 | 1 | 3 | 9 | 0 | 2 | 0 | 0 | station, order |
| L39s | sibling of L39 | 7 | 6×6 | 4s 7c | 11 | 0 | 1 | 5 | 6 | 0 | 2 | 0 | 0 | station, order |
| L40s | sibling of L40 | 7 | 6×7 | 3s 9c | 12 | 0 | 2 | 4 | 8 | 0 | 1 | 0 | 0 | station, order |
| L41s | sibling of L41 | 7 | 6×7 | 4s 8c | 11 | 1 | 1 | 4 | 7 | 0 | 5 | 0 | 0 | station, order |
| L43s | sibling of L43 | 8 | 6×7 | 3s 4c 1b 1t | 7 | 2 | 2 | 5 | 2 | 0 | 1 | 0 | 0 | bridge, tunnel, station |
| L44s | sibling of L44 | 8 | 6×7 | 5s 7c 1t | 13 | 0 | 1 | 4 | 9 | 0 | 3 | 0 | 0 | tunnel, station, order |
| L45s | sibling of L45 | 8 | 6×7 | 5s 7c 1b 2t | 12 | 3 | 1 | 9 | 3 | 0 | 5 | 1 | 0 | bridge, tunnel, station |
| L46s | sibling of L46 | 8 | 6×7 | 4s 9c 2b | 13 | 2 | 1 | 9 | 4 | 0 | 1 | 1 | 0 | bridge, station, order |
| L47s | sibling of L47 | 8 | 6×7 | 5s 5c 2b 2t | 11 | 3 | 2 | 8 | 3 | 0 | 1 | 2 | 0 | bridge, tunnel, station |
| L48s | sibling of L48 | 8 | 6×7 | 7s 5c 2b | 12 | 2 | 1 | 5 | 7 | 0 | 1 | 1 | 0 | bridge, station, order |
