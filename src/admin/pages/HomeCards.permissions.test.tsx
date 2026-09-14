/**
 * The banner editor needs two scopes, not one.
 *
 * Banner management is `ops:write`, but the image goes through
 * `POST /admin/media`, which the backend gates on `content:write`. A support
 * agent holds the first and not the second — so they could open 배너 추가,
 * click the dropzone, collect a 403, and never finish, because an image is
 * required. Creating needs both; everything that does not touch an image still
 * needs only ops:write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { BannersPage } from "./HomeCards";
import { adminApi } from "../api";

let scopes: string[] = [];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "usr_admin", admin_role: "support_agent", scopes },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, listBanners: vi.fn() } };
});

function renderPage() {
  vi.mocked(adminApi.listBanners).mockResolvedValue({ items: [] } as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/banners"]}>
          <BannersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const addButton = () => screen.queryByRole("button", { name: /배너 추가/ });

beforeEach(() => vi.clearAllMocks());

describe("배너 추가", () => {
  it("is offered when both scopes are held", async () => {
    scopes = ["ops:read", "ops:write", "content:read", "content:write"];
    renderPage();
    await screen.findByText("배너 관리");
    expect(addButton()).toBeInTheDocument();
  });

  it("is hidden from a support agent, who cannot upload the required image", async () => {
    scopes = ["users:read", "content:read", "commerce:read", "ops:read", "ops:write"];
    renderPage();
    await screen.findByText("배너 관리");
    expect(addButton()).not.toBeInTheDocument();
  });

  it("is hidden from a read-only viewer", async () => {
    scopes = ["users:read", "content:read", "commerce:read", "ops:read", "audit:read"];
    renderPage();
    await screen.findByText("배너 관리");
    expect(addButton()).not.toBeInTheDocument();
  });
});
