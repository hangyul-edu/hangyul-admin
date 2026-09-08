import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./Layout";

vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "u", email: "a@b.co", name: "관리자", nickname: "adm",
          admin_role: "super_admin", scopes: ["users:read", "ops:read", "audit:read"] },
    login: vi.fn(),
    logout: vi.fn(),
    can: () => true,
  }),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/users"]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/users" element={<div>USERS PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const sidebar = () => document.querySelector("aside.hgadm-sidebar") as HTMLElement;
const toggle = () => screen.getByRole("button", { name: /사이드바 (접기|펼치기)/ });

describe("admin sidebar", () => {
  beforeEach(() => localStorage.clear());

  it("starts expanded, with labels visible", () => {
    renderLayout();
    expect(sidebar().className).not.toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    // The nav label is real text when expanded, not just a tooltip.
    expect(within(sidebar()).getByText("사용자 관리")).toBeInTheDocument();
  });

  it("collapses and expands on the control", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(toggle());
    expect(sidebar().className).toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle());
    expect(sidebar().className).not.toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("names the control for what a click will do", async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
    await user.click(toggle());
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
  });

  it("keeps every menu item reachable and named while collapsed", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(toggle());

    // The visible label is hidden by CSS when collapsed, which also drops it
    // from the accessibility tree — so each link carries its own name and
    // tooltip. Without this the collapsed rail is a row of unlabelled icons.
    const link = within(sidebar()).getByRole("link", { name: "사용자 관리" });
    expect(link).toHaveAttribute("title", "사용자 관리");
    expect(link).toHaveAttribute("href", "/users");
  });

  it("still marks the active item while collapsed", async () => {
    const user = userEvent.setup();
    renderLayout();
    const active = within(sidebar()).getByRole("link", { name: "사용자 관리" });
    expect(active.className).toContain("active");

    await user.click(toggle());
    // The active class drives both the background and the left bar, so the
    // current page stays identifiable with no text on screen.
    expect(within(sidebar()).getByRole("link", { name: "사용자 관리" }).className)
      .toContain("active");
  });

  it("does not disturb the page content", async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();
    await user.click(toggle());
    // Collapsing is a sidebar concern; the outlet must not remount or vanish.
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();
  });

  it("remembers the preference across a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLayout();
    await user.click(toggle());
    expect(localStorage.getItem("hangyul.admin.sidebar.v1")).toBe("collapsed");
    unmount();

    renderLayout();
    expect(sidebar().className).toContain("is-collapsed");
  });

  it("survives storage being unavailable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    // Private-browsing mode throws on access; the sidebar must still render,
    // just at its default width.
    expect(() => renderLayout()).not.toThrow();
    expect(sidebar().className).not.toContain("is-collapsed");
    getItem.mockRestore();
  });
});
