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
    // …and it hides the toggle, which cannot widen the layout at that size.
    expect(breakpoint).toMatch(/\.hgadm-sidebar__foot\s*\{\s*display:\s*none/);
  });

  it("respects a reduced-motion preference for the width animation", () => {
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/transition:\s*width/);
    expect(code).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.hgadm-sidebar[\s\S]*?transition:\s*none/);
  });
});
