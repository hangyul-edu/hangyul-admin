import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { AiFeature, AiUsageGroup, TutorTurnRow } from "../../learningApi";
import { RatioView, pct } from "../../components/learning";
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  Select,
  Switch,
  Textarea,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { formatDateTime } from "../../lib/format";

const FEATURE_LABEL: Record<string, string> = {
  "customization.interpret": "맞춤화 요청 해석",
  "tutor.explain": "튜터 설명",
  "custom_practice.generate": "맞춤 연습 생성",
};

const ROUTE_LABEL: Record<string, string> = {
  stored_hint: "저장된 힌트",
  stored_explanation: "저장된 해설",
  grounded_generation: "근거 기반 생성",
  fallback: "대체 응답",
  refused: "정답 노출 차단",
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function AiOpsPage() {
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>AI 운영·튜터 품질</h1>
          <div className="hgadm-page-head__desc">
            AI 기능별 사용 여부와 예산, 모델 호출의 신뢰성·지연·비용, 튜터 응답의 사람 검수 결과를 확인합니다. AI 기능을 꺼도 기본 학습은 계속됩니다.
          </div>
        </div>
      </div>
      <FeaturesSection />
      <UsageSection />
      <TutorSection />
    </div>
  );
}

/* ---------- Feature controls ---------- */

function FeaturesSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const [editing, setEditing] = useState<AiFeature | null>(null);
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["admin", "learning", "ai-features"], queryFn: learningApi.aiFeatures });
  const update = useMutation({
    mutationFn: (f: AiFeature) => learningApi.updateAiFeature(f.feature, { enabled: !f.enabled, reason }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "기능을 켰습니다." : "기능을 껐습니다.");
      setEditing(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin", "learning", "ai-features"] });
    },
    onError: toastError,
  });
  const columns: Column<AiFeature>[] = [
    {
      key: "feature",
      header: "기능",
      render: (f) => (
        <div>
          <div>{FEATURE_LABEL[f.feature] ?? f.feature}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{f.feature} · {f.tier}</div>
        </div>
      ),
    },
    {
      key: "enabled",
      header: "상태",
      render: (f) => (
        <div>
          <Badge tone={f.enabled ? "success" : "neutral"}>{f.enabled ? "켜짐" : "꺼짐"}</Badge>
          {f.disabled_reason && <div className="hgadm-cell-sub">{f.disabled_reason}</div>}
        </div>
      ),
    },
    { key: "user", header: "학습자별 일일 한도", numeric: true, render: (f) => (f.per_user_daily_cents ? usd(f.per_user_daily_cents) : "제한 없음") },
    { key: "month", header: "월 한도", numeric: true, render: (f) => (f.monthly_cents ? usd(f.monthly_cents) : "제한 없음") },
    { key: "spent", header: "이번 달 사용 (추정)", numeric: true, render: (f) => usd(f.month_to_date_cents_estimated) },
    {
      key: "action",
      header: "",
      render: (f) =>
        can("ai:write") ? (
          <Button size="sm" variant={f.enabled ? "danger-soft" : "secondary"} onClick={() => setEditing(f)}>
            {f.enabled ? "끄기" : "켜기"}
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="hgadm-card">
      <h2>AI 기능 제어</h2>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState message="AI 기능 설정을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
            금액은 단가표({q.data.rate_card_version}) 기준 추정치이며 통화는 {q.data.currency}입니다.
          </div>
          <DataTable rows={q.data.features} rowKey={(f) => f.feature} columns={columns} empty="대상 데이터 없음" />
        </>
      )}
      {editing && (
        <Modal
          open
          title={`${FEATURE_LABEL[editing.feature] ?? editing.feature} ${editing.enabled ? "끄기" : "켜기"}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                취소
              </Button>
              <Button
                variant="primary"
                disabled={reason.trim().length < 3}
                loading={update.isPending}
                onClick={() => update.mutate(editing)}
              >
                적용
              </Button>
            </>
          }
        >
          <Field label="사유" required hint="관리자 활동 내역에 기록됩니다.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="사유" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Usage ---------- */

function UsageSection() {
  const f = useUrlFilters();
  const days = f.number("days", 7);
  const q = useQuery({ queryKey: ["admin", "learning", "ai-usage", days], queryFn: () => learningApi.aiUsage(days) });
  const columns: Column<AiUsageGroup>[] = [
    { key: "feature", header: "기능", render: (g) => FEATURE_LABEL[g.feature] ?? g.feature },
    { key: "model", header: "모델·프롬프트", render: (g) => <span className="hgadm-cell-mono">{g.model} · {g.prompt_version ?? "—"}</span> },
    { key: "calls", header: "호출", numeric: true, render: (g) => g.calls.toLocaleString() },
    { key: "err", header: "오류율", numeric: true, render: (g) => (g.error_rate === null ? "대상 데이터 없음" : pct(g.error_rate)) },
    { key: "retry", header: "재시도", numeric: true, render: (g) => g.retries },
    { key: "lat", header: "지연 p50/p95 (ms)", numeric: true, render: (g) => `${g.latency_ms_p50 ?? "—"} / ${g.latency_ms_p95 ?? "—"}` },
    {
      key: "cost",
      header: "비용 (추정)",
      numeric: true,
      render: (g) => (
        <div>
          {usd(g.cost_cents_estimated)}
          {g.calls_cost_unavailable > 0 && <div className="hgadm-cell-sub">비용 미확인 {g.calls_cost_unavailable}건</div>}
        </div>
      ),
    },
    {
      key: "outcomes",
      header: "결과",
      render: (g) => (
        <span className="hgadm-cell-mono">
          {Object.entries(g.outcomes).map(([k, n]) => `${k}:${n}`).join(" ")}
        </span>
      ),
    },
  ];
  return (
    <div className="hgadm-card">
      <h2>사용량·신뢰성</h2>
      <div className="hgadm-toolbar">
        <Select value={String(days)} aria-label="기간" onChange={(e) => f.patch({ days: e.target.value })} style={{ width: 140 }}>
          <option value="7">최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 90일</option>
        </Select>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState message="사용량을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <>
          <DataTable
            rows={q.data.groups}
            rowKey={(g) => `${g.feature}-${g.model}-${g.prompt_version}`}
            columns={columns}
            empty="대상 데이터 없음"
          />
          <div className="hgadm-cell-sub" style={{ marginTop: 8 }}>
            비용은 단가표({q.data.rate_card_version}) 기준 추정치이며, 공급사 청구 금액과 대조되지 않았습니다. 게이트웨이 도입 이전·기능 미지정 호출: {q.data.legacy_unattributed.calls.toLocaleString()}건, {usd(q.data.legacy_unattributed.cost_cents)} (추정).
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Tutor quality ---------- */

function TutorSection() {
  const f = useUrlFilters();
  const { can } = useAdminAuth();
  const flagged = f.value("flagged") === "1";
  const unreviewed = f.value("unreviewed") === "1";
  const route = f.value("route");
  const page = f.number("tpage", 1);
  const [reviewing, setReviewing] = useState<TutorTurnRow | null>(null);
  const reliability = useQuery({ queryKey: ["admin", "learning", "tutor-reliability"], queryFn: learningApi.tutorReliability });
  const turns = useQuery({
    queryKey: ["admin", "learning", "tutor-turns", { flagged, unreviewed, route, page }],
    queryFn: () =>
      learningApi.tutorTurns({
        flagged: flagged || undefined,
        unreviewed: unreviewed || undefined,
        route: route || undefined,
        page,
        page_size: 25,
      }),
  });
  const showText = turns.data?.transcripts_included ?? false;
  const columns: Column<TutorTurnRow>[] = [
    { key: "when", header: "시각", render: (t) => formatDateTime(t.created_at) },
    { key: "mode", header: "모드", render: (t) => (t.mode === "hint_only" ? "힌트 전용" : "설명") },
    {
      key: "route",
      header: "경로",
      render: (t) => (
        <div>
          <Badge tone={t.route === "refused" || t.route === "fallback" ? "warning" : "info"}>{ROUTE_LABEL[t.route] ?? t.route}</Badge>
          {t.leak_check && t.leak_check !== "clean" && <div className="hgadm-cell-sub">{t.leak_check}</div>}
          {t.failure_code && <div className="hgadm-cell-sub">{t.failure_code}</div>}
        </div>
      ),
    },
    { key: "model", header: "모델", render: (t) => <span className="hgadm-cell-mono">{t.model ?? "—"} {t.prompt_version ?? ""}</span> },
    { key: "err", header: "콘텐츠 오류 의심", render: (t) => (t.suspected_content_error ? <Badge tone="danger">의심</Badge> : "—") },
    { key: "fb", header: "학습자 평가", render: (t) => (t.learner_feedback === "up" ? "👍" : t.learner_feedback === "down" ? "👎" : "—") },
    ...(showText
      ? [
          {
            key: "text",
            header: "질문 / 응답 (마스킹)",
            render: (t: TutorTurnRow) => (
              <div style={{ maxWidth: 360 }}>
                <div>{t.question}</div>
                <div className="hgadm-cell-sub">{t.answer}</div>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "review",
      header: "",
      render: (t) =>
        can("content:review") ? (
          <Button size="sm" variant="ghost" onClick={() => setReviewing(t)}>
            검수
          </Button>
        ) : null,
    },
  ];
  const r = reliability.data;
  return (
    <div className="hgadm-card">
      <h2>튜터 품질</h2>
      {reliability.isLoading ? (
        <LoadingState />
      ) : reliability.isError || !r ? (
        <ErrorState message="튜터 신뢰도를 불러오지 못했습니다." onRetry={() => void reliability.refetch()} />
      ) : (
        <div style={{ marginBottom: 12 }}>
          <div>
            사람 검수 기준 정확·근거 비율: <RatioView ratio={r.overall} /> · 정답 노출 판정 {r.overall.leaks}건
          </div>
          <ul>
            {Object.entries(r.by_route).map(([routeKey, v]) => (
              <li key={routeKey}>
                {ROUTE_LABEL[routeKey] ?? routeKey}: <RatioView ratio={v} /> · 노출 {v.leaks}건
              </li>
            ))}
          </ul>
          <div className="hgadm-cell-sub">
            학습자 만족도(별도 지표): 👍 {r.learner_satisfaction.up} · 👎 {r.learner_satisfaction.down}. 좋아요는 정확성의 근거가 아닙니다.
          </div>
        </div>
      )}
      <div className="hgadm-toolbar">
        <label>
          <input type="checkbox" checked={flagged} onChange={(e) => f.patch({ flagged: e.target.checked ? "1" : null, tpage: null })} /> 주의 필요만
        </label>
        <label>
          <input type="checkbox" checked={unreviewed} onChange={(e) => f.patch({ unreviewed: e.target.checked ? "1" : null, tpage: null })} /> 미검수만
        </label>
        <Select value={route} aria-label="경로" onChange={(e) => f.patch({ route: e.target.value, tpage: null })} style={{ width: 160 }}>
          <option value="">모든 경로</option>
          {Object.entries(ROUTE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {turns.isLoading ? (
        <LoadingState />
      ) : turns.isError || !turns.data ? (
        <ErrorState message="튜터 응답 목록을 불러오지 못했습니다." onRetry={() => void turns.refetch()} />
      ) : (
        <>
          {!turns.data.transcripts_included && (
            <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
              대화 원문은 transcripts:read 권한이 필요합니다.
            </div>
          )}
          <DataTable rows={turns.data.items} rowKey={(t) => t.turn_id} columns={columns} empty="대상 데이터 없음" />
          <Pagination page={page} pageSize={25} total={turns.data.total} onPageChange={(p) => f.patch({ tpage: String(p) })} />
        </>
      )}
      {reviewing && <TurnReviewModal turn={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function TurnReviewModal({ turn, onClose }: { turn: TutorTurnRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [correct, setCorrect] = useState(true);
  const [grounded, setGrounded] = useState(true);
  const [leaked, setLeaked] = useState(false);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      learningApi.reviewTutorTurn(turn.turn_id, { correct, grounded, leaked_answer: leaked, note: note || undefined }),
    onSuccess: () => {
      toast.success("검수 결과를 저장했습니다.");
      void qc.invalidateQueries({ queryKey: ["admin", "learning", "tutor-reliability"] });
      void qc.invalidateQueries({ queryKey: ["admin", "learning", "tutor-turns"] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      title="튜터 응답 검수"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            저장
          </Button>
        </>
      }
    >
      <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
        {formatDateTime(turn.created_at)} · {ROUTE_LABEL[turn.route] ?? turn.route}
      </div>
      <Field label="정확한가요?">
        <Switch checked={correct} onChange={setCorrect} label="정확함" />
      </Field>
      <Field label="자료와 검수된 해설에 근거했나요?">
        <Switch checked={grounded} onChange={setGrounded} label="근거 있음" />
      </Field>
      <Field label="힌트가 정답을 노출했나요?">
        <Switch checked={leaked} onChange={setLeaked} label="정답 노출" />
      </Field>
      <Field label="메모">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Field>
    </Modal>
  );
}
