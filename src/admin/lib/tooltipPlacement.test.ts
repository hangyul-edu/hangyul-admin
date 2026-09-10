/**
 * A chart tooltip must be wholly on screen, wherever the bar is.
 *
 * jsdom does no layout, so a rendered tooltip would report a zero-sized box and
 * prove nothing. The geometry is therefore a pure function, and these feed it
 * the situations a real browser produces: a bar at the left edge, at the right
 * edge, at the top, on a phone-width viewport.
 */
import { describe, expect, it } from "vitest";
import { placeTooltip } from "./tooltipPlacement";

const VIEWPORT = { width: 1280, height: 800 };
/** A typical tooltip: one line of caption and a value. */
const TIP = { left: 0, top: 0, width: 220, height: 32 };
/** A bar's hit target: narrow, and as tall as the plot. */
const bar = (left: number, top = 300) => ({ left, top, width: 26, height: 180 });

/** Every edge of the placed box, for the containment assertions. */
function box(anchor: ReturnType<typeof bar>, tip = TIP, viewport = VIEWPORT) {
  const { left, top, below } = placeTooltip(anchor, tip, viewport);
  return { left, top, right: left + tip.width, bottom: top + tip.height, below };
}

describe("staying inside the viewport", () => {
  it("centres on the bar when there is room on both sides", () => {
    const placed = placeTooltip(bar(600), TIP, VIEWPORT);
    expect(placed.left).toBe(600 + 13 - 110);
  });

  it("slides back in rather than hanging off the left edge", () => {
    // Centring on a bar at x=4 would start the tooltip at -93.
    const placed = box(bar(4));
    expect(placed.left).toBeGreaterThanOrEqual(0);
    expect(placed.left).toBe(8);
  });

  it("slides back in rather than hanging off the right edge", () => {
    const placed = box(bar(1260));
    expect(placed.right).toBeLessThanOrEqual(VIEWPORT.width);
    expect(placed.left).toBe(1280 - 220 - 8);
  });

  it("keeps every edge inside, for a bar anywhere across the chart", () => {
    for (let x = -40; x <= 1320; x += 7) {
      const placed = box(bar(x));
      expect(placed.left, `x=${x}`).toBeGreaterThanOrEqual(0);
      expect(placed.right, `x=${x}`).toBeLessThanOrEqual(VIEWPORT.width);
      expect(placed.top, `x=${x}`).toBeGreaterThanOrEqual(0);
      expect(placed.bottom, `x=${x}`).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });
});

describe("above or below", () => {
  it("sits above the bar by default, clear of it", () => {
    const placed = placeTooltip(bar(600, 300), TIP, VIEWPORT);
    expect(placed.below).toBe(false);
    expect(placed.top).toBe(300 - 32 - 8);
  });

  it("flips below when the bar is too near the top of the screen", () => {
    // A chart scrolled to the top of the window: nothing fits above it.
    const placed = placeTooltip(bar(600, 12), TIP, VIEWPORT);
    expect(placed.below).toBe(true);
    expect(placed.top).toBe(12 + 180 + 8);
  });

  it("does not fall off the bottom when it flips near the foot of the screen", () => {
    const placed = box(bar(600, 4), TIP, { width: 1280, height: 220 });
    expect(placed.bottom).toBeLessThanOrEqual(220);
    expect(placed.top).toBeGreaterThanOrEqual(0);
  });
});

describe("small screens", () => {
  it("fits a phone-width viewport at either edge", () => {
    const phone = { width: 360, height: 640 };
    for (const x of [0, 4, 100, 200, 340, 359]) {
      const placed = box(bar(x), TIP, phone);
      expect(placed.left, `x=${x}`).toBeGreaterThanOrEqual(0);
      expect(placed.right, `x=${x}`).toBeLessThanOrEqual(phone.width);
    }
  });

  it("pins a tooltip wider than the screen to the left margin", () => {
    // Nothing can make it fit; showing it from its beginning is the readable
    // half. It must not be pushed negative, which would hide the start.
    const phone = { width: 320, height: 640 };
    const wide = { left: 0, top: 0, width: 400, height: 32 };
    const placed = placeTooltip(bar(160), wide, phone);
    expect(placed.left).toBe(8);
  });

  it("pins a tooltip taller than the screen to the top margin", () => {
    const placed = placeTooltip(bar(160, 10), { left: 0, top: 0, width: 100, height: 900 }, VIEWPORT);
    expect(placed.top).toBe(8);
  });
});
