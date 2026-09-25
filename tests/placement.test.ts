import { describe, expect, it } from 'vitest';
import { ghostPath, plan } from '../src/game/hints';
import type { Level } from '../src/game/level';
import { initialPieces } from '../src/game/level';
import { LEVELS, levelById } from '../src/game/levels';
import { autoOrientation, autoTurns, canPlace, drop, placeGhost, takeBack, trayView, turn } from '../src/game/placement';
import { trace } from '../src/game/trace';
import { P } from './helpers';

const L = (id: string) => levelById(id)!;

describe('laying pieces', () => {
  it('strict placement: incompatible terrain is refused (the piece floats back)', () => {
    const l = L('L10'); // river row, strict
    expect(canPlace(l, { x: 2, y: 1 }, 'straight')).toBe(false);
    expect(canPlace(l, { x: 2, y: 1 }, 'bridge')).toBe(true);
    expect(canPlace(l, { x: 2, y: 2 }, 'bridge')).toBe(false);
    const r = drop(l, [], { x: 2, y: 1 }, 'straight');
    expect(r).toMatchObject({ ok: false, pieces: [] });
  });

  it('free placement: a wrong piece can be laid; the test run stops before it', () => {
    const l = L('L21');
    const r = drop(l, [], { x: 1, y: 1 }, 'straight');
    expect(r.ok).toBe(true);
  });

  it('scenery, the sheds, stations and fixed track take no pieces', () => {
    const l = L('L22');
    for (const c of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 2 }]) expect(canPlace(l, c, 'straight')).toBe(false);
    expect(canPlace(L('L05'), { x: 2, y: 1 }, 'curve')).toBe(false); // rock
  });

  it('an empty tray kind cannot be laid', () => {
    const l = L('L01');
    const one = drop(l, [], { x: 1, y: 1 }, 'straight');
    expect(one.ok).toBe(true);
    expect(drop(l, one.pieces, { x: 1, y: 0 }, 'straight').ok).toBe(false);
    expect(drop(l, [], { x: 1, y: 1 }, 'curve').ok).toBe(false);
  });

  it('dropping on a movable piece swaps: the old piece floats back to the tray', () => {
    const l = L('L04');
    const a = drop(l, [], { x: 1, y: 0 }, 'straight');
    const b = drop(l, a.pieces, { x: 1, y: 0 }, 'curve');
    expect(b.ok).toBe(true);
    expect(b.swappedOut).toMatchObject({ piece: 'straight' });
    expect(b.pieces).toHaveLength(1);
    expect(trayView(l, b.pieces)).toEqual([
      { piece: 'straight', count: 3 },
      { piece: 'curve', count: 1 },
    ]);
  });

  it('take back (hold or drag to tray) returns the piece', () => {
    const l = L('L02');
    const a = drop(l, [], { x: 1, y: 1 }, 'straight');
    expect(takeBack(a.pieces, { x: 1, y: 1 })).toEqual([]);
  });
});

describe('auto orientation', () => {
  it('connects to the start exit and prefers joining two neighbours', () => {
    expect(autoOrientation(L('L01'), [], { x: 1, y: 1 }, 'straight')).toBe('EW');
    expect(autoOrientation(L('L03'), [], { x: 1, y: 0 }, 'curve')).toBe('SW'); // start (W) + depot (S)
    expect(autoOrientation(L('L09'), [], { x: 1, y: 1 }, 'bridge')).toBe('EW');
    expect(autoOrientation(L('L10'), [P(1, 0, 'straight', 'EW'), P(2, 0, 'curve', 'SW')], { x: 2, y: 1 }, 'bridge')).toBe('NS');
  });

  it('does not point a loose end into scenery or off the board', () => {
    const l = L('L05'); // rock at (2,1)
    const o = autoOrientation(l, [], { x: 1, y: 1 }, 'curve');
    expect(['NW', 'SW']).toContain(o);
  });

  it('a tap cycles at most 2 connecting orientations (auto); 90° turns (free)', () => {
    const l = L('L04');
    const turns = autoTurns(l, [], { x: 1, y: 0 }, 'curve');
    expect(turns.length).toBeGreaterThanOrEqual(1);
    expect(turns.length).toBeLessThanOrEqual(2);
    let ps = drop(l, [], { x: 1, y: 0 }, 'curve').pieces;
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      seen.add(ps[0].openings);
      ps = turn(l, ps, { x: 1, y: 0 });
    }
    expect(seen.size).toBeLessThanOrEqual(2);
    const f = L('L31');
    let q = drop(f, [], { x: 1, y: 0 }, 'curve').pieces;
    expect(q[0].openings).toBe('ES'); // arrives in its tray orientation
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      q = turn(f, q, { x: 1, y: 0 });
      order.push(q[0].openings);
    }
    expect(order).toEqual(['SW', 'NW', 'NE', 'ES']);
  });

  it('for every chapter 1–6 level, laying the solution cells in route order with auto rotation succeeds', () => {
    // The auto rule is a convenience, not a solver: it must at least never fight a child who builds in order.
    const autoLevels = LEVELS.filter((l: Level) => l.rotate === 'auto' && !l.preplaced);
    for (const l of autoLevels) {
      let ps = initialPieces(l);
      for (const s of l.solution) {
        let r = drop(l, ps, { x: s.at[0], y: s.at[1] }, s.piece);
        expect(r.ok).toBe(true);
        // At most one tap to reach the needed orientation.
        if (r.pieces.at(-1)!.openings !== s.openings) r = { ...r, pieces: turn(l, r.pieces, { x: s.at[0], y: s.at[1] }) };
        ps = r.pieces;
      }
      expect(trace(l, ps).success, l.id).toBe(true);
    }
  });
});

describe('ghost path', () => {
  it('tapping ghosts (then laying the last piece by hand) finishes a repair level', () => {
    for (const l of LEVELS.filter((x) => x.preplaced)) {
      let ps = initialPieces(l);
      for (let guard = 0; guard < 20 && !trace(l, ps).success; guard++) {
        const p = plan(l, ps);
        const ghosts = ghostPath(l, ps);
        if (p.hint.type === 'blocked') {
          ps = p.hint.cells.reduce((a, c) => takeBack(a, c), ps);
          continue;
        }
        if (ghosts.length === 0) {
          const last = p.completion.at(-1)!;
          const r = placeGhost(l, ps, last, p.completion);
          expect(r.ok).toBe(true);
          ps = r.pieces;
          continue;
        }
        const r = placeGhost(l, ps, ghosts[0], p.completion);
        expect(r.ok, l.id).toBe(true);
        ps = r.pieces;
      }
      expect(trace(l, ps).success, l.id).toBe(true);
    }
  });
});
