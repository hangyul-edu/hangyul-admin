import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { learningApi } from "../../learningApi";
import type { LearnerRow } from "../../learningApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { originFrom } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { TRACK_LABEL } from "../../components/learning";

const PAGE_SIZE = 25;

export function LearnersPage() {
  const f = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const track = f.value("track");
  const band = f.value("band");
  const activeSince = f.value("active_since_days");
  const overdue = f.value("review_overdue");
  const q = f.value("q");
  const page = f.number("page", 1);
  const params = {
    track: track || undefined,
    band: track && band ? Number(band) : undefined,
    active_since_days: activeSince ? Number(activeSince) : undefined,
    review_overdue: overdue === "true" ? true : undefined,
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ["admin", "learning", "learners", params],
    queryFn: () => learningApi.learners(params),
  });

  const columns: Column<LearnerRow>[] = [
    {
      key: "who",
      header: "학습자",
      render: (r) => (
        <div>
          <div className="hgadm-cell-main">{r.nickname ?? "(닉네임 없음)"}</div>
          <div className="hgadm-cell-sub">{r.email_masked}</div>
        </div>
      ),
    },
    { key: "last", header: "마지막 학습", render: (r) => formatDateTime(r.last_study_at) },
    { key: "evidence", header: "누적 평가 증거", numeric: true, render: (r) => r.evidence_count.toLocaleString() },
    {
      key: "overdue",
      header: "기한 지난 복습",
      numeric: true,
      render: (r) => (r.overdue_reviews ? <Badge tone="warning">{r.overdue_reviews}</Badge> : "0"),
    },
    {
      key: "labels",
      header: "상태 메모",
      render: (r) =>
        r.labels.length ? (
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {r.labels.map((l) => (
              <Badge key={l.code} tone="neutral">
                {l.ko}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="hgadm-cell-sub">—</span>
        ),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>학습자 성장</h1>
          <div className="hgadm-page-head__desc">
            적응형 세션을 이용한 학습자 목록입니다. 이메일은 가려져 있고, 조회 기록이 남습니다. 학습하지 않은 기간은
            실력 하락의 증거가 아니므로 &quot;최근 평가 증거 없음&quot;처럼 사실만 표시합니다.
          </div>
        </div>
      </div>
      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="사용자 ID 또는 닉네임" onSearch={(next) => f.patch({ q: next, page: null })} />
          <Select
            aria-label="트랙"
            value={track}
            onChange={(e) => f.patch({ track: e.target.value, band: null, page: null })}
            style={{ width: 130 }}
          >
            <option value="">전체 트랙</option>
            <option value="conversation">{TRACK_LABEL.conversation}</option>
            <option value="topik">{TRACK_LABEL.topik}</option>
          </Select>
          <Select
            aria-label="현재 레벨"
            value={band}
            disabled={!track}
            onChange={(e) => f.patch({ band: e.target.value, page: null })}
            style={{ width: 130 }}
          >
            <option value="">전체 레벨</option>
            {Array.from({ length: track === "topik" ? 6 : 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {track === "topik" ? `${n}급` : `레벨 ${n}`}
              </option>
            ))}
          </Select>
          <Select
            aria-label="최근 학습"
            value={activeSince}
            onChange={(e) => f.patch({ active_since_days: e.target.value, page: null })}
            style={{ width: 150 }}
          >
            <option value="">전체 기간</option>
            <option value="7">최근 7일 학습</option>
            <option value="30">최근 30일 학습</option>
          </Select>
          <Select
            aria-label="복습 기한"
            value={overdue}
            onChange={(e) => f.patch({ review_overdue: e.target.value, page: null })}
            style={{ width: 170 }}
          >
            <option value="">복습 상태 전체</option>
            <option value="true">기한 지난 복습 있음</option>
          </Select>
        </div>
        {query.isLoading && <LoadingState />}
        {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
        {query.data && (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(r) => r.user_id}
              onRowClick={(r) =>
                navigate(`/learning/learners/${r.user_id}`, {
                  state: originFrom("학습자 성장", `${location.pathname}${location.search}`),
                })
              }
              empty="조건에 맞는 학습자가 없습니다."
            />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.total}
              onPageChange={(p) => f.patch({ page: String(p) })}
            />
          </>
        )}
      </div>
    </div>
  );
}
