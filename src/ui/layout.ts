// Board sizing. Pure, so the "tiles ≥ 64 px on a 360 × 640 phone" rule is unit-tested.
// The CSS gives the top bar and the bottom bar exactly these heights.

export const MIN_TILE = 64;
export const MAX_TILE = 104;
export const TOP_BAR_PX = 76;
export const BOTTOM_BAR_PX = 84;
/** Gaps between the bars and the board, plus the screen's top and bottom padding. */
export const V_GAPS_PX = 36;
export const SIDE_PAD_PX = 8;

/** Tile size in CSS px for a board of cols × rows in a viewport of vw × vh CSS px. */
export function tileSize(cols: number, rows: number, vw: number, vh: number): number {
  const byWidth = (vw - 2 * SIDE_PAD_PX) / cols;
  const byHeight = (vh - TOP_BAR_PX - BOTTOM_BAR_PX - V_GAPS_PX) / rows;
  return Math.floor(Math.min(byWidth, byHeight, MAX_TILE));
}

/** Width the bottom bar needs: tray items (64 px each) plus the go button. */
export function bottomBarWidth(kinds: number): number {
  const ITEM = 64;
  const GAP = 4;
  return kinds * ITEM + ITEM + kinds * GAP;
}
