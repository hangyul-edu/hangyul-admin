/**
 * A timestamp breaks in exactly two places, and nowhere else.
 *
 * The break between the date and the time is deliberate — it is two elements,
 * so it survives any column width. Inside either line a break is a bug: "2026.
 * 09." over "10." reads as a different date, and a time split at a colon is
 * unreadable. The two lines are therefore `nowrap`, which is safe here because
 * every timestamp is the same shape, so a column of them settles at one width
 * on its own rather than fighting the neighbouring cells.
 *
 * jsdom does no layout but does resolve these properties, so this asserts the
 * computed values a browser would use — the same basis as ipWrapping.test.ts.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

/** Exactly what <Timestamp> renders. */
const MARKUP = `
  <time id="stamp" class="hgadm-timestamp" datetime="2026-09-10T04:05:42Z">
    <span id="date" class="hgadm-timestamp__date">2026. 09. 10.</span>
    <span id="time" class="hgadm-timestamp__time">오후 01:05:42</span>
  </time>`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.innerHTML = MARKUP;
});

const styleOf = (id: string) => getComputedStyle(document.getElementById(id)!);

describe("the two lines", () => {
  it("stack, rather than running together as one wrapping string", () => {
    expect(styleOf("stamp").flexDirection).toBe("column");
  });

  it("never wrap within themselves", () => {
    expect(styleOf("date").whiteSpace).toBe("nowrap");
    expect(styleOf("time").whiteSpace).toBe("nowrap");
  });

  it("keeps the digits in vertical register down a column of rows", () => {
    expect(styleOf("stamp").fontVariantNumeric).toBe("tabular-nums");
  });

  it("is not sized by a hard-coded width", () => {
    // Every line is nowrap, so the element is as wide as its content and no
    // wider; a fixed width would only clip a longer locale's time.
    const block = CSS.slice(CSS.indexOf(".hgadm-timestamp {"), CSS.indexOf(".hgadm-recent {"));
    expect(block).not.toMatch(/[^-]width:\s*\d/);
  });
});
