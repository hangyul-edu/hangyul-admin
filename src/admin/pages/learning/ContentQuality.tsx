import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { ContentDiagnosticRow, ContentVersionDetail, ContentVersionSummary } from "../../learningApi";
import { DIMENSION_LABEL, RatioView, TRACK_LABEL, pct } from "../../components/learning";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dl,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  Select,
  Textarea,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { formatDateTime } from "../../lib/format";

type Tab = "coverage" | "diagnostics" | "queue";

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "초안",
  in_review: "검수 중",
  published: "게시됨",
  superseded: "대체됨",
  retired: "회수됨",
  rejected: "반려됨",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  legacy_unreviewed: "기존 콘텐츠(미검수)",
  auto_published: "자동 게시(미검수)",
  pending: "검수 대기",
  approved: "승인됨",
  changes_requested: "수정 요청",
  rejected: "반려됨",
};

const BLOCKER_LABEL: Record<string, string> = {
  validation_failed: "자동 검증 실패",
  media_not_ready: "필수 미디어 없음",
  educational_approval_missing: "교육 검수 승인 없음",
  self_approval_only: "작성자 본인 승인만 있음",
  blind_solve_missing: "블라인드 풀이 없음",
  blind_solve_disagreement_unresolved: "블라인드 풀이 불일치 미해결",
};

const CHECKLIST: [string, string][] = [
  ["natural_korean", "자연스러운 한국어"],
  ["grammar_accurate", "문법 정확성"],
  ["level_fit", "수준 적합성"],
  ["coherent", "맥락 일관성"],
  ["answerable", "풀이 가능성"],
  ["distractors_plausible", "오답 선택지 타당성"],
  ["translation_accurate", "번역 정확성"],
  ["not_ambiguous", "모호하지 않음"],
];

export function ContentQualityPage() {
  const f = useUrlFilters();
  const tab = (f.value("tab", "coverage") as Tab) || "coverage";
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>콘텐츠 품질·검수</h1>
          <div className="hgadm-page-head__desc">
            검수·게시된 콘텐츠 재고와 부족 신호, 문항별 실제 학습 결과, 검수 대기열을 확인합니다.
          </div>
        </div>
      </div>
      <div className="hgadm-tabs" role="tablist">
        {(
          [
            ["coverage", "커버리지"],
            ["diagnostics", "문항 진단"],
            ["queue", "검수 대기열"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`hgadm-tab ${tab === key ? "active" : ""}`}
            onClick={() => f.patch({ tab: key, page: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "coverage" && <CoverageTab />}
      {tab === "diagnostics" && <DiagnosticsTab />}
      {tab === "queue" && <QueueTab />}
    </div>
  );
}

/* ---------- Coverage ---------- */

function CoverageTab() {
  const q = useQuery({ queryKey: ["admin", "learning", "coverage"], queryFn: () => learningApi.coverage({}) });
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState message="커버리지를 불러오지 못했습니다." onRetry={() => void q.refetch()} />;
  const c = q.data;
  const weakest = c.skills.slice(0, 15);
  return (
    <>
      <div className="hgadm-card">
        <h2>수준별 재고</h2>
        <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
          필요량 = 세션당 신규 {c.assumptions.new_items_per_session} × 주 {c.assumptions.sessions_per_week}회 × {c.assumptions.variation_weeks}주 × 맞춤화 여유 {c.assumptions.customization_headroom} = {c.assumptions.required_new_items}개 ({c.model_version}). 예정된 복습은 신규 수요에 포함하지 않습니다.
        </div>
        <DataTable
          rows={c.bands}
          rowKey={(b) => `${b.track}-${b.band}`}
          columns={[
            { key: "track", header: "트랙", render: (b) => TRACK_LABEL[b.track] ?? b.track },
            { key: "band", header: "수준", numeric: true, render: (b) => b.band },
            { key: "eligible", header: "제공 가능", numeric: true, render: (b) => b.eligible.toLocaleString() },
            { key: "approved", header: "검수 승인", numeric: true, render: (b) => b.approved.toLocaleString() },
            { key: "legacy", header: "기존(미검수)", numeric: true, render: (b) => b.legacy_unreviewed.toLocaleString() },
            { key: "auto", header: "자동 게시", numeric: true, render: (b) => b.auto_published.toLocaleString() },
            { key: "required", header: "필요량", numeric: true, render: (b) => b.required_new_items.toLocaleString() },
            { key: "shortage", header: "부족분", numeric: true, render: (b) => b.shortage.toLocaleString() },
            {
              key: "status",
              header: "상태",
              render: (b) => <Badge tone={b.status === "short" ? "warning" : "success"}>{b.status === "short" ? "부족" : "충분"}</Badge>,
            },
          ]}
        />
      </div>
      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <h2>게시 문항이 적은 기술</h2>
          <DataTable
            rows={weakest}
            rowKey={(s) => s.skill_id}
            empty="대상 데이터 없음"
            columns={[
              { key: "name", header: "기술", render: (s) => s.name_ko },
              { key: "n", header: "게시 버전", numeric: true, render: (s) => s.published_versions },
            ]}
          />
        </div>
        <div className="hgadm-card">
          <h2>상태별 버전</h2>
          <Dl
            items={[
              ["기술 연결 없는 제공 가능 문항", `${c.eligible_without_skill_link.toLocaleString()}개 (세션에 제공되지 않음)`],
              ...c.lifecycle.map(
                (l) =>
                  [
                    `${LIFECYCLE_LABEL[l.lifecycle] ?? l.lifecycle} · ${REVIEW_STATUS_LABEL[l.review_status] ?? l.review_status}`,
                    l.count.toLocaleString(),
                  ] as [string, string],
              ),
            ]}
          />
        </div>
      </div>
    </>
  );
}

/* ---------- Diagnostics ---------- */

function DiagnosticsTab() {
  const f = useUrlFilters();
  const track = f.value("track");
  const minExposures = f.number("min_exposures", 1);
  const sort = f.value("sort", "exposures");
  const page = f.number("page", 1);
  const q = useQuery({
    queryKey: ["admin", "learning", "content", { track, minExposures, sort, page }],
    queryFn: () =>
      learningApi.content({ track: track || undefined, min_exposures: minExposures, sort, page, page_size: 25 }),
  });
  const columns: Column<ContentDiagnosticRow>[] = [
    {
      key: "item",
      header: "문항",
      render: (r) => (
        <div style={{ maxWidth: 360 }}>
          <div className="hgadm-cell-main" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.preview || "(내용 없음)"}
          </div>
          <div className="hgadm-cell-sub">
            v{r.version_no} · {TRACK_LABEL[r.track] ?? r.track} {r.band} · {r.task_type} · {REVIEW_STATUS_LABEL[r.review_status] ?? r.review_status}
          </div>
        </div>
      ),
    },
    { key: "exp", header: "노출", numeric: true, render: (r) => r.exposures.toLocaleString() },
    { key: "acc", header: "독립 정답률", render: (r) => <RatioView ratio={r.independent_accuracy} /> },
    { key: "assist", header: "도움 사용 첫 시도", numeric: true, render: (r) => r.assisted_first_attempts },
    {
      key: "diff",
      header: "난이도 (편집 / 관측)",
      render: (r) => `${pct(r.editorial_difficulty, 0)} / ${pct(r.observed_difficulty, 0)}`,
    },
    {
      key: "choices",
      header: "선택 분포",
      render: (r) =>
        Object.keys(r.choice_distribution).length === 0 ? (
          <span className="hgadm-cell-sub">—</span>
        ) : (
          <span className="hgadm-cell-mono">
            {Object.entries(r.choice_distribution)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => `${k === r.correct_choice ? `${k}✓` : k}:${n}`)
              .join(" ")}
          </span>
        ),
    },
    {
      key: "issues",
      header: "신고",
      render: (r) =>
        Object.keys(r.issues).length === 0 ? "—" : Object.entries(r.issues).map(([s, n]) => `${s} ${n}`).join(", "),
    },
  ];
  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <Select value={track} aria-label="트랙" onChange={(e) => f.patch({ track: e.target.value, page: null })} style={{ width: 140 }}>
          <option value="">전체 트랙</option>
          <option value="conversation">회화</option>
          <option value="topik">TOPIK</option>
        </Select>
        <Select value={String(minExposures)} aria-label="최소 노출" onChange={(e) => f.patch({ min_exposures: e.target.value, page: null })} style={{ width: 160 }}>
          <option value="1">노출 1회 이상</option>
          <option value="10">노출 10회 이상</option>
          <option value="30">노출 30회 이상</option>
        </Select>
        <Select value={sort} aria-label="정렬" onChange={(e) => f.patch({ sort: e.target.value, page: null })} style={{ width: 140 }}>
          <option value="exposures">노출순</option>
          <option value="band">수준순</option>
        </Select>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState message="문항 진단을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
            미해결 신고 {q.data.open_issues.toLocaleString()}건 · 검수 상태별:{" "}
            {Object.entries(q.data.review_backlog)
              .map(([k, n]) => `${REVIEW_STATUS_LABEL[k] ?? k} ${n.toLocaleString()}`)
              .join(", ") || "대상 데이터 없음"}
            . 편집 난이도는 작성자가 정한 값이고, 관측 난이도는 1 − 독립 정답률입니다.
          </div>
          <DataTable rows={q.data.items} rowKey={(r) => r.version_id} columns={columns} empty="대상 데이터 없음" />
          <Pagination page={page} pageSize={25} total={q.data.total} onPageChange={(p) => f.patch({ page: String(p) })} />
        </>
      )}
    </div>
  );
}

/* ---------- Review queue ---------- */

function QueueTab() {
  const f = useUrlFilters();
  const { can } = useAdminAuth();
  const lifecycle = f.value("lifecycle", "in_review");
  const reviewStatus = f.value("review_status");
  const track = f.value("track");
  const page = f.number("page", 1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [blindId, setBlindId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin", "learning", "versions", { lifecycle, reviewStatus, track, page }],
    queryFn: () =>
      learningApi.versions({
        lifecycle: lifecycle === "all" ? undefined : lifecycle,
        review_status: reviewStatus || undefined,
        track: track || undefined,
        page,
        page_size: 25,
      }),
  });
  const columns: Column<ContentVersionSummary>[] = [
    {
      key: "preview",
      header: "내용",
      render: (v) => (
        <div style={{ maxWidth: 420 }}>
          <div className="hgadm-cell-main" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {v.preview}
          </div>
          <div className="hgadm-cell-sub">v{v.version_no}</div>
        </div>
      ),
    },
    { key: "track", header: "트랙·수준", render: (v) => `${TRACK_LABEL[v.track] ?? v.track} ${v.band}` },
    { key: "life", header: "상태", render: (v) => <Badge tone="info">{LIFECYCLE_LABEL[v.lifecycle] ?? v.lifecycle}</Badge> },
    { key: "review", header: "검수", render: (v) => REVIEW_STATUS_LABEL[v.review_status] ?? v.review_status },
    {
      key: "valid",
      header: "자동 검증",
      render: (v) =>
        v.validation_passed === null ? "—" : <Badge tone={v.validation_passed ? "success" : "danger"}>{v.validation_passed ? "통과" : "실패"}</Badge>,
    },
    { key: "created", header: "생성", render: (v) => formatDateTime(v.created_at) },
    {
      key: "blind",
      header: "",
      render: (v) =>
        can("content:review") && v.is_scored_objective ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setBlindId(v.version_id);
            }}
          >
            블라인드 풀이
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <Select value={lifecycle} aria-label="상태" onChange={(e) => f.patch({ lifecycle: e.target.value, page: null })} style={{ width: 140 }}>
          <option value="in_review">검수 중</option>
          <option value="draft">초안</option>
          <option value="published">게시됨</option>
          <option value="retired">회수됨</option>
          <option value="all">전체</option>
        </Select>
        <Select value={reviewStatus} aria-label="검수 상태" onChange={(e) => f.patch({ review_status: e.target.value, page: null })} style={{ width: 180 }}>
          <option value="">검수 상태 전체</option>
          <option value="legacy_unreviewed">기존 콘텐츠(미검수)</option>
          <option value="auto_published">자동 게시(미검수)</option>
          <option value="pending">검수 대기</option>
          <option value="approved">승인됨</option>
          <option value="changes_requested">수정 요청</option>
          <option value="rejected">반려됨</option>
        </Select>
        <Select value={track} aria-label="트랙" onChange={(e) => f.patch({ track: e.target.value, page: null })} style={{ width: 140 }}>
          <option value="">전체 트랙</option>
          <option value="conversation">회화</option>
          <option value="topik">TOPIK</option>
        </Select>
      </div>
      <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
        상세를 열면 정답을 보게 됩니다. 채점형 문항의 블라인드 풀이는 상세를 열기 전에 먼저 제출하세요.
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState message="검수 대기열을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <DataTable
            rows={q.data.items}
            rowKey={(v) => v.version_id}
            columns={columns}
            onRowClick={(v) => setDetailId(v.version_id)}
            empty="대상 데이터 없음"
          />
          <Pagination page={page} pageSize={25} total={q.data.total} onPageChange={(p) => f.patch({ page: String(p) })} />
        </>
      )}
      {detailId && <VersionModal versionId={detailId} onClose={() => setDetailId(null)} />}
      {blindId && <BlindSolveModal versionId={blindId} onClose={() => setBlindId(null)} />}
    </div>
  );
}

function renderPayload(p: Record<string, unknown>) {
  const choices = (p.choices as string[] | undefined) ?? [];
  const keys = (p.choice_keys as string[] | undefined) ?? choices.map((_, i) => String(i + 1));
  return (
    <div>
      {typeof p.prompt === "string" && <div style={{ fontWeight: 600 }}>{p.prompt}</div>}
      {typeof p.display_text === "string" && <div style={{ fontWeight: 600 }}>{p.display_text}</div>}
      {typeof p.translation === "string" && <div className="hgadm-cell-sub">{p.translation}</div>}
      {typeof p.content_html === "string" && <div className="hgadm-cell-sub">{p.content_html.replace(/<[^>]+>/g, " ")}</div>}
      {choices.length > 0 && (
        <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
          {choices.map((c, i) => (
            <li key={i}>
              <span className="hgadm-cell-mono">{keys[i]}</span> {c}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BlindSolveModal({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [answer, setAnswer] = useState("");
  const view = useQuery({ queryKey: ["admin", "learning", "blind", versionId], queryFn: () => learningApi.blindView(versionId) });
  const solve = useMutation({
    mutationFn: () => learningApi.blindSolve(versionId, { answer }),
    onSuccess: (r) => {
      toast.success(r.agrees_with_key ? "정답 키와 일치합니다." : "정답 키와 달라 검토 이슈가 열렸습니다.");
      // A disagreeing solve opens an issue, which changes the open-issue count
      // and the version's publication check.
      void qc.invalidateQueries({ queryKey: ["admin", "learning"] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      title="블라인드 풀이"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!answer.trim()} loading={solve.isPending} onClick={() => solve.mutate()}>
            제출
          </Button>
        </>
      }
    >
      {view.isLoading ? (
        <LoadingState />
      ) : view.isError || !view.data ? (
        <ErrorState message="문항을 불러오지 못했습니다." />
      ) : (
        <>
          <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
            정답과 해설은 표시되지 않습니다. 스스로 푼 답을 입력하세요.
          </div>
          {renderPayload(view.data.public_payload)}
          <Field label="내 답" hint={view.data.answer_format_hint}>
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="내 답" />
          </Field>
        </>
      )}
    </Modal>
  );
}

function VersionModal({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("");
  const [severity, setSeverity] = useState<"normal" | "critical">("normal");
  const q = useQuery({ queryKey: ["admin", "learning", "version", versionId], queryFn: () => learningApi.version(versionId) });

  function done(message: string) {
    toast.success(message);
    void qc.invalidateQueries({ queryKey: ["admin", "learning"] });
  }
  const submit = useMutation({ mutationFn: () => learningApi.submitVersion(versionId), onSuccess: () => done("검수를 요청했습니다."), onError: toastError });
  const review = useMutation({
    mutationFn: (decision: string) => learningApi.reviewVersion(versionId, { decision, checklist, note: note || undefined }),
    onSuccess: () => done("검수 결과를 기록했습니다."),
    onError: toastError,
  });
  const publish = useMutation({ mutationFn: () => learningApi.publishVersion(versionId), onSuccess: () => done("게시했습니다."), onError: toastError });
  const retire = useMutation({
    mutationFn: () => learningApi.retireVersion(versionId, { reason: retireReason, severity }),
    onSuccess: () => {
      setRetireOpen(false);
      done("회수했습니다.");
    },
    onError: toastError,
  });

  const v: ContentVersionDetail | undefined = q.data;
  return (
    <Modal open title="콘텐츠 버전 상세" size="xl" onClose={onClose}>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !v ? (
        <ErrorState message="버전을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <div>
          <Dl
            items={[
              ["내용", v.preview || "(내용 없음)"],
              ["버전", `v${v.version_no}`],
              ["상태", `${LIFECYCLE_LABEL[v.lifecycle] ?? v.lifecycle} · ${REVIEW_STATUS_LABEL[v.review_status] ?? v.review_status}`],
              ["트랙·수준·유형", `${TRACK_LABEL[v.track] ?? v.track} ${v.band} · ${v.task_type}`],
              ["작성 방식·출처", `${v.authoring_method} · ${v.source_use}`],
              ["편집 난이도", `${pct(v.difficulty_estimate, 0)} (${v.difficulty_method})`],
              ["회수 사유", v.retirement_reason ? `${v.retirement_reason} (${v.retirement_severity})` : "—"],
            ]}
          />
          <h3>학습자에게 보이는 내용</h3>
          {renderPayload(v.public_payload)}
          <h3>정답 키</h3>
          <pre className="hgadm-cell-mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(v.answer_key, null, 2)}</pre>
          <h3>해설·힌트</h3>
          {v.explanations.length === 0 ? (
            <div className="hgadm-cell-sub">없음</div>
          ) : (
            <ul>
              {v.explanations.map((e, i) => (
                <li key={i}>
                  <Badge tone="neutral">{e.kind}{e.choice_key ? ` ${e.choice_key}` : ""}</Badge> {e.body}
                </li>
              ))}
            </ul>
          )}
          <h3>연결 기술</h3>
          <div>
            {v.skills.length === 0
              ? "없음 (세션에 제공되지 않음)"
              : v.skills
                  .map((s) => `${s.name_ko ?? "(이름 없는 기술)"} (${s.role === "primary" ? "주" : "보조"}/${DIMENSION_LABEL[s.dimension] ?? s.dimension})`)
                  .join(", ")}
          </div>
          <h3>자동 검증</h3>
          {v.validation.slice(0, 1).map((r, i) => (
            <div key={i}>
              <Badge tone={r.passed ? "success" : "danger"}>{r.passed ? "통과" : "실패"}</Badge> {r.validator} · {formatDateTime(r.ran_at)}
              <ul>
                {r.findings.map((fd, j) => (
                  <li key={j}>
                    [{fd.severity}] {fd.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <h3>검수 기록</h3>
          {v.reviews.length === 0 ? (
            <div className="hgadm-cell-sub">없음</div>
          ) : (
            <ul>
              {v.reviews.map((r) => (
                <li key={r.review_id}>
                  {r.kind === "blind_solve" ? "블라인드 풀이" : "교육 검수"} · {r.decision}
                  {r.agrees_with_key !== null ? ` · 키 일치: ${r.agrees_with_key ? "예" : "아니요"}` : ""} · {formatDateTime(r.reviewed_at)}
                  {r.note ? ` — ${r.note}` : ""}
                </li>
              ))}
            </ul>
          )}
          <h3>변경 이력</h3>
          <ul>
            {v.actions.map((a, i) => (
              <li key={i}>
                {formatDateTime(a.acted_at)} · {a.action}: {a.from_state ?? "—"} → {a.to_state}
                {a.reason ? ` (${a.reason})` : ""}
              </li>
            ))}
          </ul>
          <h3>게시 가능 여부 ({v.publication_check.policy})</h3>
          {v.publication_check.allowed ? (
            <Badge tone="success">게시 가능</Badge>
          ) : (
            <ul aria-label="게시 차단 사유">
              {v.publication_check.blockers.map((b) => (
                <li key={b}>{BLOCKER_LABEL[b] ?? b}</li>
              ))}
            </ul>
          )}

          <div className="hgadm-toolbar" style={{ marginTop: 16, flexWrap: "wrap" }}>
            {can("content:write") && v.lifecycle === "draft" && (
              <Button loading={submit.isPending} onClick={() => submit.mutate()}>
                검수 요청
              </Button>
            )}
            {can("content:publish") && v.lifecycle === "in_review" && (
              // The server refuses a blocked publish (409); the reasons are listed above.
              <Button
                variant="primary"
                loading={publish.isPending}
                disabled={!v.publication_check.allowed}
                onClick={() => publish.mutate()}
              >
                게시
              </Button>
            )}
            {can("content:publish") && (v.lifecycle === "published" || v.lifecycle === "superseded") && (
              <Button variant="danger-soft" onClick={() => setRetireOpen(true)}>
                회수
              </Button>
            )}
          </div>

          {can("content:review") && v.lifecycle === "in_review" && (
            <div className="hgadm-card" style={{ marginTop: 12 }}>
              <h3>교육 검수</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                {CHECKLIST.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(checklist[key])}
                      onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
              <Field label="메모">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </Field>
              <div className="hgadm-toolbar">
                <Button variant="primary" loading={review.isPending} onClick={() => review.mutate("approved")}>
                  승인
                </Button>
                <Button loading={review.isPending} onClick={() => review.mutate("changes_requested")}>
                  수정 요청
                </Button>
                <Button variant="danger-soft" loading={review.isPending} onClick={() => review.mutate("rejected")}>
                  반려
                </Button>
              </div>
            </div>
          )}

          <ConfirmDialog
            open={retireOpen}
            title="버전 회수"
            danger
            confirmLabel="회수"
            loading={retire.isPending}
            onCancel={() => setRetireOpen(false)}
            onConfirm={() => {
              if (retireReason.trim().length < 3) {
                toast.error("회수 사유를 3자 이상 입력하세요.");
                return;
              }
              retire.mutate();
            }}
            message={
              <div>
                <Field label="사유" required>
                  <Input value={retireReason} onChange={(e) => setRetireReason(e.target.value)} aria-label="회수 사유" />
                </Field>
                <Field label="심각도" hint="심각(critical): 진행 중 세션에서 건너뛰고, 이 버전의 학습 증거를 제외합니다.">
                  <Select value={severity} aria-label="심각도" onChange={(e) => setSeverity(e.target.value as "normal" | "critical")}>
                    <option value="normal">일반</option>
                    <option value="critical">심각 (정답 오류 등)</option>
                  </Select>
                </Field>
              </div>
            }
          />
        </div>
      )}
    </Modal>
  );
}
