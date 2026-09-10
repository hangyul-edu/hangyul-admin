/**
 * Where a chart tooltip goes so it is always fully readable.
 *
 * The tooltip used to be an absolutely-positioned child of the chart's scroll
 * container, centred on the bar with `translateX(-50%)`. That fails twice over:
 * a bar near either end pushes half the tooltip past the edge, and the
 * container scrolls on X, which makes it a clipping context — so whatever hung
 * outside was cut off rather than merely overlapping.
 *
 * The fix is to position against the viewport instead of against the chart, so
 * this is pure geometry: given where the bar is on screen and how big the
 * tooltip turned out to be, return the point where the whole of it fits.
 *
 * All coordinates are viewport coordinates, the same frame `getBoundingClientRect`
 * reports in, so a caller can pass the result straight to `position: fixed`.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** True when the tooltip had to go below its anchor instead of above it. */
  below: boolean;
}

/** Clearance kept from every viewport edge, and between tooltip and anchor. */
const MARGIN = 8;

/**
 * Place `tooltip` near `anchor` without letting any of it leave the viewport.
 *
 * Horizontally it is centred on the anchor and then slid back inside — sliding
 * rather than flipping, because a tooltip that jumped sides mid-hover would be
 * harder to follow than one that stays put and shifts. Vertically it prefers to
 * sit above the anchor and flips below when there is no room, since covering
 * the bar being pointed at is worse than moving.
 *
 * A tooltip larger than the viewport is pinned to the top-left margin: partly
 * visible from its start beats being centred on nothing.
 */
export function placeTooltip(anchor: Rect, tooltip: Rect, viewport: Viewport): Placement {
  const left = clamp(
    anchor.left + anchor.width / 2 - tooltip.width / 2,
    MARGIN,
    viewport.width - tooltip.width - MARGIN,
  );

  const above = anchor.top - tooltip.height - MARGIN;
  const below = above < MARGIN;
  const top = clamp(
    below ? anchor.top + anchor.height + MARGIN : above,
    MARGIN,
    viewport.height - tooltip.height - MARGIN,
  );

  return { left, top, below };
}

/** Low bound wins when the range is empty — i.e. when the box does not fit. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
