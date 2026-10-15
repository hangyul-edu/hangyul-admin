import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import type { AdminLeagueSummary } from "../../api";
import { errorMessage } from "../../../lib/http";
import { LEAGUE_TIERS } from "../../../lib/league";
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, Pagination, Select } from "../../components/kit";
import type { Column } from "../../components/kit";
import { TierChip } from "../../components/TierChip";
import { leagueName, tierName } from "../../lib/leagueNames";
import { useUrlFilters } from "../../lib/urlFilters";
import { MemberLookup } from "./MemberLookup";
import { leaguePath } from "./parts";
import { useActiveLeagues } from "./queries";
import { SeasonHeader } from "./SeasonHeader";

/** How full a league is. The count says 28/30; the bar shows it. */
function CapacityBar({ filled, capacity }: { filled: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(1, filled / capacity) : 0;
  return (
    <span className="hgadm-capacity" role="img" aria-label={`정원 ${capacity}명 중 ${filled}명`}>
      <span className="hgadm-capacity__fill" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

// Season and period are the same on every row, so they are stated once in the
// header above instead of filling two columns. What is left is what actually
// differs between leagues.
const COLUMNS: Column<AdminLeagueSummary>[] = [
  {
    key: "league",
    header: "리그",
    render: (l) => <span className="hgadm-cell-main">{leagueName(l.tier, l.group_ordinal)}</span>,
    // "Golden 리그 1그룹" is about as long as this gets, so the column is sized
    // for it rather than absorbing the table's slack — which pushed the tier
    // chip most of the way across the screen.
    width: 220,
  },
  { key: "tier", header: "등급", render: (l) => <TierChip tier={l.tier} />, width: 120 },
  {
    key: "participants",
    header: "참가자",
    // Left-aligned, not numeric: "30 / 30" is a label rather than a figure, and
    // right-aligning it left every row's left edge in a different place while
    // the header sat over the far end of the column.
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
    // The one column with no width: the bar stretches into whatever is left, so
    // the slack lands somewhere useful instead of before the tier.
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
  { key: "status", header: "상태", render: () => <Badge tone="success">진행 중</Badge>, width: 100 },
];

export function LeaguesPage() {
  const filters = useUrlFilters();
  const navigate = useNavigate();
  const q = filters.value("q");
  const tier = filters.value("tier");
  const query = useActiveLeagues({ q, tier, page: filters.number("page", 1) });
  const filtered = Boolean(q || tier);

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>진행 중인 리그</h1>
          <div className="hgadm-page-head__desc">
            지금 진행 중인 리그 목록입니다. 리그는 한 시즌·한 등급 안의 그룹(5~30명) 단위이며, 종료되었거나 아직 시작하지
            않은 시즌은 표시되지 않습니다. 행을 클릭하면 참가자 순위를 볼 수 있습니다.
          </div>
        </div>
      </div>

      {query.data && <SeasonHeader seasons={query.data.seasons} />}

      <MemberLookup />

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <Select value={tier} onChange={(e) => filters.patch({ tier: e.target.value, page: null })}>
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
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={COLUMNS}
              rows={query.data.items}
              rowKey={(l) => `${l.season_id}/${l.group_id}`}
              onRowClick={(l) => navigate(leaguePath(l.season_id, l.group_id))}
              empty={
                <EmptyState
                  icon={<Trophy size={28} strokeWidth={1.75} />}
                  title={filtered ? "조건에 맞는 리그가 없습니다" : "진행 중인 리그가 없습니다"}
                  desc={
                    filtered
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
