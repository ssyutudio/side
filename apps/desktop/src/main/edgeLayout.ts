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
const WINDOW_HEIGHT = 240;
/** Vertical anchor of sidy's center, as a fraction of the work area height. */
const ANCHOR = 0.62;

export function edgeLayout(workArea: Rect, size: SidySize): EdgeLayout {
  const sidyHeight = SIDY_HEIGHT_PT[size];
  const hitSide = Math.max(SIDY_HIT_PT, sidyHeight + 8);
  const width = BUBBLE_ROOM + hitSide;
  const height = Math.max(WINDOW_HEIGHT, hitSide);

  const centerY = workArea.y + Math.round(workArea.height * ANCHOR);
  let y = centerY - Math.round(height / 2);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height);

  const window: Rect = { x: workArea.x + workArea.width - width, y, width, height };
  const hit: Rect = {
    x: width - hitSide,
    y: Math.round(height / 2 - hitSide / 2),
    width: hitSide,
    height: hitSide,
  };
  return { window, hit, sidyHeight };
}
