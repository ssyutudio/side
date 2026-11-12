// Where the sidy window sits. Pure geometry so it can be tested without Electron.
// The window is one transparent strip on the right edge: sidy at its right side, room for one
// speech bubble on its left. Everything outside sidy and the bubble lets clicks through.
import { SIDY_HEIGHT_PT, SIDY_HIT_PT, type SidySize } from '@side/shared';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeLayout {
  /** Window bounds in screen points. */
  window: Rect;
  /** sidy's hit area in window coordinates (always touches the right edge). */
  hit: Rect;
  sidyHeight: number;
}

/** Width reserved for the speech bubble to the left of sidy. */
const BUBBLE_ROOM = 470;
/** Window height: tall enough for a bubble with one sentence, one action and a close. */
const WINDOW_HEIGHT = 300;
/** Where sidy's center sits until the user drags it: a fraction of the work area height. */
export const DEFAULT_ANCHOR = 0.62;

/**
 * anchor: sidy's center as a fraction of the work area height (0 = top, 1 = bottom). sidy stays
 * whole inside the work area; near the top or bottom the window stops at the edge and sidy moves
 * inside it instead.
 */
export function edgeLayout(workArea: Rect, size: SidySize, anchor = DEFAULT_ANCHOR): EdgeLayout {
  const sidyHeight = SIDY_HEIGHT_PT[size];
  const hitSide = Math.max(SIDY_HIT_PT, sidyHeight + 8);
  const width = BUBBLE_ROOM + hitSide;
  const height = Math.max(WINDOW_HEIGHT, hitSide);

  const a = Number.isFinite(anchor) ? Math.min(Math.max(anchor, 0), 1) : DEFAULT_ANCHOR;
  const half = Math.round(hitSide / 2);
  const centerY = Math.min(
    Math.max(workArea.y + Math.round(workArea.height * a), workArea.y + half),
    workArea.y + workArea.height - half,
  );
  let y = centerY - Math.round(height / 2);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height);

  const window: Rect = { x: workArea.x + workArea.width - width, y, width, height };
  const hit: Rect = { x: width - hitSide, y: centerY - y - half, width: hitSide, height: hitSide };
  return { window, hit, sidyHeight };
}

/** The anchor that puts sidy's center at screen point y (what a drag ends on). */
export function anchorAt(workArea: Rect, y: number): number {
  if (workArea.height <= 0 || !Number.isFinite(y)) return DEFAULT_ANCHOR;
  return Math.min(Math.max((y - workArea.y) / workArea.height, 0), 1);
}
