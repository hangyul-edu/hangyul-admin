/**
 * Every toolbar filter must be wide enough for the longest label it can show.
 *
 * The trigger ellipsizes what does not fit, so a label that overruns its width
 * disappears quietly rather than breaking anything — which is how
 * "학습 분야: 전체" came to render as "학습 분야: …". It inherited the 130px
 * that had been ample for the shorter word it replaced.
 *
 * This walks the admin pages, pairs every inline-styled `<Select>` with the
 * `<option>` labels it can display, and checks the width against the widest of
 * them — so renaming a filter fails here instead of clipping in the UI.
 *
 * The estimate is the same one `searchWidth.test.ts` uses, for the same reason:
 * jsdom cannot measure text, but a consistent approximation catches an overrun
 * by a visible margin. It is checked against a real measurement below.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Padding, gap and caret the trigger reserves around its text, and the per
 * character advances inside it.
 *
 * Calibrated, not guessed. jsdom cannot measure text, so these were solved
 * from five labels rendered in a real browser against the shipped stylesheet:
 * 회화 74px, 코스: 전체 105px, 말하기 연습 113px, 학습 분야: 전체 132px,
 * TOPIK 90px. The model reproduces all five exactly. An uncalibrated guess
 * over-estimated by 27px and condemned four filters that were perfectly fine,
 * which is its own kind of wrong — a width test nobody believes gets deleted.
 */
const CHROME = 50;
const ADVANCE = { cjk: 12, space: 3, colon: 4, other: 8 };

function approxWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[ᄀ-ᇿ　-ヿ㄰-㆏가-힯＀-｠]/.test(ch)) w += ADVANCE.cjk;
    else if (ch === " ") w += ADVANCE.space;
    else if (ch === ":") w += ADVANCE.colon;
    else w += ADVANCE.other;
  }
  return w;
}

type Filter = { file: string; width: number; labels: string[] };

/** Every `<Select>` given an explicit width, with the labels it can render. */
function filters(): Filter[] {
  const out: Filter[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        const source: string = readFileSync(path, "utf8");
        // Whole `<Select>…</Select>` chunks, then read the width and the
        // labels out of each. Matching the opening tag alone does not work:
        // its `onChange={(e) => …}` contains a `>`, which ends a `[^>]*`
        // early and silently found nothing at all.
        for (const m of source.matchAll(/<Select\b([\s\S]*?)<\/Select>/g)) {
          const chunk = m[1];
          const width = /style=\{\{\s*width:\s*(\d+)\s*\}\}/.exec(chunk);
          if (!width) continue;
          const labels = [...chunk.matchAll(/<option[^>]*>([^<{]+)<\/option>/g)]
            .map((o) => o[1].trim())
            .filter(Boolean);
          if (labels.length) out.push({ file: entry.name, width: Number(width[1]), labels });
        }
      }
    }
  };
  walk("src/admin");
  return out;
}

describe("admin toolbar filter widths", () => {
  it("finds the filters to check", () => {
    const all = filters();
    expect(all.length).toBeGreaterThan(5);
    // The one that started this, so a rename of it cannot quietly opt out.
    expect(all.some((f) => f.labels.includes("학습 분야: 전체"))).toBe(true);
  });

  it("fits the longest label each filter can display", () => {
    const tooNarrow = filters()
      .map((f) => {
        const widest = f.labels.reduce((a, b) => (approxWidth(a) > approxWidth(b) ? a : b));
        return { ...f, widest, needs: Math.ceil(approxWidth(widest) + CHROME) };
      })
      .filter((f) => f.needs > f.width);

    expect(
      tooNarrow.map((f) => `${f.file}: "${f.widest}" needs ~${f.needs}px, has ${f.width}px`),
    ).toEqual([]);
  });

  it("gives the same filter the same width wherever it appears", () => {
    // 학습 분야 is on both 코스 and 강의; two different widths for one control
    // reads as an accident, because it is one.
    const widths = new Set(
      filters()
        .filter((f) => f.labels.includes("학습 분야: 전체"))
        .map((f) => f.width),
    );
    expect(widths.size).toBe(1);
  });
});

describe("the width model", () => {
  // Measured in a headless browser against admin.css, at the trigger's 13.5px.
  const MEASURED: [string, number][] = [
    ["회화", 74],
    ["코스: 전체", 105],
    ["말하기 연습", 113],
    ["학습 분야: 전체", 132],
    ["TOPIK", 90],
  ];

  it("reproduces what the browser actually renders", () => {
    for (const [text, real] of MEASURED) {
      expect(Math.round(approxWidth(text) + CHROME)).toBe(real);
    }
  });

  it("would have caught the label that started this", () => {
    // "학습 분야: 전체" in the 130px it inherited from "트랙: 전체".
    expect(approxWidth("학습 분야: 전체") + CHROME).toBeGreaterThan(130);
    expect(approxWidth("트랙: 전체") + CHROME).toBeLessThan(130);
  });
});
