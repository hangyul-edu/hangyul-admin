/**
 * The Unassigned Members page, and the schedule block that links to it.
 *
 * This list is a work queue, not a report: everyone on it has failed to study
 * this week, and the question an admin brings to it is "who should we nudge".
 * So the things pinned here are the ones that answer that — dormancy is
 * visible at a glance, the longest-idle are not buried, and a member is one
 * click from their account with a way back.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { LeaguesPage, UnassignedMembersPage } from "./Leagues";
import { adminApi } from "../api";
import type { AdminLeagueSeasonContext, AdminUnassignedMember } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listUnassignedMembers: vi.fn(),
      listActiveLeagues: vi.fn(),
    },
  };
});

const listUnassignedMembers = vi.mocked(adminApi.listUnassignedMembers);
const listActiveLeagues = vi.mocked(adminApi.listActiveLeagues);

/* A summer week: Mon 00:00 EDT → Sun 21:00 EDT. */
const SEASON: AdminLeagueSeasonContext = {
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

function waiting(overrides: Partial<AdminUnassignedMember> = {}): AdminUnassignedMember {
  return {
    user_id: "usr_1",
    name: "김하늘",
    nickname: "haneul",
    email: "haneul@talkhangyul.co.kr",
    status: "active",
    role: "member",
    created_at: "2026-01-02T00:00:00Z",
    last_activity_at: "2026-07-04T02:00:00Z",
    days_since_activity: 3,
    never_studied: false,
    days_since_signup: 250,
    idle_days: 3,
    lapsed: false,
    last_tier: "yellow",
    last_season_points: 420,
    ...overrides,
  };
}

function renderPage(items: AdminUnassignedMember[], overrides = {}) {
  listUnassignedMembers.mockResolvedValue({
    items,
    total: items.length,
    page: 1,
    page_size: 25,
    lapsed_total: items.filter((m) => m.lapsed).length,
    lapse_after_days: 30,
    seasons: [SEASON],
    ...overrides,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/leagues/unassigned"]}>
          <Routes>
            <Route path="/leagues/unassigned" element={<UnassignedMembersPage />} />
            <Route path="/users/:userId" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Stands in for the user detail page, reporting how it was reached. */
function Probe() {
  const location = useLocation();
  const state = location.state as { from?: { to: string; label: string } } | null;
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="back">{state?.from ? `${state.from.label}|${state.from.to}` : "none"}</div>
    </div>
  );
}

describe("the waiting list", () => {
  it("shows who they are and how long they have been idle", async () => {
    renderPage([waiting()]);

    expect(await screen.findByText("김하늘")).toBeInTheDocument();
    expect(screen.getByText("haneul · haneul@talkhangyul.co.kr")).toBeInTheDocument();
    // The elapsed count sits under the state badge, saying what it measures.
    expect(screen.getByText("3일째 학습 없음")).toBeInTheDocument();
  });

  it("marks a lapsed account so it stands out from one merely waiting", async () => {
    renderPage([
      waiting(),
      waiting({ user_id: "usr_2", name: "박서준", days_since_activity: 61, idle_days: 61, lapsed: true }),
    ]);
    await screen.findByText("김하늘");

    // "장기 미학습" is also a header label, so read the table body's badges.
    const badges = Array.from(document.querySelectorAll("tbody .hgadm-badge"));
    const labels = badges.map((b) => b.textContent);
    expect(labels).toContain("대기");
    const lapsed = badges.find((b) => b.textContent === "장기 미학습")!;
    expect(lapsed).toHaveClass("hgadm-badge--danger");
  });

  it("says plainly when an account has never studied at all", async () => {
    // No date to show, and the row must not imply one.
    renderPage([
      waiting({
        last_activity_at: null, days_since_activity: null,
        never_studied: true, days_since_signup: 3, idle_days: 3, lapsed: false,
      }),
    ]);
    await screen.findByText("김하늘");

    expect(screen.getByText("학습 기록 없음")).toBeInTheDocument();
  });

  it("does not call a brand-new account lapsed", async () => {
    // The reported bug: a tester created days ago showed as dormant, because
    // "never studied" was being read as infinitely idle.
    renderPage([
      waiting({
        last_activity_at: null, days_since_activity: null,
        never_studied: true, days_since_signup: 2, idle_days: 2, lapsed: false,
      }),
    ]);
    await screen.findByText("김하늘");

    const badge = document.querySelector("tbody .hgadm-badge")!;
    expect(badge.textContent).toBe("신규 가입");
    expect(badge).not.toHaveClass("hgadm-badge--danger");
    // And it says which clock the number came from.
    expect(screen.getByText("가입 후 2일")).toBeInTheDocument();
  });

  it("does call an old account that never started lapsed", async () => {
    renderPage([
      waiting({
        last_activity_at: null, days_since_activity: null,
        never_studied: true, days_since_signup: 200, idle_days: 200, lapsed: true,
      }),
    ]);
    await screen.findByText("김하늘");

    expect(document.querySelector("tbody .hgadm-badge")!.textContent).toBe("장기 미학습");
    expect(screen.getByText("가입 후 200일")).toBeInTheDocument();
  });

  it("says how long a lapsed studier has been idle", async () => {
    renderPage([waiting({ days_since_activity: 61, idle_days: 61, lapsed: true })]);
    await screen.findByText("김하늘");

    expect(screen.getByText("61일째 학습 없음")).toBeInTheDocument();
  });

  it("names the league they were in last, without its id", async () => {
    renderPage([waiting()]);
    await screen.findByText("김하늘");

    expect(document.querySelector(".hgadm-tier")?.textContent).toBe("Yellow");
    expect(screen.getByText(/420P/)).toBeInTheDocument();
  });

  it("distinguishes someone who has never been in a league", async () => {
    renderPage([waiting({ last_tier: null, last_season_points: null })]);
    await screen.findByText("김하늘");

    expect(screen.getByText("첫 참가 대기")).toBeInTheDocument();
  });

  it("reports the size of the queue and how much of it is dormant", async () => {
    renderPage([
      waiting(),
      waiting({ user_id: "usr_2", name: "박서준", idle_days: 40, lapsed: true }),
      waiting({ user_id: "usr_3", name: "이도현", idle_days: 40, lapsed: true }),
    ]);
    await screen.findByText("이도현");

    const facts = document.querySelector(".hgadm-page-head__facts")!;
    expect(facts.textContent).toContain("3명");
    expect(facts.textContent).toContain("2명");
  });

  it("filters to the lapsed ones on request", async () => {
    const user = userEvent.setup();
    renderPage([waiting()]);
    await screen.findByText("김하늘");

    await user.click(screen.getByText("전체 미배정 회원"));
    await user.click(await screen.findByRole("option", { name: "장기 미학습만" }));

    await waitFor(() =>
      expect(listUnassignedMembers).toHaveBeenCalledWith(
        expect.objectContaining({ lapsed: "true" }),
      ),
    );
  });

  it("says so when the queue is empty", async () => {
    renderPage([]);

    expect(await screen.findByText("모든 회원이 리그에 배정되었습니다")).toBeInTheDocument();
  });

  it("uses different wording when a filter emptied it", async () => {
    const user = userEvent.setup();
    renderPage([waiting()]);
    await screen.findByText("김하늘");

    listUnassignedMembers.mockResolvedValue({
      items: [], total: 0, page: 1, page_size: 25, lapsed_total: 0, lapse_after_days: 30, seasons: [SEASON],
    });
    await user.type(screen.getByPlaceholderText("이름·닉네임·이메일 검색"), "zzz{Enter}");

    expect(await screen.findByText("조건에 맞는 회원이 없습니다")).toBeInTheDocument();
  });

  it("keeps the 회원 상세 페이지 wording in its guidance", async () => {
    renderPage([waiting()]);
    await screen.findByText("김하늘");

    expect(
      screen.getByText(/회원을 클릭하면 해당 회원 상세 페이지로 이동합니다/),
    ).toBeInTheDocument();
  });
});

describe("opening a member from the waiting list", () => {
  it("goes to the user detail page, carrying the way back", async () => {
    const user = userEvent.setup();
    renderPage([waiting()]);
    await user.click(await screen.findByText("김하늘"));

    expect(screen.getByTestId("path").textContent).toBe("/users/usr_1");
    expect(screen.getByTestId("back").textContent).toBe(
      "리그 미배정 회원|/leagues/unassigned",
    );
  });

  it("brings the search back with it", async () => {
    const user = userEvent.setup();
    listUnassignedMembers.mockResolvedValue({
      items: [waiting()], total: 1, page: 1, page_size: 25,
      lapsed_total: 0, lapse_after_days: 30, seasons: [SEASON],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/leagues/unassigned?q=haneul&lapsed=1"]}>
            <Routes>
              <Route path="/leagues/unassigned" element={<UnassignedMembersPage />} />
              <Route path="/users/:userId" element={<Probe />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByText("김하늘"));

    expect(screen.getByTestId("back").textContent).toBe(
      "리그 미배정 회원|/leagues/unassigned?q=haneul&lapsed=1",
    );
  });
});

describe("the schedule on the leagues page", () => {
  function renderLeagues(season: AdminLeagueSeasonContext = SEASON) {
    listActiveLeagues.mockResolvedValue({
      items: [], total: 0, page: 1, page_size: 25, seasons: [season],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/leagues"]}>
            <Routes>
              <Route path="/leagues" element={<LeaguesPage />} />
              <Route path="/leagues/unassigned" element={<div>UNASSIGNED_PAGE</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it("says which clock the league is run on", async () => {
    renderLeagues();
    await screen.findByText("2026 여름 시즌 6주차");

    expect(screen.getByText(/운영 기준/)).toBeInTheDocument();
    expect(screen.getByText("미국 동부 시간(ET)")).toBeInTheDocument();
  });

  it("shows both ends of the week in ET, with the zone it was on", async () => {
    renderLeagues();
    await screen.findByText("2026 여름 시즌 6주차");

    const schedule = document.querySelector(".hgadm-schedule")!;
    expect(schedule.textContent).toContain("2026.07.06 (월) 00:00");
    expect(schedule.textContent).toContain("2026.07.12 (일) 21:00");
    expect(schedule.textContent).toContain("EDT");
  });

  it("shows the Korean equivalent of both", async () => {
    renderLeagues();
    await screen.findByText("2026 여름 시즌 6주차");

    const schedule = document.querySelector(".hgadm-schedule")!;
    // 13 hours ahead in summer; the Sunday close is already Monday in Seoul.
    expect(schedule.textContent).toContain("한국 2026.07.06 (월) 13:00");
    expect(schedule.textContent).toContain("한국 2026.07.13 (월) 10:00");
  });

  it("uses the winter offset for a winter week", async () => {
    // The same wall-clock week in January is 14 hours, not 13. A stored offset
    // would be wrong for one of these two.
    renderLeagues({
      ...SEASON,
      starts_at: "2026-01-05T05:00:00Z",
      ends_at: "2026-01-12T02:00:00Z",
    });
    await screen.findByText("2026 여름 시즌 6주차");

    const schedule = document.querySelector(".hgadm-schedule")!;
    expect(schedule.textContent).toContain("EST");
    expect(schedule.textContent).toContain("한국 2026.01.05 (월) 14:00");
  });

  it("counts down to the close", async () => {
    // Anchored to the real clock rather than a frozen one: react-query polls
    // on timers, and stalling those stalls the render it is being asserted on.
    // The extra minute keeps the floor off the boundary.
    const endsAt = new Date(Date.now() + (2 * 24 + 6) * 3_600_000 + 60_000);
    renderLeagues({ ...SEASON, ends_at: endsAt.toISOString() });

    expect(await screen.findByText("2일 6시간 남음")).toBeInTheDocument();
  });

  it("says the week is over rather than counting backwards", async () => {
    renderLeagues({ ...SEASON, ends_at: new Date(Date.now() - 60_000).toISOString() });

    const ended = await screen.findByText("종료됨");
    expect(ended).toHaveClass("is-ended");
  });

  it("offers the waiting queue as a link, with its size", async () => {
    const user = userEvent.setup();
    renderLeagues();
    await screen.findByText("2026 여름 시즌 6주차");

    expect(screen.getByText("리그 미배정")).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /리그 미배정/ }));
    expect(await screen.findByText("UNASSIGNED_PAGE")).toBeInTheDocument();
  });
});
