import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { ProficiencyRow, ProficiencyTrack } from "../../proficiencyApi";
import { learningApi } from "../../learningApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { originFrom } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { Badge, Button, DataTable, ErrorState, LoadingState, Pagination, SearchBox, Select } from "../../components/kit";
import type { BadgeTone, Column } from "../../components/kit";
import { downloadExport } from "../../components/learning";
import { PageHero, Panel } from "../../components/insights";
import { Award, Download } from "lucide-react";

const PAGE_SIZE = 25;

export const STATUS_LABEL: Record<ProficiencyRow["status"], { text: string; tone: BadgeTone; hint: string }> = {
  unassessed: { text: "평가 전", tone: "neutral", hint: "아직 실력 평가를 하지 않았어요" },
  insufficient_evidence: { text: "근거 모으는 중", tone: "info", hint: "레벨을 정하기엔 평가가 더 필요해요" },
  provisional: { text: "임시 레벨", tone: "warning", hint: "배치 평가로 정한 레벨이에요" },
  confirmed: { text: "레벨 확정", tone: "success", hint: "평가 기준을 모두 통과했어요" },
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

/** 레벨 판정 — learners' confirmed levels, promotion progress and growth. */
export function ProficiencyLearnersPage() {
  const f = useUrlFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = useAdminAuth();
  const toastError = useToastError();
  const toast = useToast();
  const track =(f.value("track") || "conversation") as ProficiencyTrack;
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

  // A mutation, so a double click is one export (and one download).
  const exporter = useMutation({
    mutationFn: async () => {
      const created = await learningApi.createExport({ report: "proficiency", filters: { track, status, level, flag, q, period } });
      await downloadExport(created.export_id, `proficiency-${track}.csv`);
      return created;
    },
    onSuccess: (created) => toast.success(`CSV를 내보냈어요 (${created.row_count.toLocaleString()}행).`),
    onError: toastError,
  });

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
      header: track === "topik" ? "확정 급수" : "확정 레벨",
      render: (r) => (
        <div>
          <div className="hgadm-cell-main">{levelText(track, r.confirmed_level)}</div>
          {r.provisional_level != null && <div className="hgadm-cell-sub">임시 {levelText(track, r.provisional_level)}</div>}
        </div>
      ),
    },
    {
      key: "coverage",
      header: "다음 레벨 필수 역량",
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
    { key: "growth", header: `최근 ${period}일 성장`, render: (r) => <GrowthCell growth={r.growth} /> },
    {
      key: "fresh",
      header: "마지막 평가",
      render: (r) => (
        <div>
          <div>{r.last_eligible_at ? formatDateTime(r.last_eligible_at) : "없음"}</div>
          {r.stalled && <Badge tone="warning">30일째 제자리</Badge>}
        </div>
      ),
    },
    {
      key: "blocking",
      header: "다음 레벨까지 남은 것",
      render: (r) => (r.main_blocking_label ? r.main_blocking_label.ko : <span className="hgadm-cell-sub">—</span>),
    },
    {
      key: "issues",
      header: "평가 오류",
      numeric: true,
      render: (r) => (r.assessment_issues ? <Badge tone="danger">{r.assessment_issues}</Badge> : "0"),
    },
  ];

  return (
    <div>
      <PageHero
        icon={Award}
        eyebrow="학습 인사이트 · 학습자"
        title="레벨 판정"
        description={
          <>
            실력 평가만으로 정한 회원의 레벨과, 다음 레벨까지 얼마나 왔는지예요. 강의 시청·포인트·푼 문제 수는 레벨에
            반영되지 않아요. &quot;다음 레벨 필수 역량&quot;은 합격 확률이 아니라 이미 확인된 역량의 비율이에요.{" "}
            <Link to="/learning/proficiency-policy">판정 기준 보기</Link>
          </>
        }
        actions={
          can("exports:create") && can("learners:read") ? (
            <Button loading={exporter.isPending} onClick={() => exporter.mutate()}>
              <Download size={15} strokeWidth={2} aria-hidden />
              CSV 내보내기
            </Button>
          ) : undefined
        }
      />

      {cohort.data && (
        <Panel
          title={`${track === "topik" ? "TOPIK" : "회화"} 레벨 분포`}
          description={`${cohort.data.note.ko} 기록 있는 회원 ${cohort.data.denominator.toLocaleString()}명 · 기록 없는 회원 ${cohort.data.learners_without_record.toLocaleString()}명`}
        >
          <div className="hgins-facts">
            {Object.entries(STATUS_LABEL).map(([key, v]) => (
              <div key={key} className={`hgins-fact${key === "confirmed" ? " hgins-fact--good" : ""}`}>
                <div className="hgins-fact__label">{v.text}</div>
                <div className="hgins-fact__value">{(cohort.data.by_status[key] ?? 0).toLocaleString()}명</div>
                <div className="hgins-fact__hint">{v.hint}</div>
              </div>
            ))}
          </div>
          {Object.keys(cohort.data.confirmed_by_level).length > 0 && (
            <div className="hgadm-prof-chips hgadm-mt-12">
              <span className="hgins-cta__hint">확정 레벨별</span>
              {Object.entries(cohort.data.confirmed_by_level).map(([lv, n]) => (
                <Badge key={lv} tone="neutral">
                  {levelText(track, Number(lv))} {n}명
                </Badge>
              ))}
            </div>
          )}
        </Panel>
      )}

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} maxLength={64} placeholder="사용자 ID 또는 닉네임" onSearch={(next) => f.patch({ q: next, page: null })} />
          <Select aria-label="트랙" value={track} onChange={(e) => f.patch({ track: e.target.value, level: null, page: null })}>
            <option value="conversation">회화</option>
            <option value="topik">TOPIK</option>
          </Select>
          <Select aria-label="상태" value={status} onChange={(e) => f.patch({ status: e.target.value, page: null })}>
            <option value="">전체 상태</option>
            {/* Every status the server filters on, "평가 전" included. */}
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label.text}
              </option>
            ))}
          </Select>
          <Select aria-label="확인 레벨" value={level} onChange={(e) => f.patch({ level: e.target.value, page: null })}>
            <option value="">전체 레벨</option>
            {Array.from({ length: track === "topik" ? 6 : 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {levelText(track, n)}
              </option>
            ))}
          </Select>
          <Select aria-label="주의 필요" value={flag} onChange={(e) => f.patch({ flag: e.target.value, page: null })}>
            <option value="">살펴볼 회원 전체</option>
            <option value="provisional">임시 레벨인 회원</option>
            <option value="insufficient">평가가 부족한 회원</option>
            <option value="stalled">30일째 제자리인 회원</option>
            <option value="errors">평가 오류·대기가 있는 회원</option>
          </Select>
          <Select aria-label="성장 기간" value={period} onChange={(e) => f.patch({ period: e.target.value, page: null })}>
            <option value="7">최근 7일 성장</option>
            <option value="30">최근 30일 성장</option>
            <option value="90">최근 90일 성장</option>
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
                  state: originFrom("레벨 판정", `${location.pathname}${location.search}`),
                })
              }
              empty="조건에 맞는 회원이 없어요. 필터를 바꿔 보세요."
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(p) => f.patch({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
