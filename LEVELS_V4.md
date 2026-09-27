# Levels (v4)

Generated from `src/game/levels4.json` by `npm run levels4` (checked in CI: the test fails if this file is stale).
Definitions: `src/game/progMetrics.ts` and the README. Bands: `src/game/bands4.ts`.

- **commands**: absolute arrows (N E S W) or relative curves seen from the engine (L F R). **slots** / **fslots**: main row / P row length.
- **routeLen**: pieces laid by the shortest-route solution. **solutions**: programs that fill the rows and succeed (cap 50). **routes**: distinct routes among them.
- **candidates**: programs that fit the rows exactly in the level's grammar (closed form). **guessRatio** = candidates / solutions.
- **needsLoop**: no solution is loop-free. **nestDepth**: least deepest Repeat nesting over solutions. **needsFunction**: every solution runs P at least twice.
- **bugs**: debug levels, fewest single-token changes that fix the given program. **detour**: routeLen − v3 naiveLen.

| id | chapter | kind | board | commands | slots | fslots | routeLen | solutions | routes | candidates | guessRatio | needsLoop | nestDepth | needsFunction | bugs | detour |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | 1 | practice | 5×4 | absolute | 7 | 0 | 7 | 3 | 3 | 16384 | 5461 | – | 0 | – | – | 2 |
| P02 | 1 | practice | 5×6 | absolute | 8 | 0 | 8 | 1 | 1 | 65536 | 65536 | – | 0 | – | – | 2 |
| P03 | 1 | practice | 6×5 | absolute | 9 | 0 | 9 | 2 | 2 | 262144 | 131072 | – | 0 | – | – | 2 |
| P04 | 1 | practice | 5×6 | absolute | 9 | 0 | 9 | 1 | 1 | 262144 | 262144 | – | 0 | – | – | 2 |
| P05 | 1 | practice | 5×6 | absolute | 10 | 0 | 10 | 1 | 1 | 1048576 | 1048576 | – | 0 | – | – | 8 |
| P06 | 2 | practice | 6×6 | absolute | 4 | 0 | 9 | 2 | 1 | 2048 | 1024 | yes | 1 | – | – | 0 |
| P07 | 2 | practice | 6×5 | absolute | 6 | 0 | 9 | 2 | 2 | 118784 | 59392 | yes | 1 | – | – | 4 |
| P08 | 2 | practice | 6×6 | absolute | 6 | 0 | 10 | 2 | 1 | 118784 | 59392 | yes | 1 | – | – | 4 |
| P09 | 2 | practice | 6×6 | absolute | 5 | 0 | 11 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 6 |
| P10 | 2 | practice | 6×5 | absolute | 5 | 0 | 12 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 4 |
| P11 | 3 | practice | 6×6 | absolute | 5 | 0 | 11 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 2 |
| P12 | 3 | practice | 6×5 | absolute | 5 | 0 | 11 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 2 |
| P13 | 3 | practice | 6×5 | absolute | 6 | 0 | 12 | 1 | 1 | 118784 | 118784 | yes | 1 | – | – | 2 |
| P14 | 3 | practice | 6×6 | absolute | 7 | 0 | 13 | 2 | 1 | 917504 | 458752 | yes | 1 | – | – | 2 |
| P15 | 3 | practice | 6×6 | absolute | 6 | 0 | 14 | 1 | 1 | 118784 | 118784 | yes | 1 | – | – | 2 |
| P16 | 4 | practice | 6×6 | absolute | 5 | 0 | 11 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 6 |
| P17 | 4 | practice | 6×6 | absolute | 5 | 0 | 13 | 1 | 1 | 15360 | 15360 | yes | 1 | – | – | 5 |
| P18 | 4 | practice | 6×6 | absolute | 6 | 0 | 13 | 2 | 2 | 118784 | 59392 | yes | 1 | – | – | 10 |
| P19 | 4 | practice | 6×6 | absolute | 6 | 0 | 13 | 1 | 1 | 118784 | 118784 | yes | 1 | – | – | 8 |
| P20 | 4 | practice | 6×6 | absolute | 8 | 0 | 13 | 2 | 2 | 7077888 | 3538944 | yes | 1 | – | – | 11 |
| P21 | 5 | practice | 6×6 | relative | 4 | 0 | 9 | 2 | 1 | 873 | 436 | yes | 1 | – | – | 0 |
| P22 | 5 | practice | 6×6 | relative | 7 | 0 | 12 | 2 | 1 | 210519 | 105259 | yes | 1 | – | – | 8 |
| P23 | 5 | practice | 6×6 | relative | 7 | 0 | 13 | 1 | 1 | 210519 | 210519 | yes | 1 | – | – | 8 |
| P24 | 5 | practice | 6×6 | relative | 7 | 0 | 13 | 1 | 1 | 210519 | 210519 | yes | 1 | – | – | 4 |
| P25 | 5 | practice | 6×5 | relative | 7 | 0 | 15 | 1 | 1 | 210519 | 210519 | yes | 1 | – | – | 6 |
| P26 | 6 | practice | 6×6 | relative | 5 | 0 | 13 | 1 | 1 | 13527 | 13527 | yes | 2 | – | – | 2 |
| P27 | 6 | practice | 6×6 | relative | 5 | 0 | 13 | 1 | 1 | 13527 | 13527 | yes | 2 | – | – | 2 |
| P28 | 6 | practice | 6×6 | relative | 5 | 0 | 15 | 1 | 1 | 13527 | 13527 | yes | 2 | – | – | 4 |
| P29 | 6 | practice | 6×6 | relative | 7 | 0 | 15 | 2 | 1 | 905175 | 452587 | yes | 2 | – | – | 14 |
| P30 | 6 | practice | 6×6 | relative | 6 | 0 | 16 | 1 | 1 | 111033 | 111033 | yes | 2 | – | – | 14 |
| P31 | 7 | practice | 6×6 | relative | 5 | 3 | 14 | 1 | 1 | 2073600 | 2073600 | yes | 1 | yes | – | 8 |
| P32 | 7 | practice | 6×6 | relative | 5 | 3 | 14 | 2 | 1 | 2073600 | 1036800 | yes | 1 | yes | – | 0 |
| P33 | 7 | practice | 6×6 | relative | 5 | 3 | 15 | 2 | 1 | 2073600 | 1036800 | yes | 1 | yes | – | 6 |
| P34 | 7 | practice | 6×6 | relative | 5 | 3 | 18 | 1 | 1 | 2073600 | 2073600 | yes | 1 | yes | – | 10 |
| P35 | 7 | practice | 6×6 | relative | 5 | 3 | 18 | 3 | 1 | 2073600 | 691200 | yes | 1 | yes | – | 16 |
| P36 | 8 | debug | 6×6 | absolute | 7 | 0 | 12 | 1 | 1 | 917504 | 917504 | yes | 1 | – | 2 | 4 |
| P37 | 8 | debug | 6×6 | relative | 5 | 3 | 14 | 2 | 1 | 2073600 | 1036800 | yes | 1 | yes | 3 | 2 |
| P38 | 8 | debug | 6×6 | relative | 7 | 0 | 15 | 2 | 1 | 905175 | 452587 | yes | 2 | – | 3 | 0 |
| P39 | 8 | debug | 6×6 | absolute | 6 | 0 | 16 | 1 | 1 | 118784 | 118784 | yes | 1 | – | 3 | 10 |
| P40 | 8 | finale | 6×6 | relative | 6 | 0 | 17 | 1 | 1 | 111033 | 111033 | yes | 2 | – | – | 14 |

## Stored programs

Notation: moves are letters, `P` runs the P row, `4[E N]` repeats its body 4 times, and the P row follows ` ; `.

| id | solution | given (debug levels) |
|---|---|---|
| P01 | `E N N E N E S` | – |
| P02 | `W S E S S E E N` | – |
| P03 | `W S W S W W N N W` | – |
| P04 | `S W N N N W N W N` | – |
| P05 | `N N N W S S S S E S` | – |
| P06 | `N 4[E N]` | – |
| P07 | `4[W] 3[N E] E` | – |
| P08 | `N 3[E N] 3[W]` | – |
| P09 | `4[E N] 3[W]` | – |
| P10 | `4[W N] 4[E]` | – |
| P11 | `3[N] 4[E S]` | – |
| P12 | `3[W S] 5[E]` | – |
| P13 | `3[E N] 5[W] N` | – |
| P14 | `N 3[E N] 5[W] N` | – |
| P15 | `5[E] 4[N W] W` | – |
| P16 | `3[S] 4[N E]` | – |
| P17 | `4[S W] 5[N]` | – |
| P18 | `4[W N] 5[E] S` | – |
| P19 | `4[S E] 4[N] E` | – |
| P20 | `3[N W] 2[S S E] N` | – |
| P21 | `L 4[R L]` | – |
| P22 | `F 3[F F R] 2[L]` | – |
| P23 | `2[L F] 3[F F R]` | – |
| P24 | `3[F F L] 2[F R]` | – |
| P25 | `3[F F L] 3[R F]` | – |
| P26 | `3[3[F] R] R` | – |
| P27 | `3[L 3[F]] R` | – |
| P28 | `3[L 2[F R]]` | – |
| P29 | `3[3[F] R] 2[F] R` | – |
| P30 | `3[2[L R] R] L` | – |
| P31 | `P 3[L F] P ; 2[F R]` | – |
| P32 | `P P F P F ; 3[F] L` | – |
| P33 | `P 2[R] P R ; 3[F L]` | – |
| P34 | `P 3[R F] P ; 3[F L]` | – |
| P35 | `P 2[F P] P ; L 3[F]` | – |
| P36 | `3[W S] 4[E] N W` | `3[W S] 2[E] N S` |
| P37 | `P P 2[R L] ; 4[F] R` | `P P 2[F R] ; 4[F] L` |
| P38 | `3[3[F] L] 2[F] R` | `3[2[F] F] 5[F] R` |
| P39 | `5[S E] 5[N] W` | `2[S E] 4[N] S` |
| P40 | `4[F R 2[F]] R` | – |
