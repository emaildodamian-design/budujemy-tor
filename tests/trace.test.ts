import { describe, expect, it } from 'vitest';
import type { Level } from '../src/game/level';
import { nextHint, plan } from '../src/game/hints';
import { solve } from '../src/game/solver';
import { trace } from '../src/game/trace';
import { P } from './helpers';

const base = (grid: string[], extra: Partial<Level> = {}): Level => ({
  id: 'L99',
  chapter: 1,
  kind: 'practice',
  grid,
  start: { exit: 'E' },
  depot: { entry: 'W' },
  tray: [{ piece: 'straight', count: 3 }],
  rotate: 'auto',
  placement: 'free',
  solution: [],
  ...extra,
});

describe('trace: every reason', () => {
  const line = base(['A..B']);

  it('success, with the path in ride order', () => {
    const r = trace(line, [P(1, 0, 'straight', 'EW'), P(2, 0, 'straight', 'EW')]);
    expect(r).toMatchObject({ success: true, reached: true, reason: null, breakCell: null });
    expect(r.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('gap: stops before the empty cell and glows it', () => {
    const r = trace(line, [P(1, 0, 'straight', 'EW')]);
    expect(r).toMatchObject({ success: false, reason: 'gap', stopCell: { x: 1, y: 0 }, breakCell: { x: 2, y: 0 } });
  });

  it('mismatch: the next piece does not open towards the train', () => {
    const r = trace(line, [P(1, 0, 'straight', 'EW'), P(2, 0, 'straight', 'NS')]);
    expect(r).toMatchObject({ reason: 'mismatch', stopCell: { x: 1, y: 0 }, breakCell: { x: 2, y: 0 } });
  });

  it('needsBridge / needsTunnel / needsTrack: wrong piece for the terrain (free placement)', () => {
    expect(trace(base(['A~B']), [P(1, 0, 'straight', 'EW')])).toMatchObject({ reason: 'needsBridge', breakCell: { x: 1, y: 0 }, stopCell: { x: 0, y: 0 } });
    expect(trace(base(['A^B']), [P(1, 0, 'bridge', 'EW')])).toMatchObject({ reason: 'needsTunnel', breakCell: { x: 1, y: 0 } });
    expect(trace(base(['A.B']), [P(1, 0, 'tunnel', 'EW')])).toMatchObject({ reason: 'needsTrack' });
    expect(trace(base(['A~B']), [P(1, 0, 'bridge', 'EW')]).success).toBe(true);
    expect(trace(base(['A^B']), [P(1, 0, 'tunnel', 'EW')]).success).toBe(true);
  });

  it('depotSide: reaching the depot from the wrong side', () => {
    const l = base(['A.', '.B'], { depot: { entry: 'W' } });
    const r = trace(l, [P(1, 0, 'curve', 'SW')]);
    expect(r).toMatchObject({ reason: 'depotSide', breakCell: { x: 1, y: 1 }, stopCell: { x: 1, y: 0 } });
  });

  it('missedStation: the depot gate stays shut and the station is reported', () => {
    const l = base(['A.B', '.S.'], { stations: [{ at: [1, 1], openings: 'EW' }] });
    const r = trace(l, [P(1, 0, 'straight', 'EW')]);
    expect(r).toMatchObject({ reason: 'missedStation', breakCell: { x: 1, y: 1 }, missingStations: [{ x: 1, y: 1 }] });
    const through = base(['A.S.B'], { stations: [{ at: [2, 0], openings: 'EW' }] });
    expect(trace(through, [P(1, 0, 'straight', 'EW'), P(3, 0, 'straight', 'EW')]).success).toBe(true);
  });

  it('edge: the track points off the board', () => {
    const r = trace(line, [P(1, 0, 'curve', 'NW')]);
    expect(r).toMatchObject({ reason: 'edge', breakCell: null, stopCell: { x: 1, y: 0 } });
  });

  it('loop: the track runs back into the start shed', () => {
    const l = base(['A.', '..', '.B'], { depot: { entry: 'N' } });
    // A → (1,0) down → (1,1) left → (0,1) up → back into A.
    const r = trace(l, [P(1, 0, 'curve', 'SW'), P(1, 1, 'curve', 'NW'), P(0, 1, 'curve', 'NE')]);
    expect(r).toMatchObject({ reason: 'loop', breakCell: { x: 0, y: 0 }, stopCell: { x: 0, y: 1 } });
  });

  it('running back into laid track reads as mismatch (checked before loop, as specified)', () => {
    const l = base(['A...', '....', '...B']);
    const r = trace(l, [P(1, 0, 'curve', 'SW'), P(1, 1, 'curve', 'NE'), P(2, 1, 'curve', 'NW'), P(2, 0, 'curve', 'SW')]);
    expect(r).toMatchObject({ reason: 'mismatch', breakCell: { x: 1, y: 0 }, stopCell: { x: 2, y: 0 } });
  });

  it('a start that points straight into the depot needs no piece', () => {
    expect(trace(base(['AB']), []).success).toBe(true);
  });
});

describe('v3 trace reasons', () => {
  // A one-way straight in the middle of the only row.
  const oneWay = (dir: 'E' | 'W') => base(['A..B'], { fixed: [{ at: [2, 0], piece: 'straight', openings: 'EW', oneWay: dir }] });

  it('wrongWay: entering against the arrow stops the train before that cell', () => {
    const r = trace(oneWay('W'), [P(1, 0, 'straight', 'EW')]);
    expect(r).toMatchObject({ success: false, reason: 'wrongWay', stopCell: { x: 1, y: 0 }, breakCell: { x: 2, y: 0 } });
    expect(r.path).toEqual([{ x: 1, y: 0 }]);
    expect(trace(oneWay('E'), [P(1, 0, 'straight', 'EW')]).success).toBe(true);
  });

  it('wrongWay on a one-way curve: only leaving by the arrow side is allowed', () => {
    const l = base(['A.', '.B'], { depot: { entry: 'N' }, fixed: [{ at: [1, 0], piece: 'curve', openings: 'SW', oneWay: 'W' }] });
    expect(trace(l, [])).toMatchObject({ reason: 'wrongWay', breakCell: { x: 1, y: 0 } });
    const ok = base(['A.', '.B'], { depot: { entry: 'N' }, fixed: [{ at: [1, 0], piece: 'curve', openings: 'SW', oneWay: 'S' }] });
    expect(trace(ok, []).success).toBe(true);
  });

  const ordered = (a: 1 | 2, b: 1 | 2) =>
    base(['AS.SB'], {
      stations: [
        { at: [1, 0], openings: 'EW', order: a },
        { at: [3, 0], openings: 'EW', order: b },
      ],
    });

  it('wrongOrder: reaching a station before a lower-numbered one stops the run there; both are reported', () => {
    const r = trace(ordered(2, 1), [P(2, 0, 'straight', 'EW')]);
    expect(r).toMatchObject({ success: false, reason: 'wrongOrder', breakCell: { x: 1, y: 0 }, stopCell: { x: 0, y: 0 }, missingStations: [{ x: 3, y: 0 }] });
    expect(trace(ordered(1, 2), [P(2, 0, 'straight', 'EW')]).success).toBe(true);
  });

  it('missedStation still applies to ordered levels', () => {
    const l = base(['A..B', '.S..'], { stations: [{ at: [1, 1], openings: 'EW', order: 1 }] });
    expect(trace(l, [P(1, 0, 'straight', 'EW'), P(2, 0, 'straight', 'EW')])).toMatchObject({ reason: 'missedStation' });
  });

  it('the solver and the hints respect arrows and order', () => {
    expect(solve(oneWay('W'), { cap: 5 })).toEqual([]);
    expect(solve(oneWay('E'), { cap: 5 })).toHaveLength(1);
    expect(solve(ordered(2, 1), { cap: 5 })).toEqual([]);
    expect(solve(ordered(1, 2), { cap: 5 })).toEqual([[P(2, 0, 'straight', 'EW')]]);
    // Round a rock: the top way has an arrow against the travel, so the hints go the bottom way.
    const round = base(['.....', 'A.R.B', '.....'], {
      tray: [{ piece: 'straight', count: 1 }, { piece: 'curve', count: 4 }],
      fixed: [{ at: [2, 0], piece: 'straight', openings: 'EW', oneWay: 'W' }],
    });
    const p = plan(round, []);
    expect(trace(round, p.completion).success).toBe(true);
    expect(p.completion.some((q) => q.at[0] === 2 && q.at[1] === 2)).toBe(true);
    expect(solve(round, { cap: 5 })).toHaveLength(1);
    expect(solve({ ...round, fixed: [{ ...round.fixed![0], oneWay: 'E' }] }, { cap: 5 })).toHaveLength(2);
    const h = nextHint(ordered(1, 2), []);
    expect(h).toEqual({ type: 'place', cell: { x: 2, y: 0 }, piece: 'straight', openings: 'EW' });
  });
});
