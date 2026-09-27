// Helpers for driving the v4 puzzle screen in happy-dom, through the same clicks a player makes.
import { cycleCount, grow, initialProgram, place, tokenAt } from '../src/game/edit';
import { type ProgLevel, type Program, type Tok } from '../src/game/program';

export const slotEl = (root: ParentNode, row: 'main' | 'p', i: number) => root.querySelector(`.slot[data-row="${row}"][data-i="${i}"]`) as HTMLElement;
export const tileEl = (root: ParentNode, name: string) => root.querySelector(`.pal-tile[data-tile="${name}"]`) as HTMLElement;
export const runBtn = (root: ParentNode) => root.querySelector('.run4') as HTMLButtonElement;
export const programOf = (root: ParentNode) => (root.querySelector('.prog-strip') as HTMLElement).dataset.program;
export const click = (el: Element | null) => {
  if (!el) throw new Error('nothing to click');
  (el as HTMLElement).click();
};

/**
 * Type `target` into an empty program with palette taps (in reading order), growing Repeat
 * bodies with their + mark and setting counts by tapping the count digit. A mirror of the
 * pure model says which slot is where. `beforeLast` runs just before the last tap.
 */
export function enterProgram(root: ParentNode, level: ProgLevel, target: Program, beforeLast?: () => void): void {
  let mirror = initialProgram(level);
  const total = count(target.main) + count(target.p);
  let taps = 0;
  for (const row of ['main', 'p'] as const) {
    let i = 0;
    const fill = (tokens: Tok[], parent: number | null) => {
      tokens.forEach((tok, k) => {
        if (parent !== null) {
          const head = tokenAt(mirror, { row, i: parent });
          if (head?.t === 'repeat' && head.body.length < k + 1) {
            click(slotEl(root, row, parent));
            click(slotEl(root, row, parent).querySelector('.slot-mark.grow'));
            mirror = grow(mirror, { row, i: parent })!;
          }
        }
        const ref = { row, i };
        if (++taps === total) beforeLast?.();
        const name = tok.t === 'move' ? tok.m : tok.t;
        click(tileEl(root, name));
        const next = place(level, mirror, ref, tok.t === 'move' ? { t: 'move', m: tok.m } : tok.t === 'repeat' ? { t: 'repeat' } : { t: 'call' });
        if (!next) throw new Error(`cannot place ${name} at ${row}:${i}`);
        mirror = next;
        i++;
        if (tok.t === 'repeat') {
          for (let n = 2; n < tok.n; n++) {
            click(slotEl(root, row, ref.i).querySelector('.rep-count'));
            mirror = cycleCount(mirror, ref)!;
          }
          fill(tok.body, ref.i);
        }
      });
    };
    fill(row === 'main' ? target.main : target.p, null);
  }
}

function count(row: readonly Tok[]): number {
  return row.reduce((n, t) => n + 1 + (t.t === 'repeat' ? count(t.body) : 0), 0);
}
