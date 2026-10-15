import { useLocation, useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import type { AdminUnassignedMember, AdminUnassignedMembersPage } from "../../api";
import { errorMessage } from "../../../lib/http";
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
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { PersonCell } from "../../components/PersonCell";
import { TierChip } from "../../components/TierChip";
import { originFrom, useRestoreScroll } from "../../lib/navigation";
import { useUrlFilters } from "../../lib/urlFilters";
import { BackToLeagues, PeriodInBothZones } from "./parts";
import { useUnassignedMembers } from "./queries";

const WAITING = "WAITING_FOR_ALLOCATION";

const COLUMNS: Column<AdminUnassignedMember>[] = [
  { key: "member", header: "회원", render: (m) => <PersonCell person={m} /> },
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
        <Badge tone={m.state === WAITING ? "warning" : "neutral"} dot>
          {m.state === WAITING ? "배정 대기" : "휴면"}
        </Badge>
        <div className="hgadm-cell-sub">
          {m.state === WAITING
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
  const filtered = Boolean(q || state || idleLastWeek);
  const query = useUnassignedMembers({ q, state, idleLastWeek, page: filters.number("page", 1) });

  useRestoreScroll(query.isSuccess);

  const season = query.data?.seasons[0];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <BackToLeagues />
          {season && (
            <div className="hgadm-kicker">
              <span className="hgadm-kicker__name">{season.name}</span>
            </div>
          )}
          <h1>리그 미배정 회원</h1>
          {/* 1 — which week this is about, on both clocks. */}
          {season && <PeriodInBothZones season={season} />}
          {/* 2 — the size and shape of the queue. */}
          {query.data && <QueueFacts page={query.data} />}
          <div className="hgadm-page-head__desc">
            아직 리그에 배정되지 않은 회원입니다. <strong>휴면</strong>은 이번 주 학습 기록이 없는 회원으로, 학습을 시작하면
            곧바로 배정됩니다. <strong>배정 대기</strong>는 학습을 했지만 같은 티어의 리그가 모두 가득 차 있고 새 리그를
            만들 인원(5명)도 모이지 않은 회원으로, 회원이 할 수 있는 일은 없습니다. <strong>전 주 미학습</strong>은 지난
            주에 학습 기록이 없어 이번 주 리그 생성 대상에서 빠진 회원입니다.
          </div>
          {/* 3 — what a click does, on a line of its own. */}
          <div className="hgadm-page-head__hint">회원을 클릭하면 해당 회원 상세 페이지로 이동합니다.</div>
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
          <Select value={state} onChange={(e) => filters.patch({ state: e.target.value, page: null })}>
            <option value="">전체 미배정 회원</option>
            <option value="DORMANT">휴면만</option>
            <option value={WAITING}>배정 대기만</option>
          </Select>
          <Select
            value={idleLastWeek ? "1" : ""}
            onChange={(e) => filters.patch({ idle_last_week: e.target.value, page: null })}
          >
            <option value="">전 주 학습 여부 전체</option>
            <option value="1">전 주 미학습만</option>
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
              rowKey={(m) => m.user_id}
              onRowClick={(m) =>
                navigate(`/users/${encodeURIComponent(m.user_id)}`, {
                  state: originFrom("리그 미배정 회원", `${location.pathname}${location.search}`),
                })
              }
              empty={
                <EmptyState
                  icon={<Trophy size={28} strokeWidth={1.75} />}
                  title={filtered ? "조건에 맞는 회원이 없습니다" : "모든 회원이 리그에 배정되었습니다"}
                  desc={filtered ? "검색어나 필터를 지워보세요." : "배정을 기다리는 회원이 없습니다."}
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

function QueueFacts({ page }: { page: AdminUnassignedMembersPage }) {
  return (
    <div className="hgadm-page-head__facts">
      <span className="hgadm-fact">
        <span className="hgadm-fact__label">휴면</span>
        <span className="hgadm-fact__value">{page.dormant_total.toLocaleString()}명</span>
        <span className="hgadm-fact__note">이번 주 학습 없음</span>
      </span>
      {/* Deliberately the emphasised one: it is the only number on this page
          that represents something the service owes. */}
      <span className="hgadm-fact hgadm-fact--promote">
        <span className="hgadm-fact__label">배정 대기</span>
        <span className="hgadm-fact__value">{page.waiting_total.toLocaleString()}명</span>
        <span className="hgadm-fact__note">리그 자리 부족</span>
      </span>
      <span className="hgadm-fact hgadm-fact--demote">
        <span className="hgadm-fact__label">전 주 미학습</span>
        <span className="hgadm-fact__value">{page.idle_last_week_total.toLocaleString()}명</span>
        {page.previous_season_id && <span className="hgadm-fact__note">{page.previous_season_id}</span>}
      </span>
    </div>
  );
}
