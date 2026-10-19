/**
 * Editing a banner: an emptied optional field is sent as null.
 *
 * The PATCH leaves omitted fields alone. The editor used to omit an emptied
 * date and fall back to clear_window, which only fired when BOTH dates were
 * empty — so removing just the end (or just the start) of a schedule was
 * reported as saved and changed nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { adminApi, type AdminBanner } from "../api";
import { BannersPage } from "./HomeCards";

vi.mock("../auth", () => ({
  useAdminAuth: () => ({ can: () => true }),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, listBanners: vi.fn(), updateBanner: vi.fn() },
  };
});

const BANNER: AdminBanner = {
  banner_id: "ban_1",
  image_url: "https://cdn.example.com/b.png",
  image_crop: { x: 0.1, y: 0, width: 0.6, height: 1 },
  alt_text: "배너",
  action_url: "/subscription",
  sort_order: 0,
  is_active: true,
  starts_at: "2026-07-01T00:00:00Z",
  ends_at: "2026-08-01T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/home-cards"]}>
          <BannersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("banner edit", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listBanners).mockResolvedValue({ items: [BANNER] } as never);
    vi.mocked(adminApi.updateBanner).mockReset().mockResolvedValue(BANNER);
  });

  it("sends only the emptied end date as null, keeping the start", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText(/노출 종료/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/이동 링크/), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.updateBanner).toHaveBeenCalledTimes(1));
    const body = vi.mocked(adminApi.updateBanner).mock.calls[0][1];
    expect(body).toHaveProperty("ends_at", null);
    expect(body).toHaveProperty("action_url", null);
    expect(body.starts_at).toBe(new Date(BANNER.starts_at as string).toISOString());
    // The chosen crop is kept as it was.
    expect(body).toHaveProperty("image_crop", BANNER.image_crop);
  });

  it("shows the recommended size and ratio in the editor", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "수정" }));
    expect(screen.getByText("1005 × 536px")).toBeInTheDocument();
    expect(screen.getByText(/비율 15:8/)).toBeInTheDocument();
  });
});
