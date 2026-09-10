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
import type {
  AdminLeagueMember,
  AdminLeagueSeasonContext,
  AdminLeagueSummary,
} from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: { ...actual.adminApi, listActiveLeagues: vi.fn(), getLeague: vi.fn() },
  };
});

const listActiveLeagues = vi.mocked(adminApi.listActiveLeagues);
const getLeague = vi.mocked(adminApi.getLeague);

/** The cycle the fixtures run in, named as the member app names it. */
const SEASON: AdminLeagueSeasonContext = {
  season_id: "2026-W37",
  name: "2026 가을 시즌 2주차",
  calendar_label: "2026 가을 시즌",
  week_ordinal: 2,
  starts_at: "2026-09-07T04:00:00Z", // Mon 00:00 EDT
  ends_at: "2026-09-14T01:00:00Z", // Sun 21:00 EDT
  league_count: 4,
  participant_count: 96,
};

function league(overrides: Partial<AdminLeagueSummary> = {}): AdminLeagueSummary {
  return {
    season_id: "2026-W37",
    group_id: "grp-7f3a",
    group_ordinal: 1,
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

function renderList(
  items: AdminLeagueSummary[],
  total = items.length,
  seasons: AdminLeagueSeasonContext[] = [SEASON],
) {
  listActiveLeagues.mockResolvedValue({ items, total, page: 1, page_size: 25, seasons });
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
    season: SEASON,
    members,
    member_total: members.length,
    promote_count: members.filter((m) => m.band === "promote").length,
    demote_count: members.filter((m) => m.band === "demote").length,
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

    // Named the way the member app names a tier, and always numbered.
    expect(await screen.findByText("Yellow 리그 1그룹")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText("/ 30")).toBeInTheDocument();
    expect(screen.getByText("4,210")).toBeInTheDocument();
  });

  it("shows no internal identifier anywhere on the page", () => {
    // `grp-7f3a` and `2026-W37` are developer-facing handles. They stay in the
    // URL, which is where you get one when support needs it.
    renderList([league()]);
    return screen.findByText("Yellow 리그 1그룹").then(() => {
      expect(document.body.textContent).not.toContain("grp-7f3a");
      expect(document.body.textContent).not.toContain("2026-W37");
    });
  });

  it("asks the backend only for what is running", async () => {
    renderList([league()]);
    await screen.findByText("Yellow 리그 1그룹");

    // No status parameter: the endpoint returns active leagues and nothing
    // else, so "active" cannot be turned off from the client.
    const params = listActiveLeagues.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty("status");
    expect(params).not.toHaveProperty("closed");
  });

  it("treats a group as the league, so two groups in a tier are two rows", async () => {
    renderList([league(), league({ group_id: "grp-b21c", group_ordinal: 2, participants: 12 })]);
    await screen.findByText("Yellow 리그 1그룹");

    // Two groups in one tier are told apart by their number, not by their ids.
    expect(screen.getByText("Yellow 리그 2그룹")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("grp-b21c");
  });

  it("opens the league keyed by its season and its group", async () => {
    // Both halves are needed: the same group id in another season is another
    // league entirely.
    const user = userEvent.setup();
    renderList([league()]);
    await user.click(await screen.findByText("Yellow 리그 1그룹"));

    expect(await screen.findByText("DETAIL")).toBeInTheDocument();
  });

  it("passes the search and tier filter through", async () => {
    const user = userEvent.setup();
    renderList([league()]);
    await screen.findByText("Yellow 리그 1그룹");

    await user.type(screen.getByPlaceholderText("리그 검색 (예: Golden)"), "grp-7f3a{Enter}");

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
    await screen.findByText("Yellow 리그 1그룹");

    listActiveLeagues.mockResolvedValue({
      items: [], total: 0, page: 1, page_size: 25, seasons: [SEASON],
    });
    await user.type(screen.getByPlaceholderText("리그 검색 (예: Golden)"), "zzz{Enter}");

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
    // Two rows in the promotion zone, plus the header's own count of them.
    expect(screen.getAllByText("승급권")).toHaveLength(3);
    expect(screen.getAllByText("강등권")).toHaveLength(2);
  });

  it("shows each member's name, nickname and email", async () => {
    renderDetail([member()]);
    await screen.findByText("김하늘");

    expect(screen.getByText("haneul · haneul@talkhangyul.co.kr")).toBeInTheDocument();
  });

  it("names the league and its cycle in the app's own words", async () => {
    renderDetail([member()]);

    // The heading names the league; the chip beside it repeats the tier.
    await screen.findByText("2026 가을 시즌 2주차");
    expect(screen.getByRole("heading").textContent).toContain("Yellow 리그 1그룹");
    expect(screen.getByText("2026.09.07 ~ 2026.09.13")).toBeInTheDocument();
  });

  it("reads as name, then the numbers, then what a click does", async () => {
    renderDetail([
      member(),
      member({ user_id: "usr_2", rank: 2, band: "promote" }),
      member({ user_id: "usr_3", rank: 26, band: "demote" }),
    ]);
    await screen.findByRole("heading");

    // 1 — the league's name.
    expect(screen.getByRole("heading").textContent).toContain("Yellow 리그 1그룹");
    // 2 — how full it is and who is moving.
    const facts = document.querySelector(".hgadm-page-head__facts")!;
    expect(facts.textContent).toContain("3/30명");
    expect(facts.textContent).toContain("승급권");
    expect(facts.textContent).toContain("2명");
    expect(facts.textContent).toContain("강등권");
    expect(facts.textContent).toContain("1명");
    // 3 — the guidance, in that order below them.
    const desc = document.querySelector(".hgadm-page-head__desc")!;
    expect(desc.textContent).toBe("회원을 클릭하면 해당 회원 상세 페이지로 이동합니다.");
    expect(facts.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("counts the zones over the whole league, not the filtered view", async () => {
    // The counts come from the server precisely so a member search cannot
    // appear to change how many people are promoting.
    getLeague.mockResolvedValue({
      league: league(),
      season: SEASON,
      members: [member()],
      member_total: 28,
      promote_count: 6,
      demote_count: 4,
      promote_cutoff_rank: 6,
      demote_cutoff_rank: 25,
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/leagues/2026-W37/grp-7f3a?q=x"]}>
            <Routes>
              <Route path="/leagues/:seasonId/:groupId" element={<LeagueDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading");

    const facts = document.querySelector(".hgadm-page-head__facts")!;
    expect(facts.textContent).toContain("28/30명");
    expect(facts.textContent).toContain("6명");
    expect(facts.textContent).toContain("4명");
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
      season: SEASON,
      members: [member()],
      member_total: 2,
      promote_count: 1,
      demote_count: 0,
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

describe("the cycle above the list", () => {
  it("names the period the way the member app does, once", async () => {
    // The app never shows `2026-W37`; it groups weeks into calendar quarters
    // and labels them "2026 가을 시즌".
    renderList([league(), league({ group_id: "grp-b21c", group_ordinal: 2 })]);

    expect(await screen.findByText("2026 가을 시즌 2주차")).toBeInTheDocument();
    expect(screen.getByText("2026.09.07 ~ 2026.09.13")).toBeInTheDocument();
  });

  it("does not repeat the season and period down the table", async () => {
    // They are identical on every row, so as columns they carried nothing and
    // took the width the rows needed.
    renderList([league(), league({ group_id: "grp-b21c", group_ordinal: 2 })]);
    await screen.findByText("2026 가을 시즌 2주차");

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).not.toContain("시즌");
    expect(headers).not.toContain("기간");
    // What is left is what actually differs between leagues.
    expect(headers).toEqual(
      expect.arrayContaining(["리그", "티어", "참가자", "포인트", "상태"]),
    );
    // And the period appears once — in the header, not per row.
    expect(screen.getAllByText("2026.09.07 ~ 2026.09.13")).toHaveLength(1);
  });

  it("keeps the internal key out of the header too", async () => {
    renderList([league()]);
    await screen.findByText("2026 가을 시즌 2주차");

    expect(document.body.textContent).not.toContain("2026-W37");
  });

  it("summarises how much is running in the cycle", async () => {
    renderList([league()]);
    await screen.findByText("2026 가을 시즌 2주차");

    expect(screen.getByText("4")).toBeInTheDocument(); // league_count
    expect(screen.getByText("96")).toBeInTheDocument(); // participant_count
  });

  it("shows no header when nothing is running", async () => {
    // No open season at all — distinct from a season with no matching leagues.
    renderList([], 0, []);
    await screen.findByText("진행 중인 리그가 없습니다");

    expect(document.querySelector(".hgadm-season")).toBeNull();
  });
});

describe("tier colour", () => {
  it("paints the chip in the member app's own colour for the tier", async () => {
    // Borrowed, not re-picked: a portal Golden that differed from the app's
    // would look deliberate rather than approximate.
    renderList([
      league({ tier: "golden", group_ordinal: 1 }),
      league({ tier: "green", group_id: "grp-g", group_ordinal: 1 }),
    ]);
    await screen.findByText("Golden 리그 1그룹");

    const chips = Array.from(document.querySelectorAll(".hgadm-tier"));
    const styles = chips.map((c) => (c as HTMLElement).style.color);
    expect(styles).toContain("rgb(230, 173, 31)"); // #e6ad1f — golden
    expect(styles).toContain("rgb(87, 182, 90)"); // #57b65a — green
  });

  it("names the tier without the 리그 suffix inside the chip", async () => {
    // The suffix is already in the league name beside it.
    renderList([league()]);
    await screen.findByText("Yellow 리그 1그룹");

    expect(document.querySelector(".hgadm-tier")?.textContent).toBe("Yellow");
  });

  it("stays legible for a tier it has no colour for", async () => {
    renderList([league({ tier: "bronze" })]);
    await screen.findByText("bronze 리그 1그룹");

    const chip = document.querySelector(".hgadm-tier") as HTMLElement;
    expect(chip.textContent).toBe("bronze");
    expect(chip.style.color).toBe("");
  });
});
