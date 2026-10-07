import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { ProficiencyRow, ProficiencyTrack } from "../../proficiencyApi";
import { learningApi } from "../../learningApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { originFrom } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import { useAdminAuth } from "../../auth";
import { useToastError } from "../../../hooks/toast";
import { Badge, Button, DataTable, ErrorState, LoadingState, Pagination, SearchBox, Select } from "../../components/kit";
import type { BadgeTone, Column } from "../../components/kit";
import { downloadExport } from "../../components/learning";

const PAGE_SIZE = 25;

export const STATUS_LABEL: Record<ProficiencyRow["status"], { text: string; tone: BadgeTone }> = {
  unassessed: { text: "평가 전", tone: "neutral" },
  insufficient_evidence: { text: "근거 수집 중", tone: "info" },
  provisional: { text: "임시 배치", tone: "warning" },
  confirmed: { text: "확인됨", tone: "success" },
};

export function levelText(track: ProficiencyTrack, n: number | null | undefined): string {
  if (n == null) return "—";
  return track === "topik" ? `${n}급` : `레벨 ${n}`;
}

export function GrowthCell({ growth }: { growth: ProficiencyRow["growth"] }) {
  if (growth.status === "insufficient_baseline") return <span className="hgadm-cell-sub">기준 없음</span>;
  if (growth.status === "no_data" || growth.change_pp == null) return <span className="hgadm-cell-sub">—</span>;
  const sign = growth.change_pp > 0 ? "+" : "";
  return (
    <span>
      {sign}
      {growth.change_pp.toFixed(1)}%p{growth.segmented && <span className="hgadm-cell-sub"> (목표 변경 구간)</span>}
    </span>
  );
}

/** 실력 판정 — learners' confirmed levels, promotion progress and growth. */
export function ProficiencyLearnersPage() {
  const f = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAdminAuth();
  const toastError = useToastError();
  const track = (f.value("track") || "conversation") as ProficiencyTrack;
  const status = f.value("status");
  const level = f.value("level");
  const flag = f.value("flag");
  const period = f.value("period") || "30";
  const q = f.value("q");
  const page = f.number("page", 1);
  const params = {
    track,
    status: status || undefined,
    level: level ? Number(level) : undefined,
    flag: flag || undefined,
    period: Number(period),
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ["admin", "proficiency", "learners", params],
    queryFn: () => proficiencyAdminApi.learners(params),
  });
  const cohort = useQuery({
    queryKey: ["admin", "proficiency", "cohort", track],
    queryFn: () => proficiencyAdminApi.cohort(track),
    enabled: can("analytics:read"),
  });

  async function exportCsv() {
    try {
      const created = await learningApi.createExport({ report: "proficiency", filters: { track, status, level, flag, q, period } });
      await downloadExport(created.export_id, `proficiency-${track}.csv`);
    } catch (e) {
      toastError(e);
    }
  }

  const columns: Column<ProficiencyRow>[] = [
    {
      key: "who",
      header: "학습자",
      render: (r) => (
        <div>
          <div className="hgadm-cell-main">{r.nickname ?? "(닉네임 없음)"}</div>
          <div className="hgadm-cell-sub">{r.email}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (r) => <Badge tone={STATUS_LABEL[r.status].tone}>{STATUS_LABEL[r.status].text}</Badge>,
    },
    {
      key: "level",
      header: track === "topik" ? "확인 급수 (임시)" : "확인 레벨 (임시)",
      render: (r) => (
        <div>
          <div className="hgadm-cell-main">{levelText(track, r.confirmed_level)}</div>
          {r.provisional_level != null && <div className="hgadm-cell-sub">임시 {levelText(track, r.provisional_level)}</div>}
        </div>
      ),
    },
    {
      key: "coverage",
      header: "필수 역량 확인",
      render: (r) =>
        r.coverage ? (
          <div>
            <div className="hgadm-cell-main">
              {r.coverage.confirmed}/{r.coverage.total} ({r.coverage.pct}%)
            </div>
            <div className="hgadm-cell-sub">목표 {levelText(track, r.coverage.target_level)}</div>
          </div>
        ) : (
          <span className="hgadm-cell-sub">—</span>
        ),
    },
    { key: "growth", header: `${period}일 변화`, render: (r) => <GrowthCell growth={r.growth} /> },
    {
      key: "fresh",
      header: "최근 유효 평가",
      render: (r) => (
        <div>
          <div>{r.last_eligible_at ? formatDateTime(r.last_eligible_at) : "없음"}</div>
          {r.stalled && <Badge tone="warning">정체</Badge>}
        </div>
      ),
    },
    {
      key: "blocking",
      header: "주요 막힌 조건",
      render: (r) => (r.main_blocking_label ? r.main_blocking_label.ko : <span className="hgadm-cell-sub">—</span>),
    },
    {
      key: "issues",
      header: "평가 문제",
      numeric: true,
      render: (r) => (r.assessment_issues ? <Badge tone="danger">{r.assessment_issues}</Badge> : "0"),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>실력 판정</h1>
          <div className="hgadm-page-head__desc">
            맞춤 학습 실력 평가로만 판정한 레벨과 다음 레벨까지의 진행입니다. 강의·체크포인트·포인트·문제 수는 반영되지
            않습니다. &quot;필수 역량 확인&quot;은 통과 확률이 아니라 확인된 역량의 비율이며, 성장은 같은 목표·정책 안의
            %p 변화입니다. <Link to="/learning/proficiency-policy">판정 기준 보기</Link>
          </div>
        </div>
        {can("exports:create") && can("learners:read") && (
          <Button onClick={exportCsv}>CSV 내보내기</Button>
        )}
      </div>

      {cohort.data && (
        <div className="hgadm-card hgadm-prof-cohort">
          <div className="hgadm-cell-sub">
            {cohort.data.note.ko} 기록 있는 학습자 {cohort.data.denominator.toLocaleString()}명 · 기록 없음{" "}
            {cohort.data.learners_without_record.toLocaleString()}명
          </div>
          <div className="hgadm-prof-chips">
            {Object.entries(STATUS_LABEL).map(([key, v]) => (
              <Badge key={key} tone={v.tone}>
                {v.text} {(cohort.data.by_status[key] ?? 0).toLocaleString()}
              </Badge>
            ))}
            {Object.entries(cohort.data.confirmed_by_level).map(([lv, n]) => (
              <Badge key={lv} tone="neutral">
                {levelText(track, Number(lv))} {n}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="사용자 ID 또는 닉네임" onSearch={(next) => f.patch({ q: next, page: null })} />
          <Select aria-label="트랙" value={track} onChange={(e) => f.patch({ track: e.target.value, level: null, page: null })} style={{ width: 120 }}>
            <option value="conversation">회화</option>
            <option value="topik">TOPIK</option>
          </Select>
          <Select aria-label="상태" value={status} onChange={(e) => f.patch({ status: e.target.value, page: null })} style={{ width: 130 }}>
            <option value="">전체 상태</option>
            <option value="confirmed">확인됨</option>
            <option value="provisional">임시 배치</option>
            <option value="insufficient_evidence">근거 수집 중</option>
          </Select>
          <Select aria-label="확인 레벨" value={level} onChange={(e) => f.patch({ level: e.target.value, page: null })} style={{ width: 120 }}>
            <option value="">전체 레벨</option>
            {Array.from({ length: track === "topik" ? 6 : 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {levelText(track, n)}
              </option>
            ))}
          </Select>
          <Select aria-label="주의 필요" value={flag} onChange={(e) => f.patch({ flag: e.target.value, page: null })} style={{ width: 150 }}>
            <option value="">전체</option>
            <option value="provisional">임시 배치</option>
            <option value="insufficient">근거 부족</option>
            <option value="stalled">진행 정체(30일)</option>
            <option value="errors">평가 오류·대기</option>
          </Select>
          <Select aria-label="성장 기간" value={period} onChange={(e) => f.patch({ period: e.target.value, page: null })} style={{ width: 110 }}>
            <option value="7">7일</option>
            <option value="30">30일</option>
            <option value="90">90일</option>
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
                navigate(`/learning/proficiency/${r.user_id}?track=${track}`, {
                  state: originFrom("실력 판정", `${location.pathname}${location.search}`),
                })
              }
              empty="조건에 맞는 학습자가 없습니다."
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(p) => f.patch({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
