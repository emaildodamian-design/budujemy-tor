import { describe, expect, it } from 'vitest';
import { BoardSize, cellKey, inBounds } from '../src/game/grid';
import {
  BOARD,
  INPUT_DELAY_MS,
  STATION,
  TOTAL_TURNS,
  TURNS_PER_PLAYER,
  canAct,
  createSession,
  currentPlayer,
  depot,
  finishRide,
  fittingKinds,
  inputWaitMs,
  isBridgeTurn,
  occupiedCells,
  placeTile,
  playerForTurn,
  remainingFor,
  remainingTurns,
  scheduleBridges,
  tapBridge,
  turnKind,
} from '../src/game/session';
import { after, playTurn, seeded } from './helpers';

const T0 = 1_000_000;

describe('turn logic', () => {
  it('starts with the CHILD and alternates CHILD, PARENT, CHILD, ...', () => {
    let s = createSession(T0, seeded(1));
    const order: string[] = [];
    while (s.phase === 'build') {
      order.push(currentPlayer(s));
      s = playTurn(s);
    }
    expect(order).toEqual(Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 'child' : 'parent')));
    expect(playerForTurn(0)).toBe('child');
    expect(playerForTurn(1)).toBe('parent');
  });

  it('accepts a tile only on the head cell (the adjacent free cell)', () => {
    const s = createSession(T0, seeded(2));
    const now = after(s);
    const wrong = placeTile(s, 'straight', { x: 0, y: 0 }, now);
    expect(wrong).toMatchObject({ ok: false, reason: 'wrong-cell' });
    expect(wrong.state).toBe(s); // invalid drop changes nothing (UI snaps the tile back)
    const onStation = placeTile(s, 'straight', STATION, now);
    expect(onStation.ok).toBe(false);
    const ok = placeTile(s, 'straight', s.head.cell, now);
    expect(ok.ok).toBe(true);
    expect(ok.state.tiles).toHaveLength(1);
    expect(ok.state.tiles[0]).toMatchObject({ owner: 'child', kind: 'straight', cell: { x: 2, y: 5 } });
    expect(ok.state.head.cell).toEqual({ x: 2, y: 4 });
  });

  it('rejects a tile that would leave no room to finish (does-not-fit), without changing state', () => {
    // rng 0.1 -> one bridge on turn 3, fixed on turn 4. Lay straights up to the top row.
    let s = createSession(T0, () => 0.1);
    expect(s.bridgeTurns).toEqual([3]);
    while (s.head.cell.y > 0) {
      const r = placeTile(s, 'straight', s.head.cell, after(s));
      expect(r.ok).toBe(true);
      s = turnKind(r.state) === 'fix' ? playTurn(r.state) : r.state;
    }
    expect(s.head.cell).toEqual({ x: 2, y: 0 });
    expect(turnKind(s)).toBe('place');
    const r = placeTile(s, 'straight', s.head.cell, after(s));
    expect(r).toMatchObject({ ok: false, reason: 'does-not-fit' });
    expect(r.state).toBe(s);
    expect(fittingKinds(s)).toEqual(['left', 'right']);
  });

  it('curves turn the train left/right relative to its heading', () => {
    const s = createSession(T0, seeded(3));
    const left = placeTile(s, 'left', s.head.cell, after(s));
    expect(left.ok && left.state.head.cell).toEqual({ x: 1, y: 5 });
    const right = placeTile(s, 'right', s.head.cell, after(s));
    expect(right.ok && right.state.head.cell).toEqual({ x: 3, y: 5 });
  });
});

describe('input delay (~5 s at each turn start)', () => {
  it('ignores input before the delay and accepts it after', () => {
    const s = createSession(T0, seeded(4));
    expect(canAct(s, T0)).toBe(false);
    expect(inputWaitMs(s, T0)).toBe(INPUT_DELAY_MS);
    expect(INPUT_DELAY_MS).toBeGreaterThanOrEqual(4500);
    expect(INPUT_DELAY_MS).toBeLessThanOrEqual(6000);
    const early = placeTile(s, 'straight', s.head.cell, T0 + INPUT_DELAY_MS - 1);
    expect(early).toMatchObject({ ok: false, reason: 'too-early' });
    expect(canAct(s, T0 + INPUT_DELAY_MS)).toBe(true);
    const r = placeTile(s, 'straight', s.head.cell, T0 + INPUT_DELAY_MS);
    expect(r.ok).toBe(true);
  });

  it('restarts the delay at every new turn', () => {
    const s = createSession(T0, seeded(5));
    const t1 = T0 + 9000;
    const r = placeTile(s, 'straight', s.head.cell, t1);
    expect(r.state.turnStartedAt).toBe(t1);
    expect(canAct(r.state, t1 + 100)).toBe(false);
    expect(canAct(r.state, t1 + INPUT_DELAY_MS)).toBe(true);
  });

  it('has no speed pressure: a turn never expires however long players take', () => {
    const s = createSession(T0, seeded(6));
    const muchLater = T0 + 60 * 60 * 1000;
    expect(canAct(s, muchLater)).toBe(true);
    expect(currentPlayer(s)).toBe('child');
    expect(placeTile(s, 'straight', s.head.cell, muchLater).ok).toBe(true);
  });
});

describe('session cap (6 turns per player)', () => {
  it('ends the build after exactly 12 turns and moves to the ride', () => {
    let s = createSession(T0, seeded(7));
    expect(remainingTurns(s)).toBe(TOTAL_TURNS);
    expect(remainingFor(s, 'child')).toBe(TURNS_PER_PLAYER);
    expect(remainingFor(s, 'parent')).toBe(TURNS_PER_PLAYER);
    for (let i = 0; i < TOTAL_TURNS; i++) {
      expect(s.phase).toBe('build');
      expect(remainingTurns(s)).toBe(TOTAL_TURNS - i); // one wagon disappears per turn
      s = playTurn(s);
    }
    expect(s.phase).toBe('ride');
    expect(remainingTurns(s)).toBe(0);
    expect(remainingFor(s, 'child')).toBe(0);
    expect(remainingFor(s, 'parent')).toBe(0);
  });

  it('refuses any further move once the cap is reached', () => {
    let s = createSession(T0, seeded(8));
    while (s.phase === 'build') s = playTurn(s);
    const later = s.turnStartedAt + 10 * INPUT_DELAY_MS;
    expect(placeTile(s, 'straight', s.head.cell, later)).toMatchObject({ ok: false, reason: 'session-over' });
    expect(tapBridge(s, 'child', later)).toMatchObject({ ok: false, reason: 'session-over' });
    expect(canAct(s, later)).toBe(false);
    const done = finishRide(s);
    expect(done.phase).toBe('done');
    expect(placeTile(done, 'straight', done.head.cell, later).ok).toBe(false);
  });

  it('never gets stuck: over many random games there is always a fitting tile, and the depot is free', () => {
    const size: BoardSize = BOARD;
    for (let seed = 1; seed <= 400; seed++) {
      const rng = seeded(seed);
      let s = createSession(T0, rng);
      while (s.phase === 'build') s = playTurn(s, (kinds) => Math.floor(rng() * kinds.length));
      const d = depot(s);
      expect(inBounds(d.cell, size)).toBe(true);
      expect(occupiedCells(s).has(cellKey(d.cell))).toBe(false);
      const placed = s.tiles.length;
      expect(placed).toBe(TOTAL_TURNS - s.bridgeTurns.length);
    }
  });
});

describe('bridge event', () => {
  it('schedules 1 or 2 bridges, only on PARENT turns that are followed by a CHILD turn', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const b = scheduleBridges(seeded(seed));
      counts.add(b.length);
      expect(b.length === 1 || b.length === 2).toBe(true);
      for (const t of b) {
        expect(playerForTurn(t)).toBe('parent');
        expect(t + 1).toBeLessThan(TOTAL_TURNS);
        expect(playerForTurn(t + 1)).toBe('child');
      }
      if (b.length === 2) expect(Math.abs(b[0] - b[1])).toBeGreaterThanOrEqual(4); // not back to back
    }
    expect(counts).toEqual(new Set([1, 2]));
  });

  it('parent lays a broken bridge; the next CHILD turn is "fix it together" and needs both taps', () => {
    let s = createSession(T0, seeded(9));
    const bridgeTurn = s.bridgeTurns[0];
    while (s.turn < bridgeTurn) s = playTurn(s);

    expect(currentPlayer(s)).toBe('parent');
    expect(isBridgeTurn(s)).toBe(true);
    const placed = placeTile(s, fittingKinds(s)[0], s.head.cell, after(s));
    expect(placed.ok).toBe(true);
    s = placed.state;
    const bridge = s.tiles[s.tiles.length - 1];
    expect(bridge).toMatchObject({ bridge: true, broken: true, owner: 'parent' });

    expect(currentPlayer(s)).toBe('child');
    expect(turnKind(s)).toBe('fix');
    // No tile can be laid on a fix turn.
    expect(placeTile(s, 'straight', s.head.cell, after(s))).toMatchObject({ ok: false, reason: 'wrong-turn-kind' });
    // Taps respect the input delay too.
    expect(tapBridge(s, 'child', s.turnStartedAt)).toMatchObject({ ok: false, reason: 'too-early' });

    const turnBefore = s.turn;
    const one = tapBridge(s, 'child', after(s));
    expect(one.ok).toBe(true);
    expect(one.state.turn).toBe(turnBefore); // one tap is not enough
    expect(one.state.tiles.at(-1)!.broken).toBe(true);
    expect(tapBridge(one.state, 'child', after(s))).toMatchObject({ ok: false, reason: 'already-tapped' });

    const both = tapBridge(one.state, 'parent', after(s));
    expect(both.ok).toBe(true);
    expect(both.state.tiles.at(-1)).toMatchObject({ bridge: true, broken: false });
    expect(both.state.turn).toBe(turnBefore + 1); // the fix used up the child's turn
    expect(currentPlayer(both.state)).toBe('parent');
    expect(both.state.repairTaps).toEqual({ child: false, parent: false });
  });

  it('taps work in either order', () => {
    let s = createSession(T0, seeded(10));
    while (turnKind(s) !== 'fix') s = playTurn(s);
    const a = tapBridge(s, 'parent', after(s));
    const b = tapBridge(a.state, 'child', after(s));
    expect(b.ok).toBe(true);
    expect(b.state.tiles.every((t) => !t.broken)).toBe(true);
  });

  it('non-bridge turns lay normal tiles, and tapping outside a fix turn does nothing', () => {
    const s = createSession(T0, seeded(11));
    expect(tapBridge(s, 'child', after(s))).toMatchObject({ ok: false, reason: 'wrong-turn-kind' });
    const r = placeTile(s, 'straight', s.head.cell, after(s));
    expect(r.state.tiles[0]).toMatchObject({ bridge: false, broken: false });
  });

  it('every bridge is repaired before the ride', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let s = createSession(T0, seeded(seed));
      while (s.phase === 'build') s = playTurn(s);
      expect(s.tiles.filter((t) => t.bridge)).toHaveLength(s.bridgeTurns.length);
      expect(s.tiles.some((t) => t.broken)).toBe(false);
    }
  });
});
