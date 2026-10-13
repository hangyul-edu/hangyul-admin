import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { CouponsPage } from "./Coupons";
import { adminApi, type CouponBatch } from "../api";

vi.mock("../auth", () => ({
  useAdminAuth: () => ({ can: () => true }),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, listCouponBatches: vi.fn() },
  };
});

function batch(id: string, status: CouponBatch["status"]): CouponBatch {
  return {
    batch_id: id,
    name: `묶음 ${id}`,
    duration_days: 30,
    quantity: 10,
    valid_until: null,
    status,
    created_at: "2026-09-01T00:00:00Z",
    issued_by_user_id: "usr_admin",
  };
}

describe("coupon batches", () => {
  it("labels a batch in batch words, not the subscription's 이용 중", async () => {
    vi.mocked(adminApi.listCouponBatches).mockResolvedValue({
      items: [batch("a", "active"), batch("b", "revoked")],
      total: 2,
      limit: 25,
      offset: 0,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter>
            <CouponsPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("발행됨")).toBeInTheDocument();
    expect(screen.getByText("회수됨")).toBeInTheDocument();
    expect(screen.queryByText("이용 중")).not.toBeInTheDocument();
  });
});
