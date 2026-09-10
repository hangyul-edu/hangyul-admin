/**
 * "Which league is this member in?", and the timezone labelling around it.
 *
 * Two things are being pinned. The lookup answers a question about a *person*,
 * so "not placed yet" has to be as clear an answer as a league — an empty
 * result would read as a failed search. And the pages mix two clocks: the
 * league is cut on US Eastern time while every timestamp the portal renders is
 * Korean, so neither may appear without its zone named.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { LeaguesPage, UnassignedMembersPage } from "./Leagues";
import { adminApi } from "../api";
import type {
  AdminLeagueSeasonContext,
  AdminMemberLookupResult,
  AdminUnassignedMember,
} from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listActiveLeagues: vi.fn(),
      lookupMemberLeague: vi.fn(),
      listUnassignedMembers: vi.fn(),
    },
  };
});

const listActiveLeagues = vi.mocked(adminApi.listActiveLeagues);
const lookupMemberLeague = vi.mocked(adminApi.lookupMemberLeague);
const listUnassignedMembers = vi.mocked(adminApi.listUnassignedMembers);

// Call counts are asserted on, so they must not carry over between tests.
// clearAllMocks resets the recorded calls but keeps the resolved values.
beforeEach(() => vi.clearAllMocks());

/* Mon 00:00 EDT → Sun 21:00 EDT — the league's real boundaries, in summer. */
const SUMMER: AdminLeagueSeasonContext = {
  season_id: "2026-W28",
  name: "2026 여름 시즌 6주차",
  calendar_label: "2026 여름 시즌",
  week_ordinal: 6,
  starts_at: "2026-07-06T04:00:00Z",
  ends_at: "2026-07-13T01:00:00Z",
  league_count: 8,
  participant_count: 187,
  unassigned_count: 42,
};
/* The same wall-clock week in winter, when ET is an hour further from Korea. */
const WINTER: AdminLeagueSeasonContext = {
  ...SUMMER,
  name: "2026 겨울 시즌 2주차",
  starts_at: "2026-01-05T05:00:00Z",
  ends_at: "2026-01-12T02:00:00Z",
};

function found(overrides: Partial<AdminMemberLookupResult> = {}): AdminMemberLookupResult {
  return {
    user_id: "usr_1",
    name: "김하늘",
    nickname: "haneul",
    email: "haneul@talkhangyul.co.kr",
    status: "active",
    role: "member",
    assignment: {
      season_id: "2026-W28",
      group_id: "grp-7f3a",
      group_ordinal: 1,
      tier: "golden",
      rank: 3,
      points: 1820,
      band: "promote",
      participants: 28,
      season_name: SUMMER.name,
      starts_at: SUMMER.starts_at,
      ends_at: SUMMER.ends_at,
    },
    ...overrides,
  };
}

function renderLeagues(entry = "/leagues?member=김하늘") {
  listActiveLeagues.mockResolvedValue({
    items: [], total: 0, page: 1, page_size: 25, seasons: [SUMMER],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/leagues" element={<LeaguesPage />} />
            <Route path="/leagues/unassigned" element={<Probe />} />
            <Route path="/leagues/:seasonId/:groupId" element={<Probe />} />
            <Route path="/users/:userId" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function Probe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

describe("looking a member up", () => {
  it("names the league they are in, in the app's own words", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [found()], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();

    expect(await screen.findByText("Golden 리그 1그룹")).toBeInTheDocument();
    expect(screen.getByText("김하늘")).toBeInTheDocument();
  });

  it("shows their rank and points", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [found()], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();
    await screen.findByText("Golden 리그 1그룹");

    expect(screen.getByText("3 / 28")).toBeInTheDocument();
    expect(screen.getByText("1,820")).toBeInTheDocument();
    expect(screen.getByText("승급권")).toBeInTheDocument();
  });

  it("labels the league period with its timezone", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [found()], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();
    await screen.findByText("Golden 리그 1그룹");

    expect(screen.getByText(/2026\.07\.06 ~ 2026\.07\.12 \(ET\)/)).toBeInTheDocument();
  });

  it("opens that league's detail page", async () => {
    const user = userEvent.setup();
    lookupMemberLeague.mockResolvedValue({
      items: [found()], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();
    await user.click(await screen.findByText("Golden 리그 1그룹"));

    expect(screen.getByTestId("path").textContent).toBe("/leagues/2026-W28/grp-7f3a");
  });

  it("also opens the member's own account", async () => {
    const user = userEvent.setup();
    lookupMemberLeague.mockResolvedValue({
      items: [found()], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();
    await user.click(await screen.findByText("김하늘"));

    expect(screen.getByTestId("path").textContent).toBe("/users/usr_1");
  });

  it("says plainly when the member has not been placed, and offers the queue", async () => {
    // An empty result would read as "no such member"; this is a different
    // answer and has to look like one.
    const user = userEvent.setup();
    lookupMemberLeague.mockResolvedValue({
      items: [found({ assignment: null })], total: 1, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();

    expect(await screen.findByText("미배정")).toBeInTheDocument();
    expect(
      screen.getByText("이번 주 학습 기록이 없어 아직 리그에 배정되지 않았습니다."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /미배정 회원 보기/ }));
    expect(screen.getByTestId("path").textContent).toBe("/leagues/unassigned");
  });

  it("lists every match rather than guessing which person was meant", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [
        found({ user_id: "usr_1", name: "김하늘" }),
        found({ user_id: "usr_2", name: "김하늘 (다른 계정)", assignment: null }),
      ],
      total: 2,
      truncated: false,
      seasons: [SUMMER],
    });
    renderLeagues();

    expect(await screen.findByText(/2명이 검색되었습니다/)).toBeInTheDocument();
    expect(screen.getByText("김하늘")).toBeInTheDocument();
    expect(screen.getByText("김하늘 (다른 계정)")).toBeInTheDocument();
    // One of each answer, side by side and comparable.
    expect(screen.getByText("Golden 리그 1그룹")).toBeInTheDocument();
    expect(screen.getByText("미배정")).toBeInTheDocument();
  });

  it("warns when the search matched more than it returned", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [found(), found({ user_id: "usr_2", name: "김하늘 2" })],
      total: 2,
      truncated: true,
      seasons: [SUMMER],
    });
    renderLeagues();

    expect(await screen.findByText(/결과가 많아 일부만 표시합니다/)).toBeInTheDocument();
  });

  it("says nobody matched, rather than showing an empty list", async () => {
    lookupMemberLeague.mockResolvedValue({
      items: [], total: 0, truncated: false, seasons: [SUMMER],
    });
    renderLeagues();

    expect(await screen.findByText("일치하는 회원이 없습니다")).toBeInTheDocument();
  });

  it("asks for nothing until something is typed", async () => {
    renderLeagues("/leagues");
    await screen.findByText("2026 여름 시즌 6주차");

    expect(lookupMemberLeague).not.toHaveBeenCalled();
  });

  it("searches on the identifiers an admin would have", async () => {
    const user = userEvent.setup();
    lookupMemberLeague.mockResolvedValue({
      items: [], total: 0, truncated: false, seasons: [SUMMER],
    });
    renderLeagues("/leagues");
    await screen.findByText("2026 여름 시즌 6주차");

    await user.type(
      screen.getByPlaceholderText("회원 이름·닉네임·이메일 검색"),
      "haneul@talkhangyul.co.kr{Enter}",
    );

    expect(lookupMemberLeague).toHaveBeenCalledWith({ q: "haneul@talkhangyul.co.kr" });
  });
});

describe("the two clocks on the unassigned page", () => {
  function member(): AdminUnassignedMember {
    return {
      user_id: "usr_1",
      name: "김하늘",
      nickname: "haneul",
      email: "haneul@talkhangyul.co.kr",
      status: "active",
      role: "member",
      created_at: "2026-01-02T00:00:00Z",
      // 2026-07-09 02:00 UTC is 11:00 in Seoul.
      last_activity_at: "2026-07-09T02:00:00Z",
      days_since_activity: 3,
      never_studied: false,
      days_since_signup: 250,
      idle_days: 3,
      lapsed: false,
      last_tier: "yellow",
      last_season_points: 420,
    };
  }

  function renderUnassigned(season: AdminLeagueSeasonContext = SUMMER) {
    listUnassignedMembers.mockResolvedValue({
      items: [member()], total: 1, page: 1, page_size: 25,
      lapsed_total: 0, lapse_after_days: 30, seasons: [season],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/leagues/unassigned"]}>
            <Routes>
              <Route path="/leagues/unassigned" element={<UnassignedMembersPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it("states the league period in ET, with the zone it was on", async () => {
    renderUnassigned();
    await screen.findByText("김하늘");

    const zones = document.querySelector(".hgadm-zones")!;
    expect(zones.textContent).toContain("리그 기간");
    expect(zones.textContent).toContain("ET");
    expect(zones.textContent).toContain("2026.07.06 (월) 00:00 ~ 2026.07.12 (일) 21:00");
    expect(zones.textContent).toContain("EDT");
  });

  it("states the same period in Korean time beside it", async () => {
    renderUnassigned();
    await screen.findByText("김하늘");

    const zones = document.querySelector(".hgadm-zones")!;
    expect(zones.textContent).toContain("KST");
    // 13 hours ahead in summer; the Sunday close is already Monday in Seoul.
    expect(zones.textContent).toContain("2026.07.06 (월) 13:00 ~ 2026.07.13 (월) 10:00");
  });

  it("uses the winter offset for a winter week", async () => {
    // 14 hours, not 13 — the reason neither range may be a stored constant.
    renderUnassigned(WINTER);
    await screen.findByText("김하늘");

    const zones = document.querySelector(".hgadm-zones")!;
    expect(zones.textContent).toContain("EST");
    expect(zones.textContent).toContain("2026.01.05 (월) 14:00 ~ 2026.01.12 (월) 11:00");
  });

  it("names the timezone of the last-activity column", async () => {
    // The one that used to be ambiguous: a Korean timestamp in a column next
    // to an Eastern period, with nothing saying which was which.
    renderUnassigned();
    await screen.findByText("김하늘");

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("마지막 학습 (KST)");
  });

  it("renders that timestamp in Korean time, to the second", async () => {
    renderUnassigned();
    await screen.findByText("김하늘");

    const time = document.querySelector("tbody time")!;
    expect(time.textContent).toContain("2026. 07. 09.");
    expect(time.textContent).toContain("오전 11:00:00");
  });

  it("shows no bare, unlabelled date range anywhere", async () => {
    renderUnassigned();
    await screen.findByText("김하늘");

    // Every period on the page carries ET or KST; a range with neither is the
    // ambiguity this page was reported for.
    const bare = /\d{4}\.\d{2}\.\d{2} ~ \d{4}\.\d{2}\.\d{2}(?!.*(ET|KST))/;
    const zones = document.querySelector(".hgadm-zones")!.textContent ?? "";
    expect(zones).toMatch(/ET/);
    expect(document.querySelector(".hgadm-kicker")?.textContent ?? "").not.toMatch(bare);
  });
});
