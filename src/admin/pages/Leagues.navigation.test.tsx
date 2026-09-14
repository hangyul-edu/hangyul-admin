/**
 * League detail → member → back.
 *
 * The user detail page is reachable from two places now, and its back link
 * used to be hard-coded to the user directory — so an admin who arrived from a
 * league was dropped into user management and had to find their way back. This
 * exercises the whole round trip through the real components and the real
 * router, because the bug lived in the seam between them: each page in
 * isolation looked correct.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { LeagueDetailPage } from "./Leagues";
import { UserDetailPage } from "./UserDetail";
import { adminApi } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, getLeague: vi.fn(), userDetail: vi.fn() },
  };
});
vi.mock("../auth", async () => {
  const actual = await vi.importActual<typeof import("../auth")>("../auth");
  return {
    ...actual,
    useAdminAuth: () => ({
      can: () => true,
      me: { user_id: "usr_admin", admin_role: "super_admin", scopes: [] },
    }),
  };
});

const SEASON = {
  season_id: "2026-W37",
  name: "2026 가을 시즌 2주차",
  calendar_label: "2026 가을 시즌",
  week_ordinal: 2,
  starts_at: "2026-09-07T04:00:00Z",
  ends_at: "2026-09-14T01:00:00Z",
  league_count: 4,
  participant_count: 96,
  unassigned_count: 37,
};

const LEAGUE = {
  season_id: "2026-W37",
  group_id: "grp-7f3a",
  group_ordinal: 1,
  tier: "yellow",
  tier_label: "Yellow League",
  season_name: "Season 2026-W37",
  starts_at: SEASON.starts_at,
  ends_at: SEASON.ends_at,
  status: "active",
  participants: 2,
  capacity: 30,
  total_points: 900,
  top_points: 620,
  promote_cutoff_rank: 6,
  demote_cutoff_rank: 25,
};

const MEMBER = {
  user_id: "usr_1",
  name: "김하늘",
  nickname: "haneul",
  email: "haneul@talkhangyul.co.kr",
  account_status: "active",
  role: "member",
  rank: 1,
  points: 620,
  band: "promote",
  outcome: null,
  last_activity_at: "2026-09-10T04:05:42Z",
};

/** Enough of a user detail for the page to render its header. */
const USER = {
  user_id: "usr_1",
  email: "haneul@talkhangyul.co.kr",
  name: "김하늘",
  nickname: "haneul",
  phone_masked: null,
  role: "member",
  status: "active",
  created_at: "2026-01-02T00:00:00Z",
  deactivated_at: null,
  social_providers: [],
  onboarding: null,
  subscription: null,
  invoices: [],
  /* Both are non-optional on AdminUserDetail. They were null here because the
     overview did not read them; it shows the learner's current state now, so
     the fixture has to describe a whole user. */
  learning: {
    current_streak: 3,
    best_streak: 9,
    last_active_date: "2026-09-12",
    total_minutes: 120,
    sessions_30d: 7,
    tracks: [],
    daily_sentence_goal: 5,
    daily_question_goal: 5,
    effective_daily_sentence_goal: 5,
    effective_daily_question_goal: 5,
  },
  gamification: {
    points_balance: 250,
    season_points: 40,
    league_tier: "green",
    league_season_id: "2026-W37",
    attendance_days_30d: 5,
  },
  coupons: [],
  devices: [],
  friend_count: 0,
  unread_notifications: 0,
};

/** Reports the current path so the round trip can be asserted on. */
function Probe() {
  const location = useLocation();
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>;
}

function renderApp(entry: string) {
  vi.mocked(adminApi.getLeague).mockResolvedValue({
    league: LEAGUE,
    season: SEASON,
    members: [MEMBER],
    member_total: 1,
    promote_count: 1,
    demote_count: 0,
    promote_cutoff_rank: 6,
    demote_cutoff_rank: 25,
  } as never);
  vi.mocked(adminApi.userDetail).mockResolvedValue(USER as never);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Probe />
          <Routes>
            <Route path="/leagues/:seasonId/:groupId" element={<LeagueDetailPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
            <Route path="/users" element={<div>USER_DIRECTORY</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const path = () => screen.getByTestId("path").textContent;

describe("league detail → member → back", () => {
  it("returns to the league, not to the user directory", async () => {
    const user = userEvent.setup();
    renderApp("/leagues/2026-W37/grp-7f3a");

    await user.click(await screen.findByText("김하늘"));
    expect(path()).toBe("/users/usr_1");

    // The back link names the league it came from, not "사용자 목록".
    const back = await screen.findByRole("link", { name: /Yellow 리그/ });
    await user.click(back);

    expect(path()).toBe("/leagues/2026-W37/grp-7f3a");
    expect(screen.queryByText("USER_DIRECTORY")).not.toBeInTheDocument();
  });

  it("brings the league's filter back with it", async () => {
    // The member search is in the query string; losing it would drop the admin
    // back into an unfiltered 30-row table.
    const user = userEvent.setup();
    renderApp("/leagues/2026-W37/grp-7f3a?q=%EA%B9%80%ED%95%98%EB%8A%98");

    await user.click(await screen.findByText("김하늘"));
    await user.click(await screen.findByRole("link", { name: /Yellow 리그/ }));

    expect(path()).toBe("/leagues/2026-W37/grp-7f3a?q=%EA%B9%80%ED%95%98%EB%8A%98");
  });

  it("asks the league to restore where it was scrolled to", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as never;
    Object.defineProperty(window, "scrollY", { value: 480, configurable: true });

    renderApp("/leagues/2026-W37/grp-7f3a");
    await user.click(await screen.findByText("김하늘"));
    await user.click(await screen.findByRole("link", { name: /Yellow 리그/ }));

    expect(scrollTo).toHaveBeenCalledWith(0, 480);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("a direct visit to a user detail page", () => {
  it("still offers the user directory, as before", async () => {
    renderApp("/users/usr_1");

    const back = await screen.findByRole("link", { name: /사용자 목록/ });
    expect(back).toHaveAttribute("href", "/users");
  });

  it("does not invent a back link from a bogus origin", async () => {
    // Location state is not a trusted input: only an internal path is honoured.
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(adminApi.userDetail).mockResolvedValue(USER as never);
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter
            initialEntries={[
              { pathname: "/users/usr_1", state: { from: { to: "https://evil.test", label: "x" } } },
            ]}
          >
            <Routes>
              <Route path="/users/:userId" element={<UserDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    const back = await screen.findByRole("link", { name: /사용자 목록/ });
    expect(back).toHaveAttribute("href", "/users");
    expect(user).toBeTruthy();
  });
});
