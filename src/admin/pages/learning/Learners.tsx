import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { learningApi } from "../../learningApi";
import type { LearnerRow } from "../../learningApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { originFrom } from "../../lib/navigation";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  Timestamp,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { GraduationCap } from "lucide-react";
import { TRACK_LABEL } from "../../components/learning";
import { PageHero } from "../../components/insights";

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
    { key: "last", header: "마지막 학습", render: (r) => <Timestamp at={r.last_study_at} /> },
    { key: "evidence", header: "실력 평가 기록", numeric: true, render: (r) => r.evidence_count.toLocaleString() },
    {
      key: "overdue",
      header: "밀린 복습",
      numeric: true,
      render: (r) => (r.overdue_reviews ? <Badge tone="warning">{r.overdue_reviews}</Badge> : "0"),
    },
    {
      key: "labels",
      header: "참고",
      render: (r) =>
        r.labels.length ? (
          <span className="hgadm-chip-row">
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
      <PageHero
        icon={GraduationCap}
        eyebrow="학습 인사이트 · 학습자"
        title="학습 현황"
        description="맞춤 학습을 이용하는 회원의 최근 학습과 복습 상태예요. 회원을 누르면 개인별 성장 기록이 열려요. 이메일은 가려서 보여 주고, 조회한 기록이 남아요. 쉰 기간은 실력이 떨어졌다는 뜻이 아니라서 사실만 표시해요."
      />
      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="사용자 ID 또는 닉네임" onSearch={(next) => f.patch({ q: next, page: null })} />
          <Select
            aria-label="트랙"
            value={track}
            onChange={(e) => f.patch({ track: e.target.value, band: null, page: null })}
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
          >
            <option value="">전체 기간</option>
            <option value="7">최근 7일 학습</option>
            <option value="30">최근 30일 학습</option>
          </Select>
          <Select
            aria-label="복습 기한"
            value={overdue}
            onChange={(e) => f.patch({ review_overdue: e.target.value, page: null })}
          >
            <option value="">복습 상태 전체</option>
            <option value="true">밀린 복습 있음</option>
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
                  state: originFrom("학습 현황", `${location.pathname}${location.search}`),
                })
              }
              empty="조건에 맞는 회원이 없어요. 필터를 바꿔 보세요."
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
