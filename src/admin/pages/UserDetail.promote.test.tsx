/**
 * Promoting a member to administrator from their detail page.
 *
 * The button is a shortcut to `POST /admin/admins` — the same endpoint the
 * admin-accounts page uses, and the only one carrying the `admins:manage`
 * check. These tests pin the things the UI is responsible for: offering the
 * action only where it can succeed, refusing to fire it without a confirmation,
 * sending the tier the operator chose, and showing what the server said.
 *
 * The server re-checks every condition; hiding the button is a courtesy, never
 * the control. `test_only_admins_manage_may_promote` in
 * tests/integration/test_admin_portal_core.py is the test that actually holds
 * the boundary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { UserDetailPage } from "./UserDetail";
import { adminApi } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, userDetail: vi.fn(), grantAdmin: vi.fn(), updateUser: vi.fn() },
  };
});

let scopes: string[] = ["users:read", "users:write", "admins:manage"];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "usr_me", email: "me@talkhangyul.co.kr", name: "나", nickname: "me",
          admin_role: "super_admin", scopes },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

const userDetail = vi.mocked(adminApi.userDetail);
const grantAdmin = vi.mocked(adminApi.grantAdmin);

/** A plain, active member — the promotable case. Only the fields this page
 *  reads carry meaningful values; the rest are the empty shape it renders. */
function member(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "usr_target", email: "target@talkhangyul.co.kr", name: "대상",
    nickname: "target", phone_masked: null, phone_verified: false,
    nationality: "KR", role: "member", admin_role: null, status: "active",
    age_consent: true, marketing_opt_in: false, social_providers: [],
    has_password: true, created_at: "2026-01-01T00:00:00Z",
    deactivated_at: null, onboarding: null, subscription: null,
    recent_invoices: [],
    learning: {
      current_streak: 0, best_streak: 0, last_active_date: null,
      total_minutes: 0, sessions_30d: 0, tracks: [],
      daily_sentence_goal: null, daily_question_goal: null,
    },
    gamification: {
      points_total: 0, season_points: 0, league_tier: null,
      league_season_id: null, attendance_days_30d: 0,
    },
    coupons: [],
    ...overrides,
  } as never;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/users/usr_target"]}>
          <Routes>
            <Route path="/users/:userId" element={<UserDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const promoteButton = () => screen.queryByRole("button", { name: "관리자로 승격" });

/** The page renders the email twice (heading + detail list); either will do. */
const loaded = () => screen.findAllByText(/target@talkhangyul\.co\.kr/);

/** `Select` in the admin kit is a custom listbox, not a native <select>. */
async function chooseTier(user: ReturnType<typeof userEvent.setup>, label: string) {
  // The trigger renders the current label as plain text (see kit's Select).
  await user.click(screen.getByText("뷰어"));
  await user.click(await screen.findByRole("option", { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  scopes = ["users:read", "users:write", "admins:manage"];
});

describe("who is offered the promote action", () => {
  it("offers it for an active member", async () => {
    userDetail.mockResolvedValue(member());
    renderPage();
    await waitFor(() => expect(promoteButton()).toBeInTheDocument());
  });

  it("hides it when the target is already an administrator", async () => {
    userDetail.mockResolvedValue(member({ role: "admin", admin_role: "operator" }));
    renderPage();
    await loaded();
    expect(promoteButton()).not.toBeInTheDocument();
  });

  it("hides it without the admins:manage scope", async () => {
    scopes = ["users:read", "users:write"]; // an operator: may edit members, not admins
    userDetail.mockResolvedValue(member());
    renderPage();
    await loaded();
    expect(promoteButton()).not.toBeInTheDocument();
  });

  it("hides it on your own account", async () => {
    userDetail.mockResolvedValue(member({ user_id: "usr_me" }));
    renderPage();
    await loaded();
    expect(promoteButton()).not.toBeInTheDocument();
  });

  it("hides it for an account that is not active", async () => {
    userDetail.mockResolvedValue(member({ status: "suspended" }));
    renderPage();
    await loaded();
    expect(promoteButton()).not.toBeInTheDocument();
  });
});

describe("performing the promotion", () => {
  it("does not call the API until the change is confirmed", async () => {
    const user = userEvent.setup();
    userDetail.mockResolvedValue(member());
    renderPage();

    await user.click(await screen.findByRole("button", { name: "관리자로 승격" }));
    await user.click(screen.getByRole("button", { name: "다음" }));

    // The confirmation is on screen and nothing has been sent yet.
    expect(await screen.findByText(/관리자 권한을 부여할까요\?/)).toBeInTheDocument();
    expect(grantAdmin).not.toHaveBeenCalled();
  });

  it("sends the chosen tier and reports success", async () => {
    const user = userEvent.setup();
    userDetail.mockResolvedValue(member());
    grantAdmin.mockResolvedValue({
      user_id: "usr_target", email: "target@talkhangyul.co.kr", name: "대상",
      nickname: "target", admin_role: "support_agent", granted_by: "usr_me",
      note: null, granted_at: "2026-09-10T00:00:00Z",
    } as never);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "관리자로 승격" }));
    await chooseTier(user, "고객지원");
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "권한 부여" }));

    await waitFor(() =>
      expect(grantAdmin).toHaveBeenCalledWith({
        email: "target@talkhangyul.co.kr",
        admin_role: "support_agent",
        note: undefined,
      }),
    );
    expect(await screen.findByText(/관리자 권한을 부여했어요/)).toBeInTheDocument();
  });

  it("defaults to the least-privileged tier", async () => {
    const user = userEvent.setup();
    userDetail.mockResolvedValue(member());
    renderPage();

    await user.click(await screen.findByRole("button", { name: "관리자로 승격" }));

    // The trigger shows the preselected tier: read-only until widened.
    expect(screen.getByText("뷰어")).toBeInTheDocument();
  });

  it("surfaces a server refusal instead of claiming success", async () => {
    const user = userEvent.setup();
    userDetail.mockResolvedValue(member());
    grantAdmin.mockRejectedValue(
      Object.assign(new Error("이미 관리자입니다."), { status: 409 }),
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "관리자로 승격" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "권한 부여" }));

    await waitFor(() => expect(grantAdmin).toHaveBeenCalled());
    expect(screen.queryByText(/관리자 권한을 부여했어요/)).not.toBeInTheDocument();
  });

  it("shows the new state once the record refreshes", async () => {
    const user = userEvent.setup();
    userDetail.mockResolvedValueOnce(member());
    grantAdmin.mockResolvedValue({
      user_id: "usr_target", email: "target@talkhangyul.co.kr", name: "대상",
      nickname: "target", admin_role: "viewer", granted_by: "usr_me",
      note: null, granted_at: "2026-09-10T00:00:00Z",
    } as never);
    // What the refetch triggered by the promotion returns.
    userDetail.mockResolvedValue(member({ role: "admin", admin_role: "viewer" }));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "관리자로 승격" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "권한 부여" }));

    // The badge flips to 관리자 + tier, and the action retires itself.
    expect(await screen.findByText("뷰어")).toBeInTheDocument();
    await waitFor(() => expect(promoteButton()).not.toBeInTheDocument());
  });
});
