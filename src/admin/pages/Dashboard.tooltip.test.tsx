/**
 * The chart tooltip: where it lives in the DOM, and where it ends up on screen.
 *
 * `lib/tooltipPlacement.test.ts` proves the geometry. What has to be proved
 * here is the part geometry cannot fix on its own: the tooltip must not be a
 * descendant of the chart, because the chart scrolls on X and therefore clips
 * its children. Positioning alone could not rescue it from that.
 *
 * jsdom does no layout, so the boxes are mocked — the anchor rect a bar would
 * report and the size the tooltip would take — and the assertions are about
 * what the component does with them.
 */
// @ts-expect-error - @types/node is not a dependency; the runner is Node.
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeseriesChart } from "./Dashboard";


const VIEWPORT = { width: 1280, height: 800 };
const TIP = { width: 220, height: 32 };

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/admin/styles/admin.css", "utf8");
  document.head.appendChild(style);
  Object.defineProperty(document.documentElement, "clientWidth", { value: VIEWPORT.width });
  Object.defineProperty(document.documentElement, "clientHeight", { value: VIEWPORT.height });
});

/**
 * Every bar reports `barLeft`; the tooltip reports its own size. Nothing else
 * in the tree is measured, so one hook covers both.
 */
function mockLayout(barLeft: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const tooltip = this.classList?.contains("hgadm-chart-tip");
    const box = tooltip
      ? { left: 0, top: 0, width: TIP.width, height: TIP.height }
      : { left: barLeft, top: 300, width: 26, height: 180 };
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box } as DOMRect;
  });
}

afterEach(() => vi.restoreAllMocks());

const POINTS = [
  { date: "2026-09-08", value: 3 },
  { date: "2026-09-09", value: 5 },
  { date: "2026-09-10", value: 2 },
];

async function hoverBar(index: number) {
  const targets = document.querySelectorAll("rect[fill='transparent']");
  await userEvent.hover(targets[index] as Element);
}

function tooltip(): HTMLElement {
  return screen.getByRole("tooltip");
}

describe("where the tooltip lives", () => {
  it("is a child of the body, not of the scrolling chart", async () => {
    // The chart container is `overflow-x: auto`, which makes it a clipping
    // context; anything inside it is cut off at the card's edge.
    mockLayout(600);
    const { container } = render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(tooltip().parentElement).toBe(document.body);
    expect(container.contains(tooltip())).toBe(false);
  });

  it("is positioned against the viewport", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(getComputedStyle(tooltip()).position).toBe("fixed");
  });

  it("cannot swallow the hover that produced it", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(getComputedStyle(tooltip()).pointerEvents).toBe("none");
  });

  it("disappears when the pointer leaves the chart", async () => {
    mockLayout(600);
    const { container } = render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);
    expect(screen.queryByRole("tooltip")).toBeInTheDocument();

    await userEvent.unhover(container.querySelector("svg")!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("where the tooltip ends up", () => {
  const leftOf = (el: HTMLElement) => Number.parseFloat(el.style.left);
  const topOf = (el: HTMLElement) => Number.parseFloat(el.style.top);

  it("centres on a bar with room on both sides", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(leftOf(tooltip())).toBe(600 + 13 - 110);
  });

  it("stays on screen for the first bar, which sits at the left edge", async () => {
    mockLayout(2);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(0);

    expect(leftOf(tooltip())).toBeGreaterThanOrEqual(0);
  });

  it("stays on screen for the last bar, which sits at the right edge", async () => {
    // The case that used to hang half the tooltip off the side of the page.
    mockLayout(VIEWPORT.width - 30);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(2);

    expect(leftOf(tooltip()) + TIP.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("sits above the bar, clear of it", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(topOf(tooltip())).toBe(300 - TIP.height - 8);
  });

  it("is hidden until it has been measured, never shown misplaced", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    // Measured by now, so visible — the initial hidden frame is what keeps it
    // from being painted at 0,0 first.
    expect(tooltip().style.visibility).toBe("visible");
  });
});

describe("what the tooltip says", () => {
  it("names the day, its weekday, and the value", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(1);

    expect(tooltip()).toHaveTextContent("2026-09-09 (수)");
    expect(tooltip()).toHaveTextContent("5");
  });

  it("keeps the year the axis label drops", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={POINTS} money={null} />);
    await hoverBar(0);

    expect(tooltip().textContent).toContain("2026-09-08");
  });

  it("spells a money value out in full", async () => {
    mockLayout(600);
    render(<TimeseriesChart points={[{ date: "2026-09-10", value: 1299 }]} money="USD" />);
    await hoverBar(0);

    expect(tooltip()).toHaveTextContent("$12.99");
  });
});
