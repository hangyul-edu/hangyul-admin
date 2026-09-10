/**
 * The Active Leagues page and its detail view.
 *
 * The behaviour worth pinning is not that the table renders — it is the two
 * decisions the page embodies. A league is a *group*, so a row is keyed by
 * season and group and the link carries both; and this page deliberately owns
 * no user management, so clicking a member hands off to the user detail page
 * that already exists rather than opening anything of its own.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { LeagueDetailPage, LeaguesPage } from "./Leagues";
import { adminApi } from "../api";
import type { AdminLeagueMember, AdminLeagueSummary } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, listActiveLeagues: vi.fn(), getLeague: vi.fn() },
  };
});

const listActiveLeagues = vi.mocked(adminApi.listActiveLeagues);
const getLeague = vi.mocked(adminApi.getLeague);

function league(overrides: Partial<AdminLeagueSummary> = {}): AdminLeagueSummary {
  return {
    season_id: "2026-W37",
    group_id: "grp-7f3a",
    tier: "yellow",
    tier_label: "Yellow League",
    season_name: "Season 2026-W37",
    starts_at: "2026-09-07T00:00:00Z",
    ends_at: "2026-09-13T12:00:00Z",
    status: "active",
    participants: 28,
    capacity: 30,
    total_points: 4210,
    top_points: 620,
    promote_cutoff_rank: 6,
    demote_cutoff_rank: 25,
    ...overrides,
  };
}

function member(overrides: Partial<AdminLeagueMember> = {}): AdminLeagueMember {
  return {
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
    ...overrides,
  };
}

function renderList(items: AdminLeagueSummary[], total = items.length) {
  listActiveLeagues.mockResolvedValue({
    items,
    total,
    page: 1,
    page_size: 25,
    season_ids: ["2026-W37"],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/leagues"]}>
          <Routes>
            <Route path="/leagues" element={<LeaguesPage />} />
            <Route path="/leagues/:seasonId/:groupId" element={<div>DETAIL</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function renderDetail(members: AdminLeagueMember[], overrides: Partial<AdminLeagueSummary> = {}) {
  getLeague.mockResolvedValue({
    league: league(overrides),
    members,
    member_total: members.length,
    promote_cutoff_rank: 6,
    demote_cutoff_rank: 25,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/leagues/2026-W37/grp-7f3a"]}>
          <Routes>
            <Route path="/leagues/:seasonId/:groupId" element={<LeagueDetailPage />} />
            <Route path="/users/:userId" element={<div>USER_DETAIL_PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("the active leagues list", () => {
  it("shows what an admin needs to size up a league at a glance", async () => {
    renderList([league()]);

    expect(await screen.findByText("Yellow League")).toBeInTheDocument();
    expect(screen.getByText("grp-7f3a")).toBeInTheDocument();
    expect(screen.getByText("2026-W37")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("/ 30")).toBeInTheDocument();
    expect(screen.getByText("4,210")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
  });

  it("asks the backend only for what is running", async () => {
    renderList([league()]);
    await screen.findByText("Yellow League");

    // No status parameter: the endpoint returns active leagues and nothing
    // else, so "active" cannot be turned off from the client.
    const params = listActiveLeagues.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("status");
    expect(params).not.toHaveProperty("closed");
  });

  it("treats a group as the league, so two groups in a tier are two rows", async () => {
    renderList([league(), league({ group_id: "grp-b21c", participants: 12 })]);
    await screen.findByText("grp-7f3a");

    expect(screen.getByText("grp-b21c")).toBeInTheDocument();
    expect(screen.getAllByText("Yellow League")).toHaveLength(2);
  });

  it("opens the league keyed by its season and its group", async () => {
    // Both halves are needed: the same group id in another season is another
    // league entirely.
    const user = userEvent.setup();
    renderList([league()]);
    await user.click(await screen.findByText("grp-7f3a"));

    expect(await screen.findByText("DETAIL")).toBeInTheDocument();
  });

  it("passes the search and tier filter through", async () => {
    const user = userEvent.setup();
    renderList([league()]);
    await screen.findByText("Yellow League");

    await user.type(screen.getByPlaceholderText("그룹 ID·시즌·티어 검색"), "grp-7f3a{Enter}");

    await waitFor(() =>
      expect(listActiveLeagues).toHaveBeenCalledWith(
        expect.objectContaining({ q: "grp-7f3a" }),
      ),
    );
  });

  it("says so plainly when nothing is running", async () => {
    renderList([]);

    expect(await screen.findByText("진행 중인 리그가 없습니다")).toBeInTheDocument();
    expect(
      screen.getByText("시즌이 시작되고 참가자가 배정되면 여기에 표시됩니다."),
    ).toBeInTheDocument();
  });

  it("distinguishes an empty search from an empty league table", async () => {
    // "No leagues at all" and "none matched your filter" call for different
    // next actions, so they must not share one message.
    const user = userEvent.setup();
    renderList([league()]);
    await screen.findByText("Yellow League");

    listActiveLeagues.mockResolvedValue({
      items: [], total: 0, page: 1, page_size: 25, season_ids: ["2026-W37"],
    });
    await user.type(screen.getByPlaceholderText("그룹 ID·시즌·티어 검색"), "zzz{Enter}");

    expect(await screen.findByText("조건에 맞는 리그가 없습니다")).toBeInTheDocument();
  });
});

describe("the league detail", () => {
  it("ranks the members and shows their standing", async () => {
    renderDetail([
      member(),
      member({ user_id: "usr_2", name: "박서준", nickname: "seojun", rank: 2, points: 480, band: "promote" }),
      member({ user_id: "usr_3", name: "이도현", nickname: "dohyeon", rank: 28, points: 10, band: "demote" }),
    ]);

    await screen.findByText("김하늘");
    expect(screen.getByText("620")).toBeInTheDocument();
    expect(screen.getByText("480")).toBeInTheDocument();
    expect(screen.getAllByText("승급권")).toHaveLength(2);
    expect(screen.getByText("강등권")).toBeInTheDocument();
  });

  it("shows each member's name, nickname and email", async () => {
    renderDetail([member()]);
    await screen.findByText("김하늘");

    expect(screen.getByText("haneul · haneul@talkhangyul.co.kr")).toBeInTheDocument();
  });

  it("names the league, its season and its window", async () => {
    renderDetail([member()]);

    expect(await screen.findByText(/Yellow League/)).toBeInTheDocument();
    expect(screen.getByText("grp-7f3a")).toBeInTheDocument();
    expect(screen.getByText(/2026-W37/)).toBeInTheDocument();
    expect(screen.getByText(/상위 6위까지 승급/)).toBeInTheDocument();
  });

  it("sends a clicked member to the existing user detail page", async () => {
    // The whole point of the click-through: this page owns no user management
    // of its own, so it must hand off rather than duplicate.
    const user = userEvent.setup();
    renderDetail([member()]);
    await user.click(await screen.findByText("김하늘"));

    expect(await screen.findByText("USER_DETAIL_PAGE")).toBeInTheDocument();
  });

  it("falls back to the email, then the id, when a name is missing", async () => {
    renderDetail([
      member({ user_id: "usr_9", name: null, nickname: null, email: "only@talkhangyul.co.kr" }),
    ]);

    // Shown once, as the primary label — not repeated on the line below it.
    expect(await screen.findByText("only@talkhangyul.co.kr")).toHaveClass("hgadm-cell-main");
    expect(screen.queryByText("only@talkhangyul.co.kr", { selector: ".hgadm-truncate" }))
      .not.toBeInTheDocument();
  });

  it("still lists a member whose account has been deleted", async () => {
    // The standing row outlives the account; dropping them would renumber the
    // league and make the ranks disagree with the app.
    renderDetail([
      member({ user_id: "usr_gone", name: null, nickname: null, email: null, account_status: null }),
    ]);

    expect(await screen.findByText("usr_gone")).toHaveClass("hgadm-cell-main");
    expect(screen.getByText("삭제됨")).toBeInTheDocument();
  });

  it("says so when a league has nobody in it", async () => {
    renderDetail([]);

    expect(await screen.findByText("참가자가 없습니다")).toBeInTheDocument();
  });

  it("filters members and reports how many of the total are showing", async () => {
    const user = userEvent.setup();
    renderDetail([member(), member({ user_id: "usr_2", name: "박서준" })]);
    await screen.findByText("김하늘");

    getLeague.mockResolvedValue({
      league: league(),
      members: [member()],
      member_total: 2,
      promote_cutoff_rank: 6,
      demote_cutoff_rank: 25,
    });
    await user.type(screen.getByPlaceholderText("이름·닉네임·이메일 검색"), "김하늘{Enter}");

    await waitFor(() =>
      expect(getLeague).toHaveBeenCalledWith("2026-W37", "grp-7f3a", { q: "김하늘" }),
    );
    expect(await screen.findByText(/1명 표시 \/ 전체 2명/)).toBeInTheDocument();
  });
});

describe("long values do not break the layout", () => {
  const LONG_EMAIL = "someone.with.a.really.rather.long.address@subdomain.talkhangyul.co.kr";

  it("truncates the secondary identity line rather than widening the table", async () => {
    renderDetail([member({ nickname: "아주긴닉네임입니다정말로", email: LONG_EMAIL })]);
    await screen.findByText("김하늘");

    const line = screen.getByText(`아주긴닉네임입니다정말로 · ${LONG_EMAIL}`);
    expect(line).toHaveClass("hgadm-truncate");
  });

  it("keeps a long name visible in full as the primary label", async () => {
    // The name is the identifier; it wraps if it must, but is never cut.
    renderDetail([member({ name: "Alexandra Konstantinopoulos-Wren" })]);

    expect(await screen.findByText("Alexandra Konstantinopoulos-Wren")).toBeInTheDocument();
  });
});
