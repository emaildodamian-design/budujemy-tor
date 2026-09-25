import type { Level, PieceKind, Placed } from '../src/game/level';
import { boardOf, cellOf, isBuildable, orientationsFor, terrainAccepts, terrainAt } from '../src/game/level';
import { handFor } from '../src/game/solver';

/** Small deterministic PRNG so tests are reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const P = (x: number, y: number, piece: PieceKind, openings: Placed['openings']): Placed => ({ at: [x, y], piece, openings });

/** Deep-freeze so any mutation of an input throws. */
export function frozen<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
}

/** Up to `n` random wrong pieces on free legal cells, using what is left in the hand. */
export function scatter(level: Level, pieces: Placed[], n: number, rnd: () => number): Placed[] {
  const b = boardOf(level);
  const out = [...pieces];
  for (let k = 0; k < n; k++) {
    const hand = handFor(level, out);
    const kinds = (Object.keys(hand) as PieceKind[]).filter((x) => hand[x] > 0);
    if (!kinds.length) break;
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const cells: [number, number][] = [];
    for (let y = 0; y < b.rows; y++)
      for (let x = 0; x < b.cols; x++) {
        const t = terrainAt(level, { x, y });
        if (!isBuildable(t) || b.fixed.has(`${x},${y}`) || out.some((p) => p.at[0] === x && p.at[1] === y)) continue;
        if (level.placement === 'strict' && !terrainAccepts(t, kind)) continue;
        cells.push([x, y]);
      }
    if (!cells.length) break;
    const at = cells[Math.floor(rnd() * cells.length)];
    const os = orientationsFor(kind);
    out.push({ at, piece: kind, openings: os[Math.floor(rnd() * os.length)] });
    void cellOf;
  }
  return out;
}
