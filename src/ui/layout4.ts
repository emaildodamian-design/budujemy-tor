// v4 screen sizing. Pure, so "at 360 × 640: board tiles ≥ 48 px, program slots ≥ 44 px,
// palette tiles ≥ 56 px" is unit-tested for every level. editor.ts sets these sizes as CSS
// variables, and style.css uses the same paddings and gaps.

export const MIN_TILE4 = 48;
export const MIN_SLOT4 = 44;
export const MIN_PAL4 = 56;
export const MAX_TILE4 = 88;
export const PAD4 = 8;
/** Top bar: pause, wagons, lamp, run button. */
export const TOP4 = 60;
/** Gap between the sections (bar, board, program, palette). */
export const GAP4 = 6;
export const SLOT_GAP4 = 4;
export const PAL_GAP4 = 6;

export interface EditorShape {
  cols: number;
  rows: number;
  slots: number;
  fslots: number;
  /** Palette tiles: moves, Repeat, Call. */
  tiles: number;
}

export interface EditorLayout {
  tile: number;
  slot: number;
  pal: number;
  /** Boxes per program line. */
  perLine: number;
  mainLines: number;
  pLines: number;
  palLines: number;
  /** Total height used, in CSS px. */
  height: number;
  fits: boolean;
}

function lines(boxes: number, per: number): number {
  return boxes === 0 ? 0 : Math.ceil(boxes / per);
}

export function editorLayout(sh: EditorShape, vw: number, vh: number): EditorLayout {
  const width = vw - 2 * PAD4;
  let best: EditorLayout | null = null;
  // Bigger slots and palette tiles when there is room; never below the minimums.
  for (const [slot, pal] of [
    [52, 64],
    [48, 60],
    [MIN_SLOT4, MIN_PAL4],
  ]) {
    const perLine = Math.max(1, Math.floor((width + SLOT_GAP4) / (slot + SLOT_GAP4)));
    const perPal = Math.max(1, Math.floor((width + PAL_GAP4) / (pal + PAL_GAP4)));
    const mainLines = lines(sh.slots, perLine);
    // The P row starts with its marker box.
    const pLines = sh.fslots > 0 ? lines(sh.fslots + 1, perLine) : 0;
    const palLines = lines(sh.tiles, perPal);
    const fixed = 2 * PAD4 + TOP4 + 3 * GAP4 + (mainLines + pLines) * (slot + SLOT_GAP4) + palLines * (pal + PAL_GAP4);
    const tile = Math.floor(Math.min(width / sh.cols, (vh - fixed) / sh.rows, MAX_TILE4));
    const height = fixed + tile * sh.rows;
    const l: EditorLayout = { tile, slot, pal, perLine, mainLines, pLines, palLines, height, fits: height <= vh && tile >= MIN_TILE4 };
    if (l.fits) return l;
    best = l;
  }
  return best!;
}
