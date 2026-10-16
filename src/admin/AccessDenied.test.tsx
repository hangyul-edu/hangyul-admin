import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../lib/http";

/* -------------------------------- mocks --------------------------------- */
const { httpGet, httpPost, storage } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  storage: {
    loadAdminSession: vi.fn(),
    saveAdminSession: vi.fn(),
    clearAdminSession: vi.fn(),
  },
}));

vi.mock("../lib/http", async () => {
  const actual = await vi.importActual<typeof import("../lib/http")>("../lib/http");
  return {
    ...actual,
    http: { ...actual.http, get: httpGet, post: httpPost },
    setAuthHandlers: vi.fn(),
  };
});
vi.mock("./lib/storage", () => storage);

import { AdminAuthProvider, useAdminAuth } from "./auth";
import { AccessDenied } from "./components/AccessDenied";

function StatusProbe() {
  const { status } = useAdminAuth();
  return <div data-testid="status">{status}</div>;
}

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAuthProvider>{ui}</AdminAuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.loadAdminSession.mockReturnValue({
    accessToken: "tok",
    refreshToken: "ref",
    accessExpiresAt: Date.now() + 100_000,
  });
});

describe("admin auth denied state", () => {
  it("a 403 from /admin/me lands in 'denied', keeping the session for logout", async () => {
    httpGet.mockRejectedValue(new ApiError(403, "forbidden", "권한 없음"));
    renderWithProviders(<StatusProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("denied"),
    );
    // Session was NOT cleared — the user still needs it to log out.
    expect(storage.clearAdminSession).not.toHaveBeenCalled();
  });

  it("a 401 (invalid session) signs out instead", async () => {
    httpGet.mockRejectedValue(new ApiError(401, "unauthorized", "만료"));
    renderWithProviders(<StatusProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed-out"),
    );
    expect(storage.clearAdminSession).toHaveBeenCalled();
  });
});

describe("AccessDenied screen", () => {
  it("names the signed-in account and fully logs out on click", async () => {
    httpGet.mockImplementation((path: string) => {
      if (path === "/admin/me")
        return Promise.reject(new ApiError(403, "forbidden", "권한 없음"));
      if (path === "/users/me")
        return Promise.resolve({ email: "member@talkhangyul.co.kr", nickname: "멤버" });
      return Promise.reject(new Error(`unexpected GET ${path}`));
    });
    httpPost.mockResolvedValue(undefined); // POST /auth/logout

    renderWithProviders(
      <>
        <StatusProbe />
        <AccessDenied />
      </>,
    );
    expect(
      await screen.findByText(/member@talkhangyul\.co\.kr/),
    ).toBeInTheDocument();
    expect(screen.getByText("관리자 권한이 없습니다")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "로그아웃하고 관리자 로그인으로 이동" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("signed-out"),
    );
    // Server-side revocation + client storage wipe both happened.
    expect(httpPost).toHaveBeenCalledWith("/auth/logout", { refresh_token: "ref" });
    expect(storage.clearAdminSession).toHaveBeenCalled();
  });

  it.each([
    ["no member app address configured", "", null],
    ["the member app's address configured", "https://talkhangyul.com/", "https://talkhangyul.com"],
  ])("links to the portal's login, and to the member app only when known (%s)", async (_label, url, expected) => {
    // The portal is at the root of its own domain; the member app is another domain.
    vi.stubEnv("VITE_MEMBER_APP_URL", url);
    vi.resetModules();
    try {
      httpGet.mockImplementation(() => Promise.reject(new ApiError(403, "forbidden", "권한 없음")));
      // Fresh modules read the stubbed env; the provider must be the same fresh copy.
      const { AccessDenied: Fresh } = await import("./components/AccessDenied");
      const { AdminAuthProvider: FreshProvider } = await import("./auth");
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <FreshProvider>
            <Fresh />
          </FreshProvider>
        </QueryClientProvider>,
      );
      expect(screen.getByRole("link", { name: "관리자 로그인 화면으로" })).toHaveAttribute("href", "/login");
      const member = screen.queryByRole("link", { name: "멤버 앱으로 돌아가기" });
      if (expected) expect(member).toHaveAttribute("href", expected);
      else expect(member).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
