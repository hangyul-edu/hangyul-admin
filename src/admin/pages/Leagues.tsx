import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Trophy } from "lucide-react";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type {
  AdminLeagueMember,
  AdminLeagueSeasonContext,
  AdminLeagueSummary,
  AdminUnassignedMember,
} from "../api";
import { errorMessage } from "../../lib/http";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  Timestamp,
  statusLabel,
} from "../components/kit";
import type { Column } from "../components/kit";
import { personName } from "../lib/adminIdentity";
import { leagueName, leaguePeriod, tierColor, tierName } from "../lib/leagueNames";
import {
  KST_ZONE,
  LEAGUE_ZONE,
  formatInZone,
  formatRemaining,
  timeRemaining,
  zoneAbbreviation,
} from "../lib/leagueClock";
import { LEAGUE_TIERS } from "../../lib/league";
import { originFrom, useRestoreScroll } from "../lib/navigation";

/**
 * A "league" in the portal is what a member competes in: a group of up to 30
 * inside one tier of one weekly season. A season is not itself rankable — it
 * holds many groups across five tiers — so a league is identified by its
 * season *and* its group, which is why the detail route carries both.
 */
/**
 * The tier, in the tier's own colour.
 *
 * The badge palette could only approximate the ladder — two of the five came
 * out the same "warning" amber — which defeats the point of a colour that is
 * meant to be recognised at a glance. This borrows the app's colour directly
 * and puts the text on a tint of it, so the five tiers are five colours here
 * exactly as they are in the app.
 */
function TierChip({ tier }: { tier: string }) {
  const color = tierColor(tier);
  return (
    <span
      className="hgadm-tier"
      style={
        color
          ? { color, background: `${color}1f`, borderColor: `${color}59` }
          : undefined
      }
    >
      <span className="hgadm-tier__dot" style={color ? { background: color } : undefined} />
      {tierName(tier)}
    </span>
  );
}

const BAND_LABEL: Record<string, string> = {
  promote: "승급권",
  maintain: "유지",
  demote: "강등권",
};

const BAND_TONE: Record<string, "success" | "neutral" | "danger"> = {
  promote: "success",
  maintain: "neutral",
  demote: "danger",
};

/** How full a league is. The count says 28/30; the bar shows it. */
function CapacityBar({ filled, capacity }: { filled: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(1, filled / capacity) : 0;
  return (
    <span
      className="hgadm-capacity"
      role="img"
      aria-label={`정원 ${capacity}명 중 ${filled}명`}
    >
      <span className="hgadm-capacity__fill" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

/**
 * The cycle the whole page is about, stated once above the list.
 *
 * Season and period are identical on every row of an active-league list — they
 * are what the leagues have in common, not what tells them apart — so they
 * belong here rather than repeated down two columns. The name is the member
 * app's own ("2026 가을 시즌 2주차"); the weekly key stays as small technical
 * text for support, where it is genuinely the thing you quote.
 */
function SeasonHeader({ seasons }: { seasons: AdminLeagueSeasonContext[] }) {
  // The remaining time is the one value that goes stale while the page sits
  // open, so it is recomputed each minute rather than at fetch time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (seasons.length === 0) return null;
  return (
    <div className="hgadm-season">
      {seasons.map((season) => (
        <div className="hgadm-season__row" key={season.season_id}>
          <div className="hgadm-season__main">
            <div className="hgadm-season__name">
              {season.name}
              <span className="hgadm-badge hgadm-badge--success">진행 중</span>
            </div>
            <div className="hgadm-season__period">
              {leaguePeriod(season.starts_at, season.ends_at)}
            </div>
            <Schedule season={season} now={now} />
          </div>
          <div className="hgadm-season__stats">
            <div className="hgadm-season__stat">
              <span className="hgadm-season__stat-label">리그</span>
              <span className="hgadm-season__stat-value">
                {season.league_count.toLocaleString()}
              </span>
            </div>
            <div className="hgadm-season__stat">
              <span className="hgadm-season__stat-label">참가자</span>
              <span className="hgadm-season__stat-value">
                {season.participant_count.toLocaleString()}
              </span>
            </div>
            {/* Not a statistic but a queue: the people who have not studied
                yet this week, and a way straight to them. */}
            <Link to="/leagues/unassigned" className="hgadm-season__waiting">
              <span className="hgadm-season__stat-label">미배정 회원</span>
              <span className="hgadm-season__stat-value">
                {season.unassigned_count.toLocaleString()}
                <ChevronRight size={16} strokeWidth={2.25} />
              </span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * When the week opens and closes, on both clocks.
 *
 * The league is *operated* on US Eastern time — the weeks are cut and settled
 * against those instants — so ET leads each row and is labelled as the basis,
 * with Korean time beside it because that is what the team reads. The zone
 * abbreviation comes from the instant itself, so a week that opens on EST and
 * closes on EDT says so rather than averaging the two.
 */
function Schedule({ season, now }: { season: AdminLeagueSeasonContext; now: Date }) {
  const remaining = timeRemaining(season.ends_at, now);
  const rows: [string, string][] = [
    ["시작", season.starts_at],
    ["종료", season.ends_at],
  ];
  return (
    <div className="hgadm-schedule">
      <div className="hgadm-schedule__basis">
        운영 기준 <strong>미국 동부 시간(ET)</strong>
      </div>
      {rows.map(([label, at]) => (
        <div className="hgadm-schedule__row" key={label}>
          <span className="hgadm-schedule__label">{label}</span>
          <span className="hgadm-schedule__et">
            {formatInZone(at, LEAGUE_ZONE)}
            <span className="hgadm-schedule__zone">{zoneAbbreviation(at, LEAGUE_ZONE)}</span>
          </span>
          <span className="hgadm-schedule__kst">
            한국 {formatInZone(at, KST_ZONE)}
          </span>
        </div>
      ))}
      <div className="hgadm-schedule__row">
        <span className="hgadm-schedule__label">남은 시간</span>
        <span
          className={`hgadm-schedule__remaining ${remaining.ended ? "is-ended" : ""}`}
        >
          {formatRemaining(remaining)}
        </span>
      </div>
    </div>
  );
}

export function LeaguesPage() {
  const filters = useUrlFilters();
  const navigate = useNavigate();

  const q = filters.value("q");
  const tier = filters.value("tier");
  const page = filters.number("page", 1);

  const query = useQuery({
    queryKey: ["admin", "leagues", { q, tier, page }],
    queryFn: () =>
      adminApi.listActiveLeagues({
        q: q || undefined,
        tier: tier || undefined,
        page,
        page_size: 25,
      }),
  });

  // Season and period are the same on every row, so they are stated once in
  // the header above instead of filling two columns. What is left is what
  // actually differs between leagues.
  const columns: Column<AdminLeagueSummary>[] = [
    {
      key: "league",
      header: "리그",
      render: (l) => (
        <span className="hgadm-cell-main">{leagueName(l.tier, l.group_ordinal)}</span>
      ),
    },
    {
      key: "tier",
      header: "티어",
      render: (l) => <TierChip tier={l.tier} />,
      width: 120,
    },
    {
      key: "participants",
      header: "참가자",
      numeric: true,
      render: (l) => (
        <div className="hgadm-nowrap">
          <span className="hgadm-cell-main">{l.participants.toLocaleString()}</span>
          <span className="hgadm-muted"> / {l.capacity}</span>
        </div>
      ),
      width: 130,
    },
    {
      key: "fill",
      header: "정원",
      render: (l) => <CapacityBar filled={l.participants} capacity={l.capacity} />,
      width: 150,
    },
    {
      key: "points",
      header: "포인트",
      numeric: true,
      render: (l) => (
        <div className="hgadm-nowrap">
          <div className="hgadm-cell-main">{l.total_points.toLocaleString()}</div>
          <div className="hgadm-cell-sub">최고 {l.top_points.toLocaleString()}</div>
        </div>
      ),
      width: 130,
    },
    {
      key: "status",
      header: "상태",
      render: () => <Badge tone="success">진행 중</Badge>,
      width: 100,
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>진행 중인 리그</h1>
          <div className="hgadm-page-head__desc">
            지금 진행 중인 리그 목록입니다. 리그는 한 시즌·한 티어 안의 그룹(최대 30명)
            단위이며, 종료되었거나 아직 시작하지 않은 시즌은 표시되지 않습니다. 행을
            클릭하면 참가자 순위를 볼 수 있습니다.
          </div>
        </div>
      </div>

      {query.data && <SeasonHeader seasons={query.data.seasons} />}

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="리그 검색 (예: Golden)"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={tier}
            onChange={(e) => filters.patch({ tier: e.target.value, page: null })}
            style={{ width: 160 }}
          >
            <option value="">티어: 전체</option>
            {LEAGUE_TIERS.map((value) => (
              <option key={value} value={value}>
                {tierName(value)}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(l) => `${l.season_id}/${l.group_id}`}
              onRowClick={(l) =>
                navigate(
                  `/leagues/${encodeURIComponent(l.season_id)}/${encodeURIComponent(l.group_id)}`,
                )
              }
              empty={
                <EmptyState
                  icon={<Trophy size={28} strokeWidth={1.75} />}
                  title={
                    q || tier
                      ? "조건에 맞는 리그가 없습니다"
                      : "진행 중인 리그가 없습니다"
                  }
                  desc={
                    q || tier
                      ? "검색어나 티어 필터를 지워보세요."
                      : "시즌이 시작되고 참가자가 배정되면 여기에 표시됩니다."
                  }
                />
              }
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function LeagueDetailPage() {
  const { seasonId = "", groupId = "" } = useParams();
  const filters = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const q = filters.value("q");

  const query = useQuery({
    queryKey: ["admin", "league", seasonId, groupId, { q }],
    queryFn: () => adminApi.getLeague(seasonId, groupId, { q: q || undefined }),
    enabled: Boolean(seasonId && groupId),
  });

  // Coming back from a member's detail page lands on the row you left, not at
  // the top of a 30-row table — but only once the rows are there to scroll to.
  useRestoreScroll(query.isSuccess);

  const columns: Column<AdminLeagueMember>[] = [
    {
      key: "rank",
      header: "순위",
      numeric: true,
      render: (m) => <span className="hgadm-cell-main">{m.rank}</span>,
      width: 80,
    },
    {
      key: "member",
      header: "회원",
      render: (m) => {
        // Name first, per the portal-wide convention, with nickname and email
        // beneath so a long address cannot displace the identity. When there is
        // no name the primary falls back to the email (then the id), so those
        // are dropped from the second line rather than printed twice.
        const label = personName({ name: m.name, email: m.email, user_id: m.user_id });
        const secondary = [m.nickname, m.email].filter(
          (part): part is string => Boolean(part) && part !== label,
        );
        return (
          <div>
            <div className="hgadm-cell-main">{label}</div>
            {secondary.length > 0 && (
              <div className="hgadm-cell-sub hgadm-truncate">{secondary.join(" · ")}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "points",
      header: "포인트",
      numeric: true,
      render: (m) => (
        <span className="hgadm-cell-main hgadm-nowrap">{m.points.toLocaleString()}</span>
      ),
      width: 110,
    },
    {
      key: "band",
      header: "승강",
      render: (m) => (
        <Badge tone={BAND_TONE[m.band] ?? "neutral"}>{BAND_LABEL[m.band] ?? m.band}</Badge>
      ),
      width: 110,
    },
    {
      key: "account",
      header: "계정",
      render: (m) => (
        <div className="hgadm-nowrap">
          <Badge tone={m.account_status === "active" ? "neutral" : "danger"}>
            {m.account_status ?? "삭제됨"}
          </Badge>
        </div>
      ),
      width: 120,
    },
    {
      key: "activity",
      header: "마지막 활동",
      render: (m) =>
        m.last_activity_at ? <Timestamp at={m.last_activity_at} /> : <span className="hgadm-muted">—</span>,
      width: 150,
    },
  ];

  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );

  const {
    league,
    season,
    members,
    member_total: memberTotal,
    promote_count: promoteCount,
    demote_count: demoteCount,
  } = query.data;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row" style={{ marginBottom: 4 }}>
            <Link
              to="/leagues"
              className="hgadm-muted hgadm-row"
              style={{ fontSize: 13, gap: 4 }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              진행 중인 리그
            </Link>
          </div>
          {/* First line: the cycle this league belongs to. It is the page's
              top-level context — which week's standings you are looking at —
              so it leads, above the league's own name. */}
          <div className="hgadm-kicker">
            <span className="hgadm-kicker__name">{season.name}</span>
            <span className="hgadm-kicker__period">
              {leaguePeriod(season.starts_at, season.ends_at)}
            </span>
          </div>
          <h1 className="hgadm-row">
            {leagueName(league.tier, league.group_ordinal)}
            <TierChip tier={league.tier} />
          </h1>
          {/* Second line: the shape of the league — how full it is, and how
              many are heading up or down. */}
          <div className="hgadm-page-head__facts">
            <span className="hgadm-fact">
              <span className="hgadm-fact__label">참가자</span>
              <span className="hgadm-fact__value">
                {memberTotal.toLocaleString()} / {league.capacity}
              </span>
            </span>
            <span className="hgadm-fact hgadm-fact--promote">
              <span className="hgadm-fact__label">승급권</span>
              <span className="hgadm-fact__value">{promoteCount.toLocaleString()}명</span>
              <span className="hgadm-fact__note">상위 {league.promote_cutoff_rank}위</span>
            </span>
            <span className="hgadm-fact hgadm-fact--demote">
              <span className="hgadm-fact__label">강등권</span>
              <span className="hgadm-fact__value">{demoteCount.toLocaleString()}명</span>
              <span className="hgadm-fact__note">{league.demote_cutoff_rank}위부터</span>
            </span>
          </div>
          {/* Third line: what clicking a row does. */}
          <div className="hgadm-page-head__desc">
            회원을 클릭하면 해당 회원 상세 페이지로 이동합니다.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="이름·닉네임·이메일 검색"
            onSearch={(next) => filters.patch({ q: next })}
          />
          {q && (
            <span className="hgadm-muted">
              {members.length.toLocaleString()}명 표시 / 전체 {memberTotal.toLocaleString()}명
            </span>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={members}
          rowKey={(m) => m.user_id}
          /* Straight to the existing user detail page — this view deliberately
             has no user management of its own — carrying where we came from so
             its back link returns here rather than to the user directory. */
          onRowClick={(m) =>
            navigate(`/users/${encodeURIComponent(m.user_id)}`, {
              state: originFrom(
                leagueName(league.tier, league.group_ordinal),
                `${location.pathname}${location.search}`,
              ),
            })
          }
          empty={
            <EmptyState
              icon={<Trophy size={28} strokeWidth={1.75} />}
              title={q ? "조건에 맞는 회원이 없습니다" : "참가자가 없습니다"}
              desc={
                q
                  ? "검색어를 지우면 전체 참가자를 볼 수 있습니다."
                  : "학습 활동이 기록되면 참가자가 배정됩니다."
              }
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * The members who have not been placed in a league this week.
 *
 * A member joins on their first qualifying study activity, so this list is
 * everyone who has not studied yet — what the app calls *dormant*. It is a
 * work queue rather than a report: the accounts idle longest come first, and
 * the inactive ones are marked so they can be picked out at a glance.
 */
export function UnassignedMembersPage() {
  const filters = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();

  const q = filters.value("q");
  const inactiveOnly = filters.value("inactive") === "1";
  const page = filters.number("page", 1);

  const query = useQuery({
    queryKey: ["admin", "leagues", "unassigned", { q, inactiveOnly, page }],
    queryFn: () =>
      adminApi.listUnassignedMembers({
        q: q || undefined,
        inactive: inactiveOnly ? "true" : undefined,
        page,
        page_size: 25,
      }),
  });

  useRestoreScroll(query.isSuccess);

  const columns: Column<AdminUnassignedMember>[] = [
    {
      key: "member",
      header: "회원",
      render: (m) => {
        const label = personName({ name: m.name, email: m.email, user_id: m.user_id });
        const secondary = [m.nickname, m.email].filter(
          (part): part is string => Boolean(part) && part !== label,
        );
        return (
          <div>
            <div className="hgadm-cell-main">{label}</div>
            {secondary.length > 0 && (
              <div className="hgadm-cell-sub hgadm-truncate">{secondary.join(" · ")}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "activity",
      header: "마지막 학습",
      render: (m) =>
        m.last_activity_at ? (
          <div className="hgadm-nowrap">
            <Timestamp at={m.last_activity_at} />
          </div>
        ) : (
          <span className="hgadm-muted hgadm-nowrap">학습 기록 없음</span>
        ),
      width: 160,
    },
    {
      key: "idle",
      header: "경과",
      numeric: true,
      render: (m) => (
        <span className="hgadm-cell-main hgadm-nowrap">
          {m.days_since_activity === null ? "—" : `${m.days_since_activity.toLocaleString()}일`}
        </span>
      ),
      width: 100,
    },
    {
      key: "state",
      header: "상태",
      render: (m) => (
        <div className="hgadm-row hgadm-nowrap" style={{ gap: 6 }}>
          {/* Dormancy is the reason they are on this list at all, so it is the
              badge that carries colour; the account status only speaks up when
              it is not the ordinary "active". */}
          <Badge tone={m.inactive ? "danger" : "neutral"} dot>
            {m.inactive ? "휴면" : "대기"}
          </Badge>
          {m.status !== "active" && (
            <Badge tone="warning">{statusLabel(m.status)}</Badge>
          )}
        </div>
      ),
      width: 150,
    },
    {
      key: "last-league",
      header: "직전 리그",
      render: (m) =>
        m.last_tier ? (
          <div className="hgadm-nowrap">
            <TierChip tier={m.last_tier} />
            {m.last_season_points !== null && (
              <span className="hgadm-cell-sub"> {m.last_season_points.toLocaleString()}P</span>
            )}
          </div>
        ) : (
          <span className="hgadm-muted">첫 참가 대기</span>
        ),
      width: 180,
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row" style={{ marginBottom: 4 }}>
            <Link
              to="/leagues"
              className="hgadm-muted hgadm-row"
              style={{ fontSize: 13, gap: 4 }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              진행 중인 리그
            </Link>
          </div>
          {query.data?.seasons[0] && (
            <div className="hgadm-kicker">
              <span className="hgadm-kicker__name">{query.data.seasons[0].name}</span>
              <span className="hgadm-kicker__period">
                {leaguePeriod(
                  query.data.seasons[0].starts_at,
                  query.data.seasons[0].ends_at,
                )}
              </span>
            </div>
          )}
          <h1>미배정 회원</h1>
          {query.data && (
            <div className="hgadm-page-head__facts">
              <span className="hgadm-fact">
                <span className="hgadm-fact__label">미배정</span>
                <span className="hgadm-fact__value">
                  {query.data.total.toLocaleString()}명
                </span>
              </span>
              <span className="hgadm-fact hgadm-fact--demote">
                <span className="hgadm-fact__label">휴면</span>
                <span className="hgadm-fact__value">
                  {query.data.inactive_total.toLocaleString()}명
                </span>
                <span className="hgadm-fact__note">30일 이상 학습 없음</span>
              </span>
            </div>
          )}
          <div className="hgadm-page-head__desc">
            이번 주 학습 기록이 없어 아직 리그에 배정되지 않은 회원입니다. 학습을
            시작하면 자동으로 배정됩니다. 회원을 클릭하면 해당 회원 상세 페이지로
            이동합니다.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="이름·닉네임·이메일 검색"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={inactiveOnly ? "1" : ""}
            onChange={(e) => filters.patch({ inactive: e.target.value, page: null })}
            style={{ width: 190 }}
          >
            <option value="">전체 미배정 회원</option>
            <option value="1">휴면 회원만</option>
          </Select>
        </div>

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(m) => m.user_id}
              onRowClick={(m) =>
                navigate(`/users/${encodeURIComponent(m.user_id)}`, {
                  state: originFrom(
                    "미배정 회원",
                    `${location.pathname}${location.search}`,
                  ),
                })
              }
              empty={
                <EmptyState
                  icon={<Trophy size={28} strokeWidth={1.75} />}
                  title={
                    q || inactiveOnly
                      ? "조건에 맞는 회원이 없습니다"
                      : "모든 회원이 리그에 배정되었습니다"
                  }
                  desc={
                    q || inactiveOnly
                      ? "검색어나 필터를 지워보세요."
                      : "이번 주 학습을 시작하지 않은 회원이 아직 없습니다."
                  }
                />
              }
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>
    </div>
  );
}
