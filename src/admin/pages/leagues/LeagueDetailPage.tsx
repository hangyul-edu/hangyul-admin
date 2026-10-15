import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Trophy } from "lucide-react";
import type { AdminLeagueDetail, AdminLeagueMember } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, SearchBox, Timestamp } from "../../components/kit";
import type { Column } from "../../components/kit";
import { PersonCell } from "../../components/PersonCell";
import { TierChip } from "../../components/TierChip";
import { accountStatusLabel, accountStatusTone } from "../../lib/accountStatus";
import { leagueName, leaguePeriod } from "../../lib/leagueNames";
import { originFrom, useRestoreScroll } from "../../lib/navigation";
import { useUrlFilters } from "../../lib/urlFilters";
import { BackToLeagues, BandBadge } from "./parts";
import { useLeague } from "./queries";

const COLUMNS: Column<AdminLeagueMember>[] = [
  {
    key: "rank",
    header: "순위",
    numeric: true,
    render: (m) => <span className="hgadm-cell-main">{m.rank}</span>,
    width: 80,
  },
  // Name first, per the portal-wide convention, with nickname and email beneath.
  { key: "member", header: "회원", render: (m) => <PersonCell person={m} /> },
  {
    key: "points",
    header: "포인트",
    numeric: true,
    render: (m) => <span className="hgadm-cell-main hgadm-nowrap">{m.points.toLocaleString()}</span>,
    width: 110,
  },
  { key: "band", header: "승강", render: (m) => <BandBadge band={m.band} />, width: 110 },
  {
    key: "account",
    header: "계정",
    render: (m) => (
      <div className="hgadm-nowrap">
        {/* The same vocabulary as every other user-management surface. A member
            whose account row is gone entirely has no status to name, which is
            not any of them. */}
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
    render: (m) => (m.last_activity_at ? <Timestamp at={m.last_activity_at} /> : <span className="hgadm-muted">—</span>),
    width: 150,
  },
];

/** One league's standings: who is in it, ranked, and who is heading where. */
export function LeagueDetailPage() {
  const { seasonId = "", groupId = "" } = useParams();
  const filters = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const q = filters.value("q");
  const query = useLeague(seasonId, groupId, q);

  // Coming back from a member's detail page lands on the row you left, not at
  // the top of a 30-row table — but only once the rows are there to scroll to.
  useRestoreScroll(query.isSuccess);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const { league, members, member_total: memberTotal } = query.data;
  const name = leagueName(league.tier, league.group_ordinal);

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <BackToLeagues />
          <LeagueHeading detail={query.data} />
          {/* Third line: what clicking a row does. */}
          <div className="hgadm-page-head__desc">회원을 클릭하면 해당 회원 상세 페이지로 이동합니다.</div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="이름·닉네임·이메일 검색" onSearch={(next) => filters.patch({ q: next })} />
          {q && (
            <span className="hgadm-muted">
              {members.length.toLocaleString()}명 표시 / 전체 {memberTotal.toLocaleString()}명
            </span>
          )}
        </div>

        <DataTable
          columns={COLUMNS}
          rows={members}
          rowKey={(m) => m.user_id}
          /* Straight to the existing user detail page — this view deliberately
             has no user management of its own — carrying where we came from so
             its back link returns here rather than to the user directory. */
          onRowClick={(m) =>
            navigate(`/users/${encodeURIComponent(m.user_id)}`, {
              state: originFrom(name, `${location.pathname}${location.search}`),
            })
          }
          empty={
            <EmptyState
              icon={<Trophy size={28} strokeWidth={1.75} />}
              title={q ? "조건에 맞는 회원이 없습니다" : "참가자가 없습니다"}
              desc={q ? "검색어를 지우면 전체 참가자를 볼 수 있습니다." : "학습 활동이 기록되면 참가자가 배정됩니다."}
            />
          }
        />
      </div>
    </div>
  );
}

/** The week, the league's name, and its shape: how full, and who moves. */
function LeagueHeading({ detail }: { detail: AdminLeagueDetail }) {
  const { league, season, member_total: memberTotal, promote_count: promoteCount, demote_count: demoteCount } = detail;
  return (
    <>
      {/* First line: the cycle this league belongs to. It is the page's
          top-level context — which week's standings you are looking at — so it
          leads, above the league's own name. */}
      <div className="hgadm-kicker">
        <span className="hgadm-kicker__name">{season.name}</span>
        <span className="hgadm-kicker__period">{leaguePeriod(season.starts_at, season.ends_at)}</span>
      </div>
      <h1 className="hgadm-row">
        {leagueName(league.tier, league.group_ordinal)}
        <TierChip tier={league.tier} />
      </h1>
      <div className="hgadm-page-head__facts">
        <span className="hgadm-fact">
          <span className="hgadm-fact__label">참가자</span>
          <span className="hgadm-fact__value">
            {memberTotal.toLocaleString()} / {league.capacity}
          </span>
        </span>
        {/* The zones are a fifth of THIS league's participants, never fewer
            than one each way, so they shrink with the league. They are empty
            where the ladder ends — Golden cannot promote, Green cannot
            relegate — and "상위 0위" would be nonsense there, so the reason is
            named instead. 인원 부족 covers the one remaining case: a
            single-member league, which allocation no longer builds but which
            older rows can still be. */}
        <span className="hgadm-fact hgadm-fact--promote">
          <span className="hgadm-fact__label">승급권</span>
          <span className="hgadm-fact__value">{promoteCount.toLocaleString()}명</span>
          <span className="hgadm-fact__note">
            {league.promote_cutoff_rank > 0 ? `상위 ${league.promote_cutoff_rank}위` : "최상위 등급"}
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
    </>
  );
}
