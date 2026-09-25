import { describe, expect, it } from 'vitest';
import { type Hint, ghostPath, nextHint } from '../src/game/hints';
import { type Level, type Placed, initialPieces, isRepair } from '../src/game/level';
import { LEVELS } from '../src/game/levels';
import { drop, pieceOn, takeBack } from '../src/game/placement';
import { handFor, solve } from '../src/game/solver';
import { trace } from '../src/game/trace';
import { frozen, scatter, seeded } from './helpers';

/** Do what the hint says, the way a child with a helper would: one hint = one step. */
function apply(level: Level, pieces: Placed[], h: Hint): Placed[] {
  if (h.type === 'place') {
    expect(pieceOn(pieces, h.cell)).toBeUndefined(); // 'place' always points at an empty cell
    const r = drop(level, pieces, h.cell, h.piece, h.openings);
    expect(r.ok).toBe(true);
    return r.pieces;
  }
  if (h.type === 'change') {
    expect(pieceOn(pieces, h.cell)).toBeDefined(); // 'change' always points at a movable piece
    const rest = takeBack(pieces, h.cell);
    const r = drop(level, rest, h.cell, h.piece, h.openings);
    return r.ok ? r.pieces : rest;
  }
  if (h.type === 'blocked') {
    expect(h.cells.length).toBeGreaterThan(0);
    return h.cells.reduce((ps, c) => takeBack(ps, c), pieces);
  }
  return pieces;
}

function stepsToSolve(level: Level, start: Placed[], limit: number): number {
  let pieces = start;
  for (let n = 0; n <= limit; n++) {
    if (trace(level, pieces).success) return n;
    pieces = apply(level, pieces, nextHint(level, pieces));
  }
  return Infinity;
}

/** A random partial board: some pieces of a real solution, plus 0–2 wrong pieces. */
function randomBoard(level: Level, rnd: () => number): { pieces: Placed[]; wrong: number } {
  const sols = solve(level, { cap: 20 });
  const sol = sols[Math.floor(rnd() * sols.length)];
  const part = sol.filter(() => rnd() < 0.5);
  const wrong = Math.floor(rnd() * 3);
  const pieces = scatter(level, part, wrong, rnd);
  return { pieces, wrong: pieces.length - part.length };
}

describe('6. hint completeness', () => {
  for (const level of LEVELS) {
    it(`${level.id}: from an empty board within solution.length + 2 steps`, () => {
      expect(stepsToSolve(level, [], level.solution.length + 2)).toBeLessThanOrEqual(level.solution.length + 2);
    });
  }

  for (const level of LEVELS.filter(isRepair)) {
    it(`${level.id}: from the pre-laid repair state`, () => {
      expect(stepsToSolve(level, initialPieces(level), level.solution.length + 2)).toBeLessThanOrEqual(level.solution.length + 2);
    });
  }

  it('from 200 random partial boards per level (seeded)', () => {
    const misses: string[] = [];
    for (const level of LEVELS) {
      const rnd = seeded(level.id.charCodeAt(1) * 1000 + Number(level.id.slice(1)));
      for (let i = 0; i < 200; i++) {
        const { pieces, wrong } = randomBoard(level, rnd);
        // Each wrong piece may cost one extra step (pointed at, then changed or taken back).
        const limit = level.solution.length + 2 + wrong;
        const n = stepsToSolve(level, pieces, limit);
        if (n > limit) misses.push(`${level.id}#${i} ${JSON.stringify(pieces)}`);
      }
    }
    expect(misses).toEqual([]);
  });
});

describe('7. hint safety', () => {
  it('nextHint and ghostPath never remove, move or rotate existing pieces (property test)', () => {
    for (const level of LEVELS) {
      const rnd = seeded(7_000 + Number(level.id.slice(1)));
      for (let i = 0; i < 60; i++) {
        const { pieces } = randomBoard(level, rnd);
        const before = JSON.stringify(pieces);
        const input = frozen(structuredClone(pieces));
        const h = nextHint(level, input); // throws if it tries to mutate
        const ghosts = ghostPath(level, input);
        expect(JSON.stringify(input)).toBe(before);
        if (h.type === 'place') expect(pieceOn(pieces, h.cell)).toBeUndefined();
        if (h.type === 'change') expect(pieceOn(pieces, h.cell)).toBeDefined();
        if (h.type === 'blocked') for (const c of h.cells) expect(pieceOn(pieces, c)).toBeDefined();
        // Ghosts only describe pieces: none of them is identical to a piece already there.
        for (const g of ghosts) {
          const there = pieceOn(pieces, { x: g.at[0], y: g.at[1] });
          if (there) expect(there.piece !== g.piece || there.openings !== g.openings).toBe(true);
        }
      }
    }
  });

  it('the ghost path leaves the final piece for the child', () => {
    for (const level of LEVELS) {
      const g = ghostPath(level, []);
      expect(g.length).toBe(Math.max(0, solve(level, { shortest: true })[0].length - 1));
      if (g.length > 0) expect(handFor(level, g)).toBeDefined();
    }
  });

  it('no hint once the track works', () => {
    for (const level of LEVELS) expect(nextHint(level, level.solution)).toEqual({ type: 'none' });
  });
});
