import { describe, expect, it } from 'vitest';
import type { Level } from '../src/game/level';
import { trace } from '../src/game/trace';
import { P } from './helpers';

const base = (grid: string[], extra: Partial<Level> = {}): Level => ({
  id: 'L99',
  chapter: 1,
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
