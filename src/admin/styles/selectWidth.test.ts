/**
 * Toolbar filters size to their longest option.
 *
 * Filters used to carry hand-picked pixel widths, and a renamed label that
 * outgrew its number was silently ellipsised ("학습 분야: …"). Now the trigger
 * stacks invisible copies of every option in the value's grid cell
 * (`hgadm-select-trigger__sizer`), and a select inside `.hgadm-toolbar` takes
 * its natural width — so it is exactly as wide as its widest option and does
 * not jump as the choice changes. These checks keep it that way: no fixed
 * widths creep back in, and the stylesheet keeps the rules that do the sizing.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Every `<Select>…</Select>` chunk in the admin pages, by file. */
function selects(): { file: string; chunk: string }[] {
  const out: { file: string; chunk: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        const source: string = readFileSync(path, "utf8");
        // Whole chunks: the opening tag's `onChange={(e) => …}` contains a `>`.
        for (const m of source.matchAll(/<Select\b([\s\S]*?)<\/Select>/g)) out.push({ file: entry.name, chunk: m[1] });
      }
    }
  };
  walk("src/admin/pages");
  return out;
}

describe("admin toolbar filter widths", () => {
  it("finds the filters to check", () => {
    const all = selects();
    expect(all.length).toBeGreaterThan(20);
    expect(all.some((s) => s.chunk.includes("학습 분야: 전체"))).toBe(true);
  });

  it("gives no filter a hand-picked width", () => {
    // One panel-header select is exempt: it sits outside a toolbar.
    const fixed = selects()
      // The props: everything before the first option.
      .filter((s) => /style=\{\{\s*(?:min)?[wW]idth:/.test(s.chunk.split("<option")[0]))
      .filter((s) => !s.chunk.includes('aria-label="근거 종류"'))
      .map((s) => s.file);
    expect(fixed).toEqual([]);
  });

  it("keeps the stylesheet rules that size a filter to its longest option", () => {
    const css: string = readFileSync("src/admin/styles/admin.css", "utf8");
    expect(css).toMatch(/\.hgadm-toolbar \.hgadm-select \{[^}]*width: auto;/);
    expect(css).toMatch(/\.hgadm-select-trigger__sizer::after \{[^}]*content: attr\(data-label\);/);
    expect(css).toMatch(/\.hgadm-select-trigger__value,\s*\.hgadm-select-trigger__sizer \{[^}]*grid-area: 1 \/ 1;/);
  });
});
