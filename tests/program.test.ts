// The v4 program model: slot costs, fill-to-run, semantics and every stop reason.
import { describe, expect, it } from 'vitest';
import { LEVELS_V4 } from '../src/game/levels4';
import { grammarOf, tokensOf } from '../src/game/progMetrics';
import {
  type ProgLevel,
  type Program,
  type Tok,
  CALL,
  HOLE,
  Machine,
  NEW_REASONS,
  canRun,
  compile,
  cost,
  formatProgram,
  movesOf,
  mv,
  parseProgram,
  rep,
  rowCost,
  runProgram,
} from '../src/game/program';
import { frozen, seeded } from './helpers';

function lvl(grid: string[], exit: 'N' | 'E' | 'S' | 'W', entry: 'N' | 'E' | 'S' | 'W', o: Partial<ProgLevel> = {}): ProgLevel {
  return { id: 'P99', chapter: 1, kind: 'practice', grid, start: { exit }, depot: { entry }, commands: 'absolute', repeat: true, nesting: false, slots: 3, fslots: 0, solution: '', ...o };
}
const P = (src: string) => parseProgram(src);
const run = (l: ProgLevel, src: string) => runProgram(l, frozen(P(src)));
const ROW = ['.....', 'A...B', '.....'];
const L1 = lvl(ROW, 'E', 'W');

describe('slot costs and fill-to-run', () => {
  it('Move = 1, Call = 1, Repeat = 1 + its body', () => {
    expect(cost(mv('N'))).toBe(1);
    expect(cost(CALL)).toBe(1);
    expect(cost(rep(3, [mv('N'), mv('E')]))).toBe(3);
    expect(cost(rep(2, [rep(3, [mv('F')]), mv('L')]))).toBe(4);
    expect(rowCost(P('N 4[E N] P').main)).toBe(5);
  });

  it('Run needs the main row to cost exactly slots, the P row exactly fslots, and no empty slot or body', () => {
    const l = lvl(ROW, 'E', 'W', { slots: 3 });
    expect(canRun(l, P('E E E'))).toBe(true);
    expect(canRun(l, P('E E'))).toBe(false);
    expect(canRun(l, P('E E E E'))).toBe(false);
    expect(canRun(l, P('E E _'))).toBe(false);
    expect(canRun(l, { main: [mv('E'), rep(2, []), mv('E')], p: [] })).toBe(false);
    expect(canRun(l, P('E 2[_]'))).toBe(false);
    const f = lvl(ROW, 'E', 'W', { slots: 2, fslots: 2 });
    expect(canRun(f, P('P P ; E E'))).toBe(true);
    expect(canRun(f, P('P P ; E'))).toBe(false);
    expect(canRun(f, P('P P ; E _'))).toBe(false);
  });

  it('notation round-trips (every shipped program)', () => {
    for (const l of LEVELS_V4) {
      expect(formatProgram(P(l.solution))).toBe(l.solution);
      if (l.given) expect(formatProgram(P(l.given))).toBe(l.given);
    }
    expect(() => P('E 4[N')).toThrow();
    expect(() => P('E X')).toThrow();
    expect(formatProgram({ main: [HOLE, rep(2, [HOLE])], p: [] })).toBe('_ 2[_]');
  });
});

describe('semantics', () => {
  it('each Move lays one piece in front of the engine and moves onto it (absolute)', () => {
    const r = run(L1, 'E E E');
    expect(r.success).toBe(true);
    expect(r.pieces.map((p) => `${p.at}:${p.piece}:${p.openings}`)).toEqual(['1,1:straight:EW', '2,1:straight:EW', '3,1:straight:EW']);
    expect(r.pieceCmd.map((c) => c.map((x) => `${x.row}${x.i}`).join())).toEqual(['main0', 'main1', 'main2']);
  });

  it('absolute and relative commands: N E N and L R L lay the same staircase', () => {
    const g = ['..B', '...', 'A..'];
    const abs = run(lvl(g, 'E', 'S'), 'N E N');
    const relL = lvl(g, 'E', 'S', { commands: 'relative' });
    const rel = run(relL, 'L R L');
    expect(abs.success && rel.success).toBe(true);
    expect(rel.pieces).toEqual(abs.pieces);
    expect(run(relL, 'F F L').reason).not.toBeNull();
    // The anchors P06 (absolute) and P21 (relative) ride the same route.
    const p06 = LEVELS_V4.find((l) => l.id === 'P06')!;
    const p21 = LEVELS_V4.find((l) => l.id === 'P21')!;
    expect(runProgram(p21, P(p21.solution)).path).toEqual(runProgram(p06, P(p06.solution)).path);
  });

  it('Repeat runs its body count times; the running command is the body slot', () => {
    const l = lvl(['......', 'A....B', '......'], 'E', 'W', { slots: 3 });
    const r = run(l, '2[E E]');
    expect(r.success).toBe(true);
    expect(r.stepCmds.map((c) => c.map((x) => x.i).join())).toEqual(['1', '2', '1', '2']);
  });

  it('a nested Repeat', () => {
    const l = lvl(['......', 'A....B', '......'], 'E', 'W', { slots: 3, nesting: true });
    expect(run(l, '2[2[E]]').success).toBe(true);
    expect(run(l, '2[2[E]]').pieces).toHaveLength(4);
  });

  it('Call runs the P row; the Call and the P slot glow together', () => {
    const l = lvl(['......', 'A....B', '......'], 'E', 'W', { slots: 2, fslots: 2 });
    const r = run(l, 'P P ; E E');
    expect(r.success).toBe(true);
    expect(r.stepCmds.map((c) => c.map((x) => `${x.row}${x.i}`).join('+'))).toEqual(['main0+p0', 'main0+p1', 'main1+p0', 'main1+p1']);
  });

  it('river and mountain: a straight becomes a bridge / tunnel by itself', () => {
    const r = run(lvl(['.....', 'A.~^B', '.....'], 'E', 'W'), 'E E E');
    expect(r.success).toBe(true);
    expect(r.pieces.map((p) => p.piece)).toEqual(['straight', 'bridge', 'tunnel']);
  });

  it('fixed track and stations are ridden through without using a command', () => {
    const l = lvl(['.....', 'A.S.B', '.....'], 'E', 'W', { slots: 2, stations: [{ at: [2, 1], openings: 'EW' }] });
    const r = run(l, 'E E');
    expect(r.success).toBe(true);
    expect(r.path.map((c) => `${c.x},${c.y}`)).toEqual(['1,1', '2,1', '3,1']);
    expect(r.pieces).toHaveLength(2);
  });

  it('the program is never changed by a run', () => {
    for (const l of LEVELS_V4) {
      const prog = frozen(P(l.given ?? l.solution));
      const before = JSON.stringify(prog);
      runProgram(l, prog);
      expect(JSON.stringify(prog)).toBe(before);
    }
  });
});

describe('new stop reasons (each highlights its cell and its command)', () => {
  it('reverse: an arrow straight back', () => {
    const r = run(L1, 'W E E');
    expect([r.reason, r.breakCell, r.cmd]).toEqual(['reverse', { x: 1, y: 1 }, [{ row: 'main', i: 0 }]]);
  });
  it('blocked: rock, house, tree or lake in front', () => {
    for (const ch of 'RHTL') {
      const r = run(lvl(['.....', `A.${ch}.B`, '.....'], 'E', 'W'), 'E E E');
      expect([r.reason, r.breakCell, r.cmd], ch).toEqual(['blocked', { x: 2, y: 1 }, [{ row: 'main', i: 1 }]]);
    }
  });
  it('early: the depot is in front while commands remain', () => {
    const r = run(lvl(ROW, 'E', 'W', { slots: 4 }), 'E E E E');
    expect([r.reason, r.breakCell, r.cmd]).toEqual(['early', { x: 4, y: 1 }, [{ row: 'main', i: 3 }]]);
  });
  it('programEnd: the last command leaves the engine in front of an empty cell', () => {
    const r = run(L1, 'E E N');
    expect([r.reason, r.breakCell, r.cmd]).toEqual(['programEnd', { x: 3, y: 0 }, [{ row: 'main', i: 2 }]]);
    expect(r.trace.reason).toBe('gap');
  });
  it('the new reasons are exactly these four', () => {
    expect(NEW_REASONS).toEqual(['reverse', 'blocked', 'early', 'programEnd']);
  });
});

describe('v3 stop reasons, reached through programs (from v3 trace)', () => {
  it('depotSide', () => {
    const r = run(lvl(ROW, 'E', 'N'), 'E E E');
    expect([r.reason, r.trace.reason, r.cmd]).toEqual(['depotSide', 'depotSide', [{ row: 'main', i: 2 }]]);
  });
  it('loop', () => {
    const r = run(lvl(ROW, 'E', 'W', { slots: 5 }), 'N E S W W');
    expect([r.reason, r.breakCell, r.cmd]).toEqual(['loop', { x: 1, y: 1 }, [{ row: 'main', i: 4 }]]);
  });
  it('edge', () => {
    const r = run(L1, 'N N N');
    expect([r.reason, r.trace.reason, r.cmd]).toEqual(['edge', 'edge', [{ row: 'main', i: 2 }]]);
  });
  it('missedStation', () => {
    const l = lvl(['..S..', 'A...B', '.....'], 'E', 'W', { stations: [{ at: [2, 0], openings: 'EW' }] });
    const r = run(l, 'E E E');
    expect([r.reason, r.trace.reason, r.missingStations]).toEqual(['missedStation', 'missedStation', [{ x: 2, y: 0 }]]);
  });
  it('wrongOrder', () => {
    const l = lvl(['.......', 'A.S.S.B', '.......'], 'E', 'W', {
      stations: [
        { at: [2, 1], openings: 'EW', order: 2 },
        { at: [4, 1], openings: 'EW', order: 1 },
      ],
    });
    const r = run(l, 'E E E');
    expect([r.reason, r.trace.reason, r.breakCell, r.cmd]).toEqual(['wrongOrder', 'wrongOrder', { x: 2, y: 1 }, [{ row: 'main', i: 0 }]]);
  });
  it('wrongWay', () => {
    const l = lvl(ROW, 'E', 'W', { slots: 2, fixed: [{ at: [2, 1], piece: 'straight', openings: 'EW', oneWay: 'W' }] });
    const r = run(l, 'E E');
    expect([r.reason, r.trace.reason, r.breakCell, r.cmd]).toEqual(['wrongWay', 'wrongWay', { x: 2, y: 1 }, [{ row: 'main', i: 0 }]]);
  });
  it('mismatch', () => {
    const l = lvl(ROW, 'E', 'W', { slots: 2, fixed: [{ at: [2, 1], piece: 'straight', openings: 'NS' }] });
    expect(run(l, 'E E').reason).toBe('mismatch');
  });
  it('needsBridge and needsTunnel: a curve on the river / mountain', () => {
    const b = run(lvl(['.....', 'A.~.B', '.....'], 'E', 'W'), 'E N E');
    expect([b.reason, b.trace.reason, b.breakCell, b.cmd]).toEqual(['needsBridge', 'needsBridge', { x: 2, y: 1 }, [{ row: 'main', i: 1 }]]);
    expect(run(lvl(['.....', 'A.^.B', '.....'], 'E', 'W'), 'E S E').reason).toBe('needsTunnel');
  });
});

describe('the compiler and the v3 ride agree', () => {
  it('random programs on every shipped level: same stop, trace path = compiled route prefix', () => {
    const rnd = seeded(4);
    for (const l of LEVELS_V4) {
      const fam = movesOf(l.commands);
      const row = (which: 'main' | 'p', s: number): Tok[] => {
        const g = grammarOf(l, which);
        const out: Tok[] = [];
        let left = s;
        while (left > 0) {
          const costs = [1, 2, 3, 4].filter((c) => c <= left && tokensOf(g, fam, c).length > 0);
          const c = costs[Math.floor(rnd() * costs.length)];
          const ts = tokensOf(g, fam, c);
          out.push(ts[Math.floor(rnd() * ts.length)]);
          left -= c;
        }
        return out;
      };
      for (let k = 0; k < 40; k++) {
        const prog: Program = { main: row('main', l.slots), p: l.fslots ? row('p', l.fslots) : [] };
        const r = runProgram(l, prog);
        const m = new Machine(l);
        m.p = prog.p;
        m.reset();
        const ok = m.stop === null && m.run(prog.main) && m.finish();
        expect(r.success, `${l.id} ${formatProgram(prog)}`).toBe(ok);
        if (!ok) expect(r.reason, `${l.id} ${formatProgram(prog)}`).toBe(m.stop!.reason);
        const c = compile(l, prog);
        expect(c.route.slice(0, r.path.length)).toEqual(r.path);
        // v3 trace names the same reason, except where the route runs into a piece the program
        // itself laid (the compiler says loop; trace may see a piece that does not open that way).
        if (r.reason && !NEW_REASONS.includes(r.reason as never) && r.reason !== 'loop' && r.trace.reason !== 'gap') expect(r.trace.reason).toBe(r.reason);
      }
    }
  });
});
