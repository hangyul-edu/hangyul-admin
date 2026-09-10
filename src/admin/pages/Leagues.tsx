import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type { AdminLeagueMember, AdminLeagueSummary } from "../api";
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
import { formatDate } from "../lib/format";

/**
 * A "league" in the portal is what a member competes in: a group of up to 30
 * inside one tier of one weekly season. A season is not itself rankable — it
 * holds many groups across five tiers — so a league is identified by its
 * season *and* its group, which is why the detail route carries both.
 */
const TIERS = [
  { value: "green", label: "Green" },
  { value: "lime", label: "Lime" },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "golden", label: "Golden" },
];

/** Tier colours follow the app's ladder; the badge tones are the nearest set. */
const TIER_TONE: Record<string, "neutral" | "success" | "brand" | "warning"> = {
  green: "success",
  lime: "success",
  yellow: "warning",
  orange: "warning",
  golden: "brand",
};

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

  const columns: Column<AdminLeagueSummary>[] = [
    {
      key: "league",
      header: "리그",
      render: (l) => (
        <div>
          <div className="hgadm-cell-main">{l.tier_label}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{l.group_id}</div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "티어",
      render: (l) => <Badge tone={TIER_TONE[l.tier] ?? "neutral"}>{l.tier}</Badge>,
      width: 110,
    },
    {
      key: "season",
      header: "시즌",
      render: (l) => (
        <div>
          <div className="hgadm-cell-main hgadm-cell-mono">{l.season_id}</div>
          <div className="hgadm-cell-sub">{l.season_name}</div>
        </div>
      ),
    },
    {
      key: "period",
      header: "기간",
      render: (l) => (
        <div className="hgadm-nowrap">
          <div className="hgadm-cell-main">{formatDate(l.starts_at)}</div>
          <div className="hgadm-cell-sub">~ {formatDate(l.ends_at)}</div>
        </div>
      ),
      width: 150,
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
      width: 110,
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
      width: 120,
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

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="그룹 ID·시즌·티어 검색"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={tier}
            onChange={(e) => filters.patch({ tier: e.target.value, page: null })}
            style={{ width: 160 }}
          >
            <option value="">티어: 전체</option>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
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
  const q = filters.value("q");

  const query = useQuery({
    queryKey: ["admin", "league", seasonId, groupId, { q }],
    queryFn: () => adminApi.getLeague(seasonId, groupId, { q: q || undefined }),
    enabled: Boolean(seasonId && groupId),
  });

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

  const { league, members, member_total: memberTotal } = query.data;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>
            {league.tier_label}{" "}
            <span className="hgadm-cell-mono hgadm-page-head__id">{league.group_id}</span>
          </h1>
          <div className="hgadm-page-head__desc">
            {league.season_name} ({league.season_id}) · {formatDate(league.starts_at)} ~{" "}
            {formatDate(league.ends_at)} · 참가자 {memberTotal.toLocaleString()}/
            {league.capacity}명. 상위 {league.promote_cutoff_rank}위까지 승급, {league.demote_cutoff_rank}
            위부터 강등됩니다. 회원을 클릭하면 해당 회원 상세로 이동합니다.
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
          // Straight to the existing user detail page — this view deliberately
          // has no user management of its own.
          onRowClick={(m) => navigate(`/users/${encodeURIComponent(m.user_id)}`)}
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
