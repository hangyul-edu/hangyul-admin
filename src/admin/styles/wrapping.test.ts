/**
 * Admin text must wrap at word boundaries, not inside words.
 *
 * The default `word-break: normal` lets a browser break Korean at ANY syllable
 * — "관리합니다" splitting as "관리합 / 니다" — and the same rule chops Latin
 * terms like TOPIK. `keep-all` wraps Korean at spaces and keeps words whole.
 *
 * jsdom does not resolve inherited values, so each rule is asserted on the
 * element that declares it; the elements that must INHERIT are checked to have
 * no override of their own.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Read from disk: a CSS import resolves to an empty string under `css: false`,
// which would make every assertion here pass for the wrong reason.
const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

function styleOf(html: string, id: string): CSSStyleDeclaration {
  document.body.innerHTML = html;
  return getComputedStyle(document.getElementById(id)!);
}

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

describe("admin text wrapping", () => {
  it("is actually testing the shipped stylesheet", () => {
    expect(CSS).toContain(".hgadm-frame");
    expect(CSS.length).toBeGreaterThan(10_000);
  });

  it("wraps at word boundaries across the whole portal", () => {
    const frame = styleOf('<div class="hgadm-frame" id="f"></div>', "f");
    expect(frame.wordBreak).toBe("keep-all");
    // The last resort, so keep-all cannot cause overflow instead.
    expect(frame.overflowWrap).toBe("break-word");
  });

  it("never breaks anywhere — the value that splits ordinary words", () => {
    // `overflow-wrap: anywhere` and `word-break: break-all` both break inside
    // words. Neither may appear except on the identifier escape hatch below.
    // Comments mention these values by name, so strip them before scanning —
    // otherwise the prose explaining the fix reads as the fix being absent.
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders = [...code.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /overflow-wrap\s*:\s*anywhere|word-break\s*:\s*break-all/.test(body))
      .map(([, selector]) => selector.trim().split("\n").pop()!.trim());
    expect(offenders).toEqual([".hgadm-cell-mono"]);
  });

  it("still lets identifiers break, so they cannot widen a table", () => {
    // IDs and tokens have no spaces to wrap at; keep-all alone would push them
    // out of their cell.
    const mono = styleOf('<span class="hgadm-cell-mono" id="m">usr_abc</span>', "m");
    expect(mono.wordBreak).toBe("break-all");
  });

  it("lets long definition-list values wrap rather than stretch the grid", () => {
    const dd = styleOf('<dl class="hgadm-dl"><dt>a</dt><dd id="d">x</dd></dl>', "d");
    expect(dd.overflowWrap).toBe("break-word");
    // Not the deprecated `word-break: break-word` alias it used to carry.
    expect(dd.wordBreak).toBe("");
  });

  it("does not introduce horizontal scrolling to compensate", () => {
    // The fix must not trade mid-word breaks for a scrollbar.
    const content = styleOf('<div class="hgadm-content" id="c"></div>', "c");
    expect(content.overflowX).not.toBe("scroll");
    expect(content.width).not.toMatch(/max-content|min-content/);
  });
});
