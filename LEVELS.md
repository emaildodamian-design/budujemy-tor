# Levels

Generated from `src/game/levels.json` by `npm run levels` (checked in CI: the test fails if this file is stale).

- **pieces**: length of the declared solution. **distractors**: pieces owned (tray + pre-laid) minus pieces the solution uses; on repair levels this includes the wrong pieces that go back to the tray.
- **solutions**: distinct solutions the solver finds from an empty board with everything the player owns (capped at 50).

| id | ch | intro | board | terrain | tray | pieces | distractors | rotate / placement | solutions |
|---|---|---|---|---|---|---|---|---|---|
| L01 | 1 | straight | 3×3 | – | 1×straight | 1 | 0 | auto / strict | 1 |
| L02 | 1 |  | 4×3 | – | 2×straight | 2 | 0 | auto / strict | 1 |
| L03 | 1 | curve | 3×3 | – | 1×curve | 1 | 0 | auto / strict | 1 |
| L04 | 1 |  | 4×4 | – | 3×straight, 2×curve | 5 | 0 | auto / strict | 2 |
| L05 | 2 | obstacle | 4×3 | obstacles | 1×straight, 3×curve | 4 | 0 | auto / strict | 1 |
| L06 | 2 |  | 4×4 | obstacles | 3×straight, 2×curve | 5 | 0 | auto / strict | 1 |
| L07 | 2 |  | 5×4 | obstacles | 1×straight, 4×curve | 5 | 0 | auto / strict | 1 |
| L08 | 2 | repair | 4×4 | obstacles | 1×straight + 5 pre-laid | 5 | 1 | auto / strict | 1 |
| L09 | 3 | bridge | 3×3 | river | 1×bridge | 1 | 0 | auto / strict | 1 |
| L10 | 3 |  | 4×4 | river | 2×straight, 1×curve, 1×bridge | 4 | 0 | auto / strict | 1 |
| L11 | 3 |  | 4×3 | river | 2×straight, 1×curve, 1×bridge | 4 | 0 | auto / strict | 1 |
| L12 | 3 |  | 5×3 | river, obstacles | 1×straight, 2×curve, 2×bridge | 5 | 0 | auto / strict | 1 |
| L13 | 3 | repair | 5×4 | river | 1×bridge + 6 pre-laid | 6 | 1 | auto / strict | 2 |
| L14 | 4 | tunnel | 3×3 | mountain | 1×tunnel | 1 | 0 | auto / strict | 1 |
| L15 | 4 |  | 4×4 | mountain | 2×straight, 1×curve, 1×tunnel | 4 | 0 | auto / strict | 1 |
| L16 | 4 |  | 5×4 | mountain | 2×straight, 1×curve, 2×tunnel | 5 | 0 | auto / strict | 1 |
| L17 | 4 |  | 5×5 | mountain | 1×straight, 3×curve, 1×tunnel | 5 | 0 | auto / strict | 2 |
| L18 | 4 | repair | 5×4 | mountain | 1×tunnel + 5 pre-laid | 5 | 1 | auto / strict | 2 |
| L19 | 5 | station | 4×3 | station×1 | 3×curve | 3 | 0 | auto / free | 1 |
| L20 | 5 |  | 5×3 | station×1 | 2×straight, 4×curve | 6 | 0 | auto / free | 1 |
| L21 | 5 |  | 5×4 | river, station×1 | 2×straight, 2×curve, 1×bridge | 5 | 0 | auto / free | 1 |
| L22 | 5 |  | 5×5 | station×2 | 4×straight, 3×curve | 7 | 0 | auto / free | 1 |
| L23 | 5 | repair | 5×4 | station×1 | 2×straight + 6 pre-laid | 3 | 5 | auto / free | 2 |
| L24 | 6 |  | 4×4 | obstacles | 3×straight, 3×curve | 5 | 1 | auto / free | 1 |
| L25 | 6 |  | 5×4 | river | 3×straight, 2×curve, 1×bridge, 1×tunnel | 6 | 1 | auto / free | 1 |
| L26 | 6 |  | 5×5 | obstacles | 4×straight, 3×curve, 1×tunnel | 7 | 1 | auto / free | 1 |
| L27 | 6 |  | 5×5 | river, station×1 | 4×straight, 2×curve, 2×bridge | 6 | 2 | auto / free | 1 |
| L28 | 6 |  | 5×5 | mountain, station×1 | 3×straight, 2×curve, 2×tunnel, 1×bridge | 6 | 2 | auto / free | 1 |
| L29 | 6 | repair | 5×5 | mountain, obstacles | 1×tunnel, 1×straight + 5 pre-laid | 5 | 2 | auto / free | 1 |
| L30 | 7 | rotation | 3×3 | – | 1×straight | 1 | 0 | free / free | 1 |
| L31 | 7 |  | 4×4 | obstacles | 2×straight, 3×curve | 5 | 0 | free / free | 2 |
| L32 | 7 |  | 5×4 | river | 3×straight, 3×curve | 6 | 0 | free / free | 1 |
| L33 | 7 | repair | 5×4 | obstacles | 1×straight + 6 pre-laid | 6 | 1 | free / free | 2 |
| L34 | 8 |  | 5×5 | river, mountain | 4×straight, 2×curve, 1×bridge, 1×tunnel | 7 | 1 | free / free | 2 |
| L35 | 8 |  | 5×5 | mountain, station×1, obstacles | 4×straight, 4×curve, 1×tunnel, 1×bridge | 8 | 2 | free / free | 2 |
| L36 | 8 |  | 5×5 | river, station×1 | 6×straight, 2×curve, 2×bridge, 1×tunnel | 10 | 1 | free / free | 1 |
| L37 | 8 | repair | 5×6 | river, mountain, station×1 | 1×bridge, 1×curve + 7 pre-laid | 7 | 2 | free / free | 1 |
| L38 | 8 |  | 5×6 | river, mountain, station×1, obstacles | 5×straight, 3×curve, 1×tunnel, 1×bridge | 9 | 1 | free / free | 1 |
| L39 | 8 |  | 5×6 | river, station×2 | 5×straight, 5×curve, 1×bridge, 1×tunnel | 10 | 2 | free / free | 1 |
| L40 | 8 |  | 5×6 | river, mountain, station×1, obstacles | 5×straight, 5×curve, 2×bridge, 1×tunnel | 11 | 2 | free / free | 1 |
