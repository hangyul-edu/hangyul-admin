/**
 * Changing someone's admin access changes their member record too (role
 * admin ↔ member, and the tier badge on their detail page). The user screens
 * cache both, so the admin-accounts page must mark them stale — otherwise the
 * directory keeps showing a revoked admin as 관리자 until the cache ages out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { AdminAccount } from "../api";

const listAdmins = vi.fn();
const revokeAdmin = vi.fn();
const grantAdmin = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listAdmins: () => listAdmins(),
      revokeAdmin: (id: string) => revokeAdmin(id),
      grantAdmin: (b: unknown) => grantAdmin(b),
    },
  };
});
vi.mock("../auth", () => ({
  useAdminAuth: () => ({ me: { user_id: "usr_me" }, can: () => true }),
}));

const { AdminsPage } = await import("./Admins");

const OTHER: AdminAccount = {
  user_id: "usr_other",
  email: "ops@talkhangyul.co.kr",
  name: "운영 담당",
  nickname: null,
  admin_role: "operator",
  granted_by: "usr_me",
  note: null,
  granted_at: "2026-09-01T00:00:00Z",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/admins"]}>
          <AdminsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return invalidate;
}

beforeEach(() => {
  [listAdmins, revokeAdmin, grantAdmin].forEach((m) => m.mockReset());
  listAdmins.mockResolvedValue({ items: [OTHER] });
  revokeAdmin.mockResolvedValue(undefined);
  grantAdmin.mockResolvedValue(OTHER);
});

describe("AdminsPage", () => {
  it("marks the user directory and detail stale after revoking", async () => {
    const invalidate = renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "권한 회수" }));
    await userEvent.click(screen.getByRole("button", { name: "회수" }));
    await waitFor(() => expect(revokeAdmin).toHaveBeenCalledWith("usr_other"));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "users"] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "user"] });
  });

  it("marks the user screens stale after granting", async () => {
    const invalidate = renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "+ 관리자 추가" }));
    await userEvent.type(screen.getByLabelText(/대상 이메일/), "new@talkhangyul.co.kr");
    await userEvent.click(screen.getByRole("button", { name: "권한 부여" }));
    await waitFor(() =>
      expect(grantAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new@talkhangyul.co.kr", admin_role: "viewer" }),
      ),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin", "users"] }),
    );
  });
});
