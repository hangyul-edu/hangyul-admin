/**
 * The collapsed sidebar's layout contract.
 *
 * The look is defined once as custom properties on `.hgadm-sidebar` and
 * switched on by two independent triggers — the user's toggle
 * (`.is-collapsed`) and the narrow-viewport breakpoint. These assertions pin
 * that single definition, so the two triggers cannot drift into different
 * collapsed appearances.
 *
 * jsdom resolves custom properties but does not lay out, so this checks the
 * values that decide the layout rather than measured pixels.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// Read from disk: a CSS import resolves to an empty string under `css: false`,
// which would make these assertions pass for the wrong reason.
const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

function mount() {
  document.body.innerHTML = `
    <div class="hgadm-frame">
      <aside class="hgadm-sidebar" id="expanded">
        <nav class="hgadm-nav"><span class="hgadm-nav__label" id="label">x</span></nav>
      </aside>
      <aside class="hgadm-sidebar is-collapsed" id="collapsed"></aside>
      <div class="hgadm-main" id="main"><div class="hgadm-content" id="content"></div></div>
    </div>`;
  const at = (id: string) => getComputedStyle(document.getElementById(id)!);
  return { expanded: at("expanded"), collapsed: at("collapsed"), main: at("main"),
           content: at("content"), label: at("label") };
}

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

describe("collapsible sidebar", () => {
  it("is actually testing the shipped stylesheet", () => {
    expect(CSS).toContain(".hgadm-sidebar");
    expect(CSS.length).toBeGreaterThan(10_000);
  });

  it("defaults to the expanded width with labels shown", () => {
    const { expanded } = mount();
    expect(expanded.getPropertyValue("--nav-width")).toBe("var(--ad-sidebar-w)");
    expect(expanded.getPropertyValue("--nav-label-display")).toBe("block");
  });

  it("narrows to an icon rail when collapsed", () => {
    const { collapsed } = mount();
    expect(collapsed.getPropertyValue("--nav-width")).toBe("var(--ad-sidebar-w-collapsed)");
    expect(collapsed.getPropertyValue("--nav-label-display")).toBe("none");
    // Centred icons rather than left-aligned text rows.
    expect(collapsed.getPropertyValue("--nav-link-justify")).toBe("center");
  });

  it("hides labels through the shared property, not a second rule", () => {
    // If the label hid itself with its own `display: none` the toggle and the
    // breakpoint would need separate rules and could drift apart.
    const { label } = mount();
    expect(label.display).toBe("var(--nav-label-display)");
  });

  it("lets the content area take the reclaimed space", () => {
    const { main } = mount();
    // `flex: 1` on the main column is what makes the content widen when the
    // sidebar narrows — no width calculation anywhere depends on the sidebar.
    expect(main.flexGrow).toBe("1");
    expect(main.minWidth).toBe("0");
  });

  it("introduces no clipping or horizontal scrolling", () => {
    const { content, collapsed } = mount();
    expect(content.overflowX).not.toBe("scroll");
    expect(collapsed.overflowX).not.toBe("scroll");
  });

  it("defines both collapse triggers from one set of properties", () => {
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    // The breakpoint must set the same custom properties rather than restate
    // widths and display values of its own.
    const breakpoint = code.slice(code.indexOf("@media (max-width: 1024px)"));
    expect(breakpoint).toContain("--nav-width: var(--ad-sidebar-w-collapsed)");
    expect(breakpoint).toContain("--nav-label-display: none");
    // …and it hides the control, which cannot widen the layout at that size.
    expect(breakpoint).toMatch(/\.hgadm-sidebar__collapse\s*\{\s*display:\s*none/);
  });

  it("keeps the control compact chrome rather than a menu row", () => {
    document.body.innerHTML = `
      <div class="hgadm-frame"><aside class="hgadm-sidebar">
        <div class="hgadm-sidebar__brand">
          <a class="hgadm-sidebar__brand-link" id="wordmark" href="/">한귤 관리자</a>
          <button class="hgadm-sidebar__collapse" id="btn"></button>
        </div>
      </aside></div>`;
    const btn = getComputedStyle(document.getElementById("btn")!);
    // A 26px square, not a full-width row: it must not claim nav space.
    expect(btn.width).toBe("26px");
    expect(btn.height).toBe("26px");
    // No chrome of its own until hovered — jsdom reports transparent as rgba.
    expect(btn.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    // Pushed to the far edge of the brand row when expanded.
    expect(btn.marginLeft).toBe("var(--collapse-push)");
  });

  it("centres the control in the rail, where it is the only thing left", () => {
    document.body.innerHTML = `
      <div class="hgadm-frame"><aside class="hgadm-sidebar is-collapsed" id="rail">
        <div class="hgadm-sidebar__brand" id="brand">
          <a class="hgadm-sidebar__brand-link" id="wordmark" href="/">한귤 관리자</a>
          <button class="hgadm-sidebar__collapse" id="btn"></button>
        </div>
      </aside></div>`;
    const rail = getComputedStyle(document.getElementById("rail")!);
    // The brand row used to hold a logo mark too, which had to stack above the
    // control. With the mark gone the control is alone and simply centres.
    expect(rail.getPropertyValue("--brand-justify")).toBe("center");
    expect(rail.getPropertyValue("--collapse-push")).toBe("0");
    expect(rail.getPropertyValue("--brand-pad-x")).toBe("8px");
    // The wordmark hides with the rest of the sidebar text. It is an <a> since
    // it became a dashboard link, so the rule that hides sidebar text has to
    // name the class — a `span` selector alone would leave the brand showing
    // in the 64px rail.
    expect(getComputedStyle(document.getElementById("wordmark")!).display)
      .toBe("var(--nav-label-display)");
    // …but the control is a <button>, so that rule cannot swallow it.
    expect(getComputedStyle(document.getElementById("btn")!).display).not.toBe("none");
  });

  it("pushes the control to the far edge when expanded", () => {
    document.body.innerHTML = `
      <div class="hgadm-frame"><aside class="hgadm-sidebar" id="side"></aside></div>`;
    const side = getComputedStyle(document.getElementById("side")!);
    expect(side.getPropertyValue("--brand-justify")).toBe("flex-start");
    expect(side.getPropertyValue("--collapse-push")).toBe("auto");
  });

  it("gives the brand link a hit area, a hover and a focus ring", () => {
    document.body.innerHTML = `
      <div class="hgadm-frame"><aside class="hgadm-sidebar">
        <div class="hgadm-sidebar__brand">
          <a class="hgadm-sidebar__brand-link" id="brand" href="/">한귤 관리자</a>
        </div>
      </aside></div>`;
    const link = getComputedStyle(document.getElementById("brand")!);
    // Fills the row so the target is the label area, not just the glyphs…
    expect(link.flexGrow).toBe("1");
    // …and the padding is cancelled by an equal negative margin, so widening
    // the target did not move the text.
    expect(link.padding).toBe("6px");
    expect(link.margin).toBe("-6px");
    // Visual styling otherwise unchanged: it inherits the brand type colour
    // and carries no underline.
    expect(link.color).toBe("inherit");
    expect(link.textDecoration).toBe("none");

    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\.hgadm-sidebar__brand-link:hover\s*\{[^}]*background/);
    // Keyboard users get the same focus treatment as the admin's buttons.
    expect(code).toMatch(/\.hgadm-sidebar__brand-link:focus-visible\s*\{[^}]*--focus-ring/);
  });

  it("draws the control at all times, not only on hover", () => {
    // Hover-only chrome is undiscoverable in an icon rail.
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const base = /\.hgadm-sidebar__collapse\s*\{([^}]*)\}/.exec(code);
    expect(base).not.toBeNull();
    expect(base![1]).not.toMatch(/display\s*:\s*none|opacity\s*:\s*0/);
  });

  it("respects a reduced-motion preference for the width animation", () => {
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/transition:\s*width/);
    expect(code).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.hgadm-sidebar[\s\S]*?transition:\s*none/);
  });
});
