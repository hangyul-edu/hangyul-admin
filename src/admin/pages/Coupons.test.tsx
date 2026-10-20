import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { CouponsPage, allCouponBatches } from "./Coupons";
import { adminApi, type CouponBatch } from "../api";

vi.mock("../auth", () => ({
  useAdminAuth: () => ({ can: () => true }),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, listCouponBatches: vi.fn(), generateCouponBatch: vi.fn() },
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <CouponsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("coupon batches", () => {
  it("labels a batch in batch words, not the subscription's 이용 중", async () => {
    vi.mocked(adminApi.listCouponBatches).mockResolvedValue({
      items: [batch("a", "active"), batch("b", "revoked")],
      total: 2,
      limit: 25,
      offset: 0,
    });
    renderPage();

    expect(await screen.findByText("발행됨")).toBeInTheDocument();
    expect(screen.getByText("회수됨")).toBeInTheDocument();
    expect(screen.queryByText("이용 중")).not.toBeInTheDocument();
  });

  it("searches batches by name with the server's filter", async () => {
    vi.mocked(adminApi.listCouponBatches).mockReset();
    vi.mocked(adminApi.listCouponBatches).mockResolvedValue({ items: [batch("a", "active")], total: 1, limit: 25, offset: 0 });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("발행됨");
    expect(adminApi.listCouponBatches).toHaveBeenLastCalledWith({ name_contains: undefined, limit: 25, offset: 0 });
    await user.type(screen.getByPlaceholderText("묶음 이름 검색"), "제휴");
    await waitFor(() =>
      expect(adminApi.listCouponBatches).toHaveBeenLastCalledWith({ name_contains: "제휴", limit: 25, offset: 0 }),
    );
  });

  it("generates a batch within the server's limits, with the name trimmed", async () => {
    vi.mocked(adminApi.listCouponBatches).mockReset();
    vi.mocked(adminApi.listCouponBatches).mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
    vi.mocked(adminApi.generateCouponBatch).mockResolvedValue({
      batch: batch("new", "active"),
      generated: 3,
      sample_codes: ["ABCD-1234-EFGH", "WXYZ-5678-IJKL", "MNOP-9012-QRST"],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("발행한 쿠폰 묶음이 없습니다.");
    await user.click(screen.getByRole("button", { name: "+ 쿠폰 발행" }));
    const dialog = screen.getByRole("dialog", { name: "쿠폰 발행" });
    const create = within(dialog).getByRole("button", { name: "생성" });
    expect(create).toBeDisabled(); // no name yet

    await user.type(within(dialog).getByLabelText("캠페인 이름"), "  대학 제휴  ");
    const quantity = within(dialog).getByLabelText("수량");
    await user.clear(quantity);
    await user.type(quantity, "10001"); // over the 10000 batch cap
    expect(create).toBeDisabled();
    await user.clear(quantity);
    await user.type(quantity, "3");
    const days = within(dialog).getByLabelText("이용 기간 (일)");
    await user.clear(days);
    await user.type(days, "3651"); // over 3650 days
    expect(create).toBeDisabled();
    await user.clear(days);
    await user.type(days, "30");
    expect(create).toBeEnabled();

    await user.click(create);
    await waitFor(() =>
      expect(adminApi.generateCouponBatch).toHaveBeenCalledWith({
        name: "대학 제휴",
        duration_days: 30,
        quantity: 3,
        valid_until: null,
      }),
    );
    // The sample codes, in the server's XXXX-XXXX-XXXX form.
    expect(await screen.findByText(/ABCD-1234-EFGH/)).toBeInTheDocument();
  });
});

describe("the 발행 묶음 filter's batches", () => {
  it("loads every batch page by page, past the server's 200-row page", async () => {
    const all = Array.from({ length: 450 }, (_, i) => batch(String(i), "active"));
    vi.mocked(adminApi.listCouponBatches).mockReset();
    vi.mocked(adminApi.listCouponBatches).mockImplementation(async (params) => {
      const { limit, offset } = params as { limit: number; offset: number };
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
    });

    const { items } = await allCouponBatches();

    expect(items).toHaveLength(450);
    expect(items[449].batch_id).toBe("449");
    expect(vi.mocked(adminApi.listCouponBatches).mock.calls.map((c) => (c[0] as { offset: number }).offset)).toEqual([0, 200, 400]);
  });
});
