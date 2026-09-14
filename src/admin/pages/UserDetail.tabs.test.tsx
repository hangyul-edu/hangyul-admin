/**
 * What each tab of the user detail page is for.
 *
 * 개요 answers "how is this account doing right now", so it carries the
 * account and the learner's current state. It used to show the onboarding
 * answers instead — a record of what the member said at signup, which says
 * nothing about how they are doing now and drifts out of date the moment they
 * change a setting. Those answers now have a tab of their own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { UserDetailPage } from "./UserDetail";
import { adminApi } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, userDetail: vi.fn() } };
});

vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "usr_me", scopes: ["users:read"] },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scope === "users:read",
  }),
}));

const userDetail = vi.mocked(adminApi.userDetail);

function member(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "usr_t", email: "t@talkhangyul.co.kr", name: "대상", nickname: "t",
    phone_masked: null, phone_verified: false, nationality: "KR", role: "member",
    admin_role: null, status: "active", age_consent: true, marketing_opt_in: false,
    social_providers: [], has_password: true, created_at: "2026-01-01T00:00:00Z",
    deactivated_at: null, subscription: null, recent_invoices: [], coupons: [],
    devices: [], friends_count: 0, notifications_unread: 0,
    onboarding: {
      purpose: "topik", speaking_level: null, topik_target: "4",
      daily_sentence_goal: 5, daily_question_goal: 20,
    },
    learning: {
      current_streak: 4, best_streak: 11, last_active_date: "2026-09-12",
      total_minutes: 90, sessions_30d: 6, tracks: [],
      daily_sentence_goal: 20, daily_question_goal: 20,
      effective_daily_sentence_goal: 5, effective_daily_question_goal: 5,
    },
    gamification: {
      points_balance: 250, season_points: 40, league_tier: "green",
      league_season_id: "2026-W37", attendance_days_30d: 5,
    },
    ...overrides,
  } as never;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/users/usr_t"]}>
          <Routes>
            <Route path="/users/:userId" element={<UserDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  userDetail.mockReset();
  userDetail.mockResolvedValue(member());
});

describe("개요", () => {
  it("shows the learner's current state, not their signup answers", async () => {
    renderPage();
    expect(await screen.findByText("계정 정보")).toBeInTheDocument();
    expect(screen.getByText("현재 학습·게임 현황")).toBeInTheDocument();

    // Current state: when they last studied, their streak, their standing.
    expect(screen.getByText("2026-09-12")).toBeInTheDocument();
    expect(screen.getByText("4일 (최고 11일)")).toBeInTheDocument();
    expect(screen.getByText("250P")).toBeInTheDocument();
    // The tier reads as the app names it, not as the server stores it.
    expect(screen.getByText("Green")).toBeInTheDocument();
    expect(screen.queryByText("green")).not.toBeInTheDocument();

    // The signup answers are not here.
    expect(screen.queryByText("온보딩 응답")).not.toBeInTheDocument();
    expect(screen.queryByText("학습 목적")).not.toBeInTheDocument();
  });

  it("says 리그 미배정 rather than an empty chip for a member with no standing", async () => {
    userDetail.mockResolvedValue(
      member({
        gamification: {
          points_balance: 0, season_points: 0, league_tier: null,
          league_season_id: null, attendance_days_30d: 0,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("리그 미배정")).toBeInTheDocument();
  });

  it("says so plainly when the member has never studied", async () => {
    userDetail.mockResolvedValue(
      member({
        learning: {
          current_streak: 0, best_streak: 0, last_active_date: null,
          total_minutes: 0, sessions_30d: 0, tracks: [],
          daily_sentence_goal: null, daily_question_goal: null,
          effective_daily_sentence_goal: null, effective_daily_question_goal: null,
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("학습 기록 없음")).toBeInTheDocument();
  });
});

describe("온보딩", () => {
  it("has a tab of its own holding the signup answers", async () => {
    renderPage();
    await screen.findByText("계정 정보");

    await userEvent.click(screen.getByRole("button", { name: "온보딩" }));

    expect(screen.getByText("온보딩 응답")).toBeInTheDocument();
    expect(screen.getByText("학습 목적")).toBeInTheDocument();
    expect(screen.getByText("문장 5 · 문제 20")).toBeInTheDocument();
    // …and points at where the values actually in force are shown, since the
    // two diverge as soon as the member changes a setting.
    expect(screen.getByText(/학습·게임 탭에서/)).toBeInTheDocument();
  });

  it("handles a member who never finished onboarding", async () => {
    userDetail.mockResolvedValue(member({ onboarding: null }));
    renderPage();
    await screen.findByText("계정 정보");

    await userEvent.click(screen.getByRole("button", { name: "온보딩" }));

    expect(screen.getByText("온보딩을 완료하지 않았습니다.")).toBeInTheDocument();
  });
});
