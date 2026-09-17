import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Search, Trophy } from "lucide-react";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type {
  AdminLeagueMember,
  AdminLeagueSeasonContext,
  AdminLeagueSummary,
  AdminMemberLookupResult,
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
} from "../components/kit";
import type { Column } from "../components/kit";
import { personName } from "../lib/adminIdentity";
import { leagueName, leaguePeriod, tierName } from "../lib/leagueNames";
import { TierChip } from "../components/TierChip";
import { accountStatusLabel, accountStatusTone } from "../lib/accountStatus";
import {
  KST_ZONE,
  LEAGUE_ZONE,
  formatInZone,
  formatRemaining,
  periodInZone,
  timeRemaining,
  zoneAbbreviation,
} from "../lib/leagueClock";
import { LEAGUE_TIERS } from "../../lib/league";
import { originFrom, useRestoreScroll } from "../lib/navigation";

/**
 * A "league" in the portal is what a member competes in: 5 to 30 members
 * inside one tier of one weekly season. A season is not itself rankable — it
 * holds many groups across five tiers — so a league is identified by its
 * season *and* its group, which is why the detail route carries both.
 */
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
            {/* Not a statistic but a queue: everybody without a league, and
                a way straight to them. Both reasons are pooled here — the
                page behind the link is what splits 휴면 from 배정 대기. */}
            <Link to="/leagues/unassigned" className="hgadm-season__waiting">
              <span className="hgadm-season__stat-label">리그 미배정</span>
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

/**
 * "Which league is this person in?"
 *
 * Searching the league list by name was answering a question nobody asks —
 * there are ten leagues and they are all on screen. The question an admin
 * actually arrives with is about a person, so the search is over accounts and
 * the answer is their placement. Not being placed is an answer too, with the
 * queue it belongs to one click away.
 */
function MemberLookup() {
  const filters = useUrlFilters();
  const term = filters.value("member");

  const query = useQuery({
    queryKey: ["admin", "leagues", "member-lookup", term],
    queryFn: () => adminApi.lookupMemberLeague({ q: term }),
    enabled: term.trim().length > 0,
  });

  return (
    <div className="hgadm-card hgadm-section">
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">회원 소속 리그 찾기</div>
          <div className="hgadm-cell-sub" style={{ marginTop: 2 }}>
            회원을 검색하면 이번 주 어느 리그에 속해 있는지 확인할 수 있습니다.
          </div>
        </div>
      </div>
      <div className="hgadm-toolbar">
        <SearchBox
          value={term}
          placeholder="회원 이름·닉네임·이메일 검색"
          onSearch={(next) => filters.patch({ member: next })}
        />
      </div>

      {term.trim().length > 0 && (
        <div className="hgadm-lookup">
          {query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState
              message={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : query.data.items.length === 0 ? (
            <EmptyState
              icon={<Search size={28} strokeWidth={1.75} />}
              title="일치하는 회원이 없습니다"
              desc="이름·닉네임·이메일의 일부로 다시 검색해 보세요."
            />
          ) : (
            <>
              {/* Several matches are listed rather than resolved by guessing:
                  two people can share a name, and picking one silently would
                  be worse than asking. */}
              {query.data.items.length > 1 && (
                <div className="hgadm-lookup__count">
                  {query.data.total.toLocaleString()}명이 검색되었습니다. 확인할 회원을
                  선택하세요.
                  {query.data.truncated && " 결과가 많아 일부만 표시합니다."}
                </div>
              )}
              <div className="hgadm-lookup__list">
                {query.data.items.map((result) => (
                  <LookupResult key={result.user_id} result={result} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One matched account, and where it stands. */
function LookupResult({ result }: { result: AdminMemberLookupResult }) {
  const label = personName({
    name: result.name,
    email: result.email,
    user_id: result.user_id,
  });
  const secondary = [result.nickname, result.email].filter(
    (part): part is string => Boolean(part) && part !== label,
  );
  const league = result.assignment;

  return (
    <div className="hgadm-lookup__row">
      <div className="hgadm-lookup__who">
        <Link to={`/users/${encodeURIComponent(result.user_id)}`} className="hgadm-lookup__name">
          {label}
        </Link>
        {secondary.length > 0 && (
          <div className="hgadm-cell-sub hgadm-truncate">{secondary.join(" · ")}</div>
        )}
      </div>

      {league ? (
        <Link
          className="hgadm-lookup__league"
          to={`/leagues/${encodeURIComponent(league.season_id)}/${encodeURIComponent(league.group_id)}`}
        >
          <span className="hgadm-lookup__league-name">
            {leagueName(league.tier, league.group_ordinal)}
            <TierChip tier={league.tier} />
          </span>
          <span className="hgadm-lookup__stats">
            <span className="hgadm-fact">
              <span className="hgadm-fact__label">순위</span>
              <span className="hgadm-fact__value">
                {league.rank} / {league.participants}
              </span>
            </span>
            <span className="hgadm-fact">
              <span className="hgadm-fact__label">포인트</span>
              <span className="hgadm-fact__value">{league.points.toLocaleString()}</span>
            </span>
            <Badge tone={BAND_TONE[league.band] ?? "neutral"}>
              {BAND_LABEL[league.band] ?? league.band}
            </Badge>
          </span>
          <span className="hgadm-lookup__period">
            {league.season_name} · {leaguePeriod(league.starts_at, league.ends_at)}
          </span>
          <ChevronRight size={18} strokeWidth={2.25} className="hgadm-lookup__chevron" />
        </Link>
      ) : (
        <div className="hgadm-lookup__none">
          <Badge tone="warning" dot>
            미배정
          </Badge>
          <span className="hgadm-lookup__none-text">
            아직 리그에 배정되지 않았습니다. 이번 주 학습 기록이 없거나, 학습은
            했지만 같은 티어에 자리가 없어 대기 중일 수 있습니다.
          </span>
          <Link to="/leagues/unassigned" className="hgadm-lookup__link">
            리그 미배정 회원 보기
            <ChevronRight size={14} strokeWidth={2.25} />
          </Link>
        </div>
      )}
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
      // "Golden 리그 1그룹" is about as long as this gets, so the column is
      // sized for it rather than absorbing the table's slack — which pushed
      // the tier chip most of the way across the screen.
      width: 220,
    },
    {
      key: "tier",
      header: "등급",
      render: (l) => <TierChip tier={l.tier} />,
      width: 120,
    },
    {
      key: "participants",
      header: "참가자",
      // Left-aligned, not numeric: "30 / 30" is a label rather than a figure,
      // and right-aligning it left every row's left edge in a different place
      // while the header sat over the far end of the column.
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
      // The one column with no width: the bar stretches into whatever is left,
      // so the slack lands somewhere useful instead of before the tier.
      render: (l) => <CapacityBar filled={l.participants} capacity={l.capacity} />,
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
            지금 진행 중인 리그 목록입니다. 리그는 한 시즌·한 등급 안의 그룹(5~30명)
            단위이며, 종료되었거나 아직 시작하지 않은 시즌은 표시되지 않습니다. 행을
            클릭하면 참가자 순위를 볼 수 있습니다.
          </div>
        </div>
      </div>

      {query.data && <SeasonHeader seasons={query.data.seasons} />}

      <MemberLookup />

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <Select
            value={tier}
            onChange={(e) => filters.patch({ tier: e.target.value, page: null })}
            style={{ width: 160 }}
          >
            <option value="">등급: 전체</option>
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
                      ? "검색어나 등급 필터를 지워보세요."
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
          {/* Printed the raw server value — an admin read `deactivated` here
              and 탈퇴 on the same member's detail page. Same vocabulary as
              every other user-management surface now. A member whose account
              row is gone entirely has no status to name, which is not any of
              them. */}
          <Badge tone={m.account_status ? accountStatusTone(m.account_status) : "neutral"}>
            {m.account_status ? accountStatusLabel(m.account_status) : "계정 없음"}
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
            {/* The zones are a fifth of THIS league's participants, never
                fewer than one each way, so they shrink with the league. They
                are empty where the ladder ends — Golden cannot promote, Green
                cannot relegate — and "상위 0위" would be nonsense there, so the
                reason is named instead. 인원 부족 covers the one remaining
                case: a single-member league, which allocation no longer builds
                but which older rows can still be. */}
            <span className="hgadm-fact hgadm-fact--promote">
              <span className="hgadm-fact__label">승급권</span>
              <span className="hgadm-fact__value">{promoteCount.toLocaleString()}명</span>
              <span className="hgadm-fact__note">
                {league.promote_cutoff_rank > 0
                  ? `상위 ${league.promote_cutoff_rank}위`
                  : "최상위 등급"}
              </span>
            </span>
            <span className="hgadm-fact hgadm-fact--demote">
              <span className="hgadm-fact__label">강등권</span>
              <span className="hgadm-fact__value">{demoteCount.toLocaleString()}명</span>
              <span className="hgadm-fact__note">
                {demoteCount > 0
                  ? `${league.demote_cutoff_rank}위부터`
                  : league.tier === "green"
                    ? "최하위 등급"
                    : "인원 부족"}
              </span>
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
 * The league week on both clocks, labelled.
 *
 * The league is cut on US Eastern time; every other timestamp in the portal is
 * Korean. Showing the period as a bare range beside a Korean "last studied"
 * column leaves the reader unable to tell which clock either is on — so both
 * are stated, each with its zone named.
 */
function PeriodInBothZones({ season }: { season: AdminLeagueSeasonContext }) {
  return (
    <div className="hgadm-zones">
      <div className="hgadm-zones__row">
        <span className="hgadm-zones__label">
          리그 기간 <strong>ET</strong>
        </span>
        <span className="hgadm-zones__value">
          {periodInZone(season.starts_at, season.ends_at, LEAGUE_ZONE)}
          <span className="hgadm-schedule__zone">
            {zoneAbbreviation(season.starts_at, LEAGUE_ZONE)}
          </span>
        </span>
      </div>
      <div className="hgadm-zones__row">
        <span className="hgadm-zones__label">
          한국 시간 <strong>KST</strong>
        </span>
        <span className="hgadm-zones__value hgadm-zones__value--muted">
          {periodInZone(season.starts_at, season.ends_at, KST_ZONE)}
        </span>
      </div>
    </div>
  );
}

/**
 * League Unassigned Members — those with no league this week.
 *
 * Two different situations share this list and must not share a number:
 * **휴면** is a member who has not studied, which fixes itself the moment they
 * do; **배정 대기** is a member who *has* studied and still has nowhere to
 * play, because every league in their tier is full and fewer than five are
 * waiting to open another. Only the second is anybody's to act on, so it is
 * counted and filterable on its own rather than buried in a total.
 *
 * The 전 주 미학습 count is a separate question from either: who sat out the
 * week that just ended, which is exactly who a new season's leagues are not
 * built from.
 */
export function UnassignedMembersPage() {
  const filters = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();

  const q = filters.value("q");
  const state = filters.value("state");
  const idleLastWeek = filters.value("idle_last_week") === "1";
  const page = filters.number("page", 1);
  const filtered = Boolean(q || state || idleLastWeek);

  const query = useQuery({
    queryKey: ["admin", "leagues", "unassigned", { q, state, idleLastWeek, page }],
    queryFn: () =>
      adminApi.listUnassignedMembers({
        q: q || undefined,
        state: state || undefined,
        idle_last_week: idleLastWeek ? "true" : undefined,
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
      // The zone is named in the header because the column sits on a page that
      // also shows an ET period; unlabelled, the two are indistinguishable.
      header: "마지막 학습 (KST)",
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
      key: "state",
      header: "미배정 사유",
      // The badge names *why* they have no league, which is the one thing that
      // separates the two populations on this page. The line beneath it is how
      // long they have gone without studying — related, but not the same fact:
      // somebody can be 배정 대기 with 0일째.
      render: (m) => (
        <div className="hgadm-nowrap">
          <Badge tone={m.state === "WAITING_FOR_ALLOCATION" ? "warning" : "neutral"} dot>
            {m.state === "WAITING_FOR_ALLOCATION" ? "배정 대기" : "휴면"}
          </Badge>
          <div className="hgadm-cell-sub">
            {m.state === "WAITING_FOR_ALLOCATION"
              ? "학습했으나 배정 가능한 리그 없음"
              : m.never_studied
                ? `가입 후 ${m.days_since_signup.toLocaleString()}일`
                : `${m.idle_days.toLocaleString()}일째 학습 없음`}
          </div>
        </div>
      ),
      width: 210,
    },
    {
      key: "last-week",
      header: "전 주 학습",
      render: (m) =>
        m.studied_last_week ? (
          <span className="hgadm-muted hgadm-nowrap">학습함</span>
        ) : (
          <Badge tone="danger" dot>
            미학습
          </Badge>
        ),
      width: 110,
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
            </div>
          )}
          <h1>리그 미배정 회원</h1>
          {/* 1 — which week this is about, on both clocks. */}
          {query.data?.seasons[0] && (
            <PeriodInBothZones season={query.data.seasons[0]} />
          )}
          {/* 2 — the size and shape of the queue. */}
          {query.data && (
            <div className="hgadm-page-head__facts">
              <span className="hgadm-fact">
                <span className="hgadm-fact__label">휴면</span>
                <span className="hgadm-fact__value">
                  {query.data.dormant_total.toLocaleString()}명
                </span>
                <span className="hgadm-fact__note">이번 주 학습 없음</span>
              </span>
              {/* Deliberately the emphasised one: it is the only number on
                  this page that represents something the service owes. */}
              <span className="hgadm-fact hgadm-fact--promote">
                <span className="hgadm-fact__label">배정 대기</span>
                <span className="hgadm-fact__value">
                  {query.data.waiting_total.toLocaleString()}명
                </span>
                <span className="hgadm-fact__note">리그 자리 부족</span>
              </span>
              <span className="hgadm-fact hgadm-fact--demote">
                <span className="hgadm-fact__label">전 주 미학습</span>
                <span className="hgadm-fact__value">
                  {query.data.idle_last_week_total.toLocaleString()}명
                </span>
                {query.data.previous_season_id && (
                  <span className="hgadm-fact__note">
                    {query.data.previous_season_id}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="hgadm-page-head__desc">
            아직 리그에 배정되지 않은 회원입니다. <strong>휴면</strong>은 이번 주
            학습 기록이 없는 회원으로, 학습을 시작하면 곧바로 배정됩니다.{" "}
            <strong>배정 대기</strong>는 학습을 했지만 같은 티어의 리그가 모두
            가득 차 있고 새 리그를 만들 인원(5명)도 모이지 않은 회원으로, 회원이
            할 수 있는 일은 없습니다. <strong>전 주 미학습</strong>은 지난 주에
            학습 기록이 없어 이번 주 리그 생성 대상에서 빠진 회원입니다.
          </div>
          {/* 3 — what a click does, on a line of its own. */}
          <div className="hgadm-page-head__hint">
            회원을 클릭하면 해당 회원 상세 페이지로 이동합니다.
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
          {/* Two controls because they are two questions: why they have no
              league, and whether they sat out last week. A member can be
              배정 대기 and 전 주 미학습 at the same time. */}
          <Select
            value={state}
            onChange={(e) => filters.patch({ state: e.target.value, page: null })}
            style={{ width: 190 }}
          >
            <option value="">전체 미배정 회원</option>
            <option value="DORMANT">휴면만</option>
            <option value="WAITING_FOR_ALLOCATION">배정 대기만</option>
          </Select>
          <Select
            value={idleLastWeek ? "1" : ""}
            onChange={(e) =>
              filters.patch({ idle_last_week: e.target.value, page: null })
            }
            // Matches the sibling; its longest option measures 113px, which
            // needs more than 170 once the select's own chrome is counted.
            style={{ width: 190 }}
          >
            <option value="">전 주 학습 여부 전체</option>
            <option value="1">전 주 미학습만</option>
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
                    "리그 미배정 회원",
                    `${location.pathname}${location.search}`,
                  ),
                })
              }
              empty={
                <EmptyState
                  icon={<Trophy size={28} strokeWidth={1.75} />}
                  title={
                    filtered
                      ? "조건에 맞는 회원이 없습니다"
                      : "모든 회원이 리그에 배정되었습니다"
                  }
                  desc={
                    filtered
                      ? "검색어나 필터를 지워보세요."
                      : "배정을 기다리는 회원이 없습니다."
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
