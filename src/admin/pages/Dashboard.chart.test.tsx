/**
 * The rendered Y-axis, at the data sizes that used to break it.
 *
 * `lib/chartScale.test.ts` proves the scale maths; these prove the chart asks
 * for it and prints what it gets back. The two halves are both needed — the
 * axis could be computed perfectly and still be labelled by the old rounding,
 * which is exactly the bug that was reported.
 *
 * Every case reads the axis the way an admin does: as the list of labels down
 * the left edge.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TimeseriesChart } from "./Dashboard";

/** The tick labels, in DOM order — ascending, so bottom to top on screen. */
function axisLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("text[text-anchor='end']")).map(
    (t) => t.textContent ?? "",
  );
}

/** A 30-day series with the given values. */
function series(values: number[]) {
  return values.map((value, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    value,
  }));
}

function renderChart(values: number[], money: string | null = null) {
  return render(<TimeseriesChart points={series(values)} money={money} />).container;
}

describe("count charts", () => {
  it("does not repeat a label when every value is zero", () => {
    // Reported as `0 0 0 0`. The axis has to mean something even with no data.
    expect(axisLabels(renderChart([0, 0, 0, 0, 0]))).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("does not repeat a label when the peak is 1", () => {
    // Reported as `0 1 1 1` — quarters of 1 rounded to 0, 1, 1, 1.
    expect(axisLabels(renderChart([0, 1, 0, 1]))).toEqual(["0", "1"]);
  });

  it("counts a small range one at a time", () => {
    expect(axisLabels(renderChart([0, 1, 2]))).toEqual(["0", "1", "2"]);
    expect(axisLabels(renderChart([3, 1, 2]))).toEqual(["0", "1", "2", "3"]);
  });

  it("keeps a normal range on round numbers", () => {
    // 50 rather than 60: both are round, and the tighter top leaves the
    // tallest bar nearly touching the ceiling instead of short of it.
    expect(axisLabels(renderChart([12, 30, 47]))).toEqual(["0", "25", "50"]);
  });

  it("groups thousands on a large range", () => {
    expect(axisLabels(renderChart([1200, 8400, 12_500]))).toEqual([
      "0",
      "5,000",
      "10,000",
      "15,000",
    ]);
  });

  it("handles a single data point", () => {
    const container = renderChart([7]);
    expect(axisLabels(container)).toEqual(["0", "2", "4", "6", "8"]);
    expect(container.querySelectorAll("path[fill]")).toHaveLength(1);
  });

  it("never prints the same label twice, whatever the peak", () => {
    // The invariant, swept rather than sampled: the old axis failed this for
    // every peak below about 8.
    for (let peak = 0; peak <= 300; peak++) {
      const labels = axisLabels(renderChart([0, peak]));
      expect(new Set(labels).size, `peak ${peak} → ${labels.join(",")}`).toBe(labels.length);
    }
  });

  it("never offers a fraction of something countable", () => {
    for (let peak = 0; peak <= 300; peak++) {
      for (const label of axisLabels(renderChart([peak]))) {
        expect(label, `peak ${peak}`).not.toContain(".");
      }
    }
  });
});

describe("revenue charts", () => {
  it("labels ticks as money, not as bare numbers", () => {
    // 1299¢..5000¢ — the axis is in dollars because that is what it says.
    expect(axisLabels(renderChart([1299, 2500, 5000], "USD"))).toEqual([
      "$0",
      "$25",
      "$50",
    ]);
  });

  it("drops to cents rather than rounding a small month into duplicates", () => {
    // A $0.75 peak: whole-dollar ticks would have been `$0 $1 $1 $1`.
    expect(axisLabels(renderChart([25, 50, 75], "USD"))).toEqual([
      "$0.00",
      "$0.25",
      "$0.50",
      "$0.75",
    ]);
  });

  it("shows an empty revenue month as dollars, not as a collapsed axis", () => {
    expect(axisLabels(renderChart([0, 0, 0], "USD"))).toEqual(["$0", "$1", "$2", "$3", "$4"]);
  });

  it("groups a large revenue axis and keeps the symbol", () => {
    expect(axisLabels(renderChart([1_234_500, 4_321_000], "USD"))).toEqual([
      "$0",
      "$25,000",
      "$50,000",
    ]);
  });

  it("gives a wider gutter to a wider label, so nothing is clipped", () => {
    // The axis used to sit in a fixed 46px well; "$50,000" does not fit in it.
    const small = renderChart([0, 5], "USD").querySelector("text[text-anchor='end']")!;
    const large = renderChart([1_234_500, 4_321_000], "USD").querySelector(
      "text[text-anchor='end']",
    )!;
    expect(Number(large.getAttribute("x"))).toBeGreaterThan(Number(small.getAttribute("x")));
  });

  it("never prints the same money label twice, at any scale", () => {
    for (const cents of [0, 1, 5, 25, 99, 100, 250, 1299, 15_588, 100_000, 4_321_000]) {
      const labels = axisLabels(renderChart([0, cents], "USD"));
      expect(new Set(labels).size, `${cents}¢ → ${labels.join(",")}`).toBe(labels.length);
    }
  });
});

describe("the bars themselves", () => {
  it("draws nothing above the axis top", () => {
    const container = renderChart([3, 7, 5]);
    const bars = Array.from(container.querySelectorAll("path[fill]"));
    // Every bar starts at or below the plot's top edge (y = 16).
    for (const bar of bars) {
      const top = Number(/M [\d.]+ ([\d.]+)/.exec(bar.getAttribute("d") ?? "")?.[1] ?? 0);
      expect(top).toBeGreaterThan(0);
    }
    expect(bars).toHaveLength(3);
  });

  it("draws no bar for a zero value, so an empty day reads as empty", () => {
    expect(renderChart([0, 0, 0]).querySelectorAll("path[fill]")).toHaveLength(0);
  });

  it("does not produce NaN geometry when there is nothing to plot", () => {
    // A zero-height domain used to divide by zero here.
    const container = renderChart([0, 0]);
    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("the date axis", () => {
  /** The x-axis labels, left to right. */
  function dayLabels(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("text[text-anchor='middle']")).map(
      (t) => t.textContent ?? "",
    );
  }

  it("names the weekday alongside the date", () => {
    // A bare 09/10 says nothing about the shape of the week, and traffic here
    // is weekly — a dip that is every Sunday is a different story from a dip.
    // Only the first and last of three are labelled; both carry the weekday.
    const container = renderChart([1, 2, 3]);
    expect(dayLabels(container)).toEqual(["09/01 (화)", "09/03 (목)"]);
  });

  it("reads the date at Seoul, not at the viewer's midnight", () => {
    // 2026-09-06 is a Sunday in KST. A browser west of UTC parsing the bare
    // date as local midnight would name Saturday.
    expect(dayLabels(renderChart([1, 1, 1, 1, 1, 1])).slice(-1)).toEqual(["09/06 (일)"]);
  });

  it("keeps every labelled day on the same weekday across a 30-day window", () => {
    // The labels fall every 7th day, so they should all agree — which is what
    // makes the weekday worth showing at all.
    const labelled = dayLabels(renderChart(new Array(30).fill(1))).filter(Boolean);
    const weekdays = labelled.slice(0, -1).map((l) => l.slice(-2, -1));
    expect(new Set(weekdays).size).toBe(1);
  });
});
