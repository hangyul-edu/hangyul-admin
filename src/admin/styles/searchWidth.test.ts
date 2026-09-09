/**
 * The search field must be wide enough for its placeholder.
 *
 * The field is shared by eleven toolbars, so "wide enough" means the LONGEST
 * placeholder any of them uses. This measures them all against the floor in
 * the stylesheet rather than pinning one page, so adding a longer placeholder
 * later fails here instead of silently clipping in the UI.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Read from disk: a CSS import resolves to an empty string under `css: false`.
const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

/** Every placeholder the admin pages set, with its source file. */
function placeholders(): { text: string; file: string }[] {
  const out: { text: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        for (const m of readFileSync(path, "utf8").matchAll(/placeholder="([^"]+)"/g)) {
          out.push({ text: m[1], file: entry.name });
        }
      }
    }
  };
  walk("src/admin");
  return out;
}

/**
 * Approximate rendered width at the input's 13.5px.
 *
 * Deliberately an estimate — jsdom cannot measure text — but a consistent one:
 * CJK advances a full em, Latin roughly 0.55em. It only has to be good enough
 * to catch a placeholder that overruns the field by a visible margin.
 */
function approxWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[ᄀ-ᇿ　-ヿ㄰-㆏가-힯＀-｠]/.test(ch)) w += 13.5;
    else if (ch === " ") w += 4;
    else w += 7.4;
  }
  return w;
}

/** Padding the input reserves: 32px for the icon, 12px on the right. */
const CHROME = 44;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

function searchStyle(): CSSStyleDeclaration {
  document.body.innerHTML = `<div class="hgadm-toolbar"><div class="hgadm-search" id="s">
    <input /></div></div>`;
  return getComputedStyle(document.getElementById("s")!);
}

describe("admin search field width", () => {
  it("is actually testing the shipped stylesheet", () => {
    expect(CSS).toContain(".hgadm-search");
    expect(searchStyle().position).toBe("relative");
  });

  it("has a floor wide enough for the longest placeholder in the admin", () => {
    const all = placeholders();
    expect(all.length).toBeGreaterThan(5);
    const widest = all.reduce((a, b) => (approxWidth(a.text) > approxWidth(b.text) ? a : b));

    // Read the floor from the ELEMENT, not by grepping the stylesheet: a
    // `flex: 1 1 420px` on an unrelated rule matched a text search here and
    // made this assertion pass without ever looking at the search field.
    const floor = Number(searchStyle().flexBasis.replace("px", ""));
    expect(floor).toBeGreaterThan(0);
    // The whole point: text has to fit inside the field, not run past it.
    expect(approxWidth(widest.text) + CHROME).toBeLessThan(floor);
  });

  it("does not clip or ellipsize what does not fit", () => {
    const s = searchStyle();
    // Widening is the fix; hiding the overflow would only hide the symptom.
    expect(s.overflow).toBe("");
    expect(s.textOverflow).toBe("");
  });

  it("grows into the toolbar's spare space but does not sprawl", () => {
    const s = searchStyle();
    expect(s.flexGrow).toBe("1");
    expect(s.maxWidth).toBe("460px");
  });

  it("gives way on a narrow screen instead of overflowing sideways", () => {
    // `min()` lets the field drop below its floor only when the container is
    // itself narrower, so the toolbar wraps rather than scrolling sideways.
    expect(searchStyle().minWidth).toBe("min(100%, 320px)");
    expect(CSS).toMatch(/\.hgadm-toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});
