/**
 * The admin session survives what says nothing about it.
 *
 * * Several portal tabs share one stored pair, and refresh tokens are
 *   single-use. When another tab rotates the pair, this tab must adopt the
 *   newer pair of the same server session instead of sending its dead
 *   refresh token — which the server rejects, and which then signed every
 *   tab out.
 * * A cold-start check that fails because the API is unreachable (network,
 *   5xx, time-box) must not wipe the stored session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, NetworkError } from "../lib/http";

const { httpGet, setAuthHandlers, storage } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  setAuthHandlers: vi.fn(),
  storage: {
    loadAdminSession: vi.fn(),
    saveAdminSession: vi.fn(),
    clearAdminSession: vi.fn(),
  },
}));

vi.mock("../lib/http", async () => {
  const actual = await vi.importActual<typeof import("../lib/http")>("../lib/http");
  return { ...actual, http: { ...actual.http, get: httpGet }, setAuthHandlers };
});
vi.mock("./lib/storage", () => storage);

import { AdminAuthProvider, useAdminAuth } from "./auth";

/** A token whose payload carries `sid` (unsigned — only the payload is read). */
function jwt(sid: string, n: number): string {
  const payload = btoa(JSON.stringify({ sid, n })).replace(/=+$/, "");
  return `h.${payload}.s`;
}

function session(sid: string, n: number) {
  return { accessToken: `acc-${sid}-${n}`, refreshToken: jwt(sid, n), accessExpiresAt: Date.now() + 60_000 };
}

function Probe() {
  return <div data-testid="status">{useAdminAuth().status}</div>;
}

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AdminAuthProvider>
        <Probe />
      </AdminAuthProvider>
    </QueryClientProvider>,
  );
  return setAuthHandlers.mock.calls[setAuthHandlers.mock.calls.length - 1][0] as {
    getAccessToken: () => string | null;
    getRefreshToken: () => string | null;
  };
}

const ME = { user_id: "u", email: "a@talkhangyul.co.kr", name: "관리자", nickname: null, admin_role: "super_admin", scopes: [] };

beforeEach(() => {
  vi.clearAllMocks();
  httpGet.mockResolvedValue(ME);
});

describe("multi-tab refresh", () => {
  it("adopts a pair another tab rotated for the same session", async () => {
    const first = session("sid-1", 1);
    storage.loadAdminSession.mockReturnValue(first);
    const handlers = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));

    const rotated = session("sid-1", 2);
    storage.loadAdminSession.mockReturnValue(rotated);
    expect(handlers.getRefreshToken()).toBe(rotated.refreshToken);
    expect(handlers.getAccessToken()).toBe(rotated.accessToken);
  });

  it("never adopts a different session signed in elsewhere", async () => {
    const mine = session("sid-1", 1);
    storage.loadAdminSession.mockReturnValue(mine);
    const handlers = renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-in"));

    storage.loadAdminSession.mockReturnValue(session("sid-other", 1));
    expect(handlers.getRefreshToken()).toBe(mine.refreshToken);
  });
});

describe("cold start", () => {
  it.each([
    ["network failure", new NetworkError()],
    ["server error", new ApiError(503, "unavailable", "down")],
  ])("keeps the stored session on a %s", async (_label, error) => {
    storage.loadAdminSession.mockReturnValue(session("sid-1", 1));
    httpGet.mockRejectedValue(error);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    expect(storage.clearAdminSession).not.toHaveBeenCalled();
  });

  it("drops the session the server rejected", async () => {
    storage.loadAdminSession.mockReturnValue(session("sid-1", 1));
    httpGet.mockRejectedValue(new ApiError(401, "unauthorized", "expired"));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("signed-out"));
    expect(storage.clearAdminSession).toHaveBeenCalled();
  });
});
