import {
  type SessionState,
  INPUT_DELAY_MS,
  fittingKinds,
  placeTile,
  tapBridge,
  turnKind,
} from '../src/game/session';

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

/** A clock that only ever moves past the input delay. */
export function after(s: SessionState): number {
  return s.turnStartedAt + INPUT_DELAY_MS;
}

/** Play one turn the way two cooperative players would. */
export function playTurn(s: SessionState, pick: (kinds: string[]) => number = () => 0): SessionState {
  const now = after(s);
  if (turnKind(s) === 'fix') {
    const r1 = tapBridge(s, 'child', now);
    if (!r1.ok) throw new Error(r1.reason);
    const r2 = tapBridge(r1.state, 'parent', now);
    if (!r2.ok) throw new Error(r2.reason);
    return r2.state;
  }
  const kinds = fittingKinds(s);
  if (kinds.length === 0) throw new Error(`stuck at turn ${s.turn}`);
  const r = placeTile(s, kinds[pick(kinds) % kinds.length], s.head.cell, now);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
