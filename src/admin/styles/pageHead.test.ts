/**
 * The page header's description must never be clipped.
 *
 * Asserted against the COMPUTED style of a real page-head DOM with the whole
 * admin stylesheet attached, not against the text of one rule — so a clipping
 * property introduced anywhere in the cascade fails here too. jsdom does not
 * lay out, so this checks the properties that decide clipping and wrapping,
 * which is exactly what the bug was about.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Read from disk rather than `import "./admin.css?raw"`: vitest runs with
// `css: false`, so a CSS import resolves to an EMPTY string — which would let
// every "nothing clips this" assertion below pass for the wrong reason. The
// first test guards exactly that.
// Path is relative to the vitest root (frontend/).
const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

/** A page head as every admin page writes it: text column + action buttons. */
function mount(withActions: boolean) {
  document.body.innerHTML = `
    <div class="hgadm-content">
      <div class="hgadm-page-head">
        <div id="col">
          <h1>강의·영상 관리</h1>
          <div class="hgadm-page-head__desc" id="desc">
            강의 기본 정보와 호스팅 영상 업로드를 관리합니다.
          </div>
        </div>
        ${withActions ? '<div class="hgadm-page-head__actions"><button>추가</button></div>' : ""}
      </div>
    </div>`;
  return {
    desc: getComputedStyle(document.getElementById("desc")!),
    col: getComputedStyle(document.getElementById("col")!),
  };
}

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

describe("admin page header", () => {
  it("is actually testing the shipped stylesheet", () => {
    // Without this, an empty or unresolved stylesheet would make every
    // assertion below trivially true.
    expect(CSS).toContain(".hgadm-page-head__desc");
    expect(CSS.length).toBeGreaterThan(10_000);
    // …and that the cascade genuinely reaches the element.
    expect(mount(true).desc.fontSize).toBe("13.5px");
  });

  it.each([true, false])("never clips the description (actions: %s)", (withActions) => {
    const { desc } = mount(withActions);
    // Unset means the default — visible, wrapping text. Any of these being set
    // is what would cut a description off.
    expect(desc.overflow).toBe("");
    expect(desc.textOverflow).toBe("");
    expect(desc.whiteSpace).toBe("");
    expect(desc.webkitLineClamp ?? "").toBe("");
  });

  it("gives the description room to breathe when it wraps", () => {
    const { desc } = mount(true);
    // Descriptions run two to three lines on most pages.
    expect(desc.lineHeight).toBe("1.55");
    // A measure cap wraps the text; it does not cut it.
    expect(desc.maxWidth).toBe("78ch");
    // A pasted ID or URL wraps instead of punching out of the column.
    expect(desc.overflowWrap).toBe("anywhere");
  });

  it("lets the title column grow instead of being squeezed by the buttons", () => {
    // The bug: the column was `flex: 0 1 auto` beside `flex-shrink: 0`
    // actions, so on the eleven pages with buttons the description was
    // compressed into a narrow ragged strip.
    const { col } = mount(true);
    expect(col.flexGrow).toBe("1");
    expect(col.flexBasis).toBe("420px");
    // Below that, the actions wrap to their own line rather than crushing the
    // text — this is what keeps narrow screens readable.
    expect(col.minWidth).toBe("min(100%, 320px)");
  });

  it("applies the same rules on a page with no actions", () => {
    const { col } = mount(false);
    expect(col.flexGrow).toBe("1");
  });
});
