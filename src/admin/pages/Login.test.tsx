import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/* -------------------------------- mocks --------------------------------- */
type Status = "booting" | "signed-out" | "denied" | "signed-in";

const auth = vi.hoisted(() => ({
  current: {
    status: "signed-out" as Status,
    me: null as unknown,
    login: vi.fn(),
    logout: vi.fn(),
    can: () => false,
  },
}));
vi.mock("../auth", () => ({ useAdminAuth: () => auth.current }));

import { LoginPage } from "./Login";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.current = {
    status: "signed-out",
    me: null,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    can: () => false,
  };
});

describe("admin login route — every session state ends somewhere usable", () => {
  it("no session: email & password fields are visible", () => {
    renderLogin();
    expect(screen.getByLabelText(/이메일/)).toBeInTheDocument();
    expect(screen.getByLabelText(/비밀번호/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
  });

  it("booting: shows the session-check spinner (no hidden/blank state)", () => {
    auth.current.status = "booting";
    renderLogin();
    expect(screen.getByText("로그인 확인 중…")).toBeInTheDocument();
  });

  it("non-admin session: clears it automatically and then shows the form", async () => {
    auth.current.status = "denied";
    auth.current.logout = vi.fn().mockImplementation(() => {
      auth.current = { ...auth.current, status: "signed-out" };
      return Promise.resolve();
    });
    const { rerender } = renderLogin();

    // The incompatible session is discarded without user action…
    await waitFor(() => expect(auth.current.status).toBe("signed-out"));
    rerender(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>,
    );
    // …and the email/password form appears with an explanatory notice.
    expect(screen.getByLabelText(/이메일/)).toBeInTheDocument();
    expect(screen.getByLabelText(/비밀번호/)).toBeInTheDocument();
    expect(
      screen.getByText(/관리자 권한이 없는 기존 로그인 정보를 정리했어요/),
    ).toBeInTheDocument();
  });

  it("admin session: redirects to the dashboard, never a blank page", () => {
    auth.current.status = "signed-in";
    renderLogin();
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });
});
