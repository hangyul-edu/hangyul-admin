import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
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
  Timestamp,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { Notice, PageHero, Panel } from "../../components/insights";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { formatDateTime } from "../../lib/format";

const FEATURE_LABEL: Record<string, string> = {
  "customization.interpret": "맞춤 요청 해석",
  "tutor.explain": "AI 튜터 설명",
  "custom_practice.generate": "맞춤 연습 만들기",
  "content_factory.generate": "콘텐츠 일괄 생성",
  "proficiency.score_conversation": "회화 실력 평가 채점",
  "proficiency.score_writing": "TOPIK 쓰기 채점",
};

const FEATURE_HINT: Record<string, string> = {
  "customization.interpret": "회원이 말로 한 요청(주제·난이도)을 학습 설정으로 바꿔요",
  "tutor.explain": "문제를 풀다 막힌 회원에게 힌트와 설명을 줘요",
  "custom_practice.generate": "검수된 문항이 모자랄 때 연습 문항을 새로 만들어요",
  "content_factory.generate": "관리자가 요청한 콘텐츠를 한꺼번에 만들어요",
  "proficiency.score_conversation": "회화 평가 답변을 채점해요",
  "proficiency.score_writing": "TOPIK 쓰기 답안을 채점해요",
};

const DISABLED_REASON: Record<string, string> = {
  disabled_by_default: "기본으로 꺼져 있어요",
};

const ROUTE_LABEL: Record<string, string> = {
  stored_hint: "저장된 힌트",
  stored_explanation: "검수된 해설",
  grounded_generation: "자료를 근거로 새로 작성",
  fallback: "기본 안내",
  refused: "정답 노출 차단",
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function AiOpsPage() {
  return (
    <div>
      <PageHero
        icon={Cpu}
        eyebrow="학습 인사이트 · 맞춤 학습·AI"
        title="AI 기능·비용"
        description="AI 기능을 켜고 끄고, 비용과 오류를 확인하고, AI 튜터의 답변이 정확한지 검수해요. AI 기능을 꺼도 기본 학습은 그대로 이용할 수 있어요."
      />
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
      toast.success(r.enabled ? "기능을 켰어요." : "기능을 껐어요.");
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
          <div className="hgadm-cell-main">{FEATURE_LABEL[f.feature] ?? f.feature}</div>
          <div className="hgadm-cell-sub">{FEATURE_HINT[f.feature] ?? <span className="hgadm-cell-mono">{f.feature}</span>}</div>
        </div>
      ),
    },
    {
      key: "enabled",
      header: "상태",
      render: (f) => (
        <div>
          <Badge tone={f.enabled ? "success" : "neutral"} dot>
            {f.enabled ? "켜짐" : "꺼짐"}
          </Badge>
          {f.disabled_reason && <div className="hgadm-cell-sub">{DISABLED_REASON[f.disabled_reason] ?? f.disabled_reason}</div>}
        </div>
      ),
    },
    { key: "user", header: "회원 1명 하루 한도", numeric: true, render: (f) => (f.per_user_daily_cents ? usd(f.per_user_daily_cents) : "제한 없음") },
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
    <Panel
      title="AI 기능 켜고 끄기"
      description={
        q.data
          ? `기능마다 쓸 수 있는 금액 한도가 있어요. 금액은 단가표(${q.data.rate_card_version}) 기준 추정치이며 통화는 ${q.data.currency}예요.`
          : undefined
      }
    >
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState message="AI 기능 설정을 불러오지 못했습니다." onRetry={() => void q.refetch()} />
      ) : (
        <DataTable rows={q.data.features} rowKey={(f) => f.feature} columns={columns} empty="아직 데이터 없음" />
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
          <p className="hgins-cta__hint hgadm-mt-0 hgadm-mb-12">
            {editing.enabled
              ? "끄면 이 기능을 쓰는 화면은 AI 없이 동작하는 기본 방식으로 바뀌어요."
              : "켜면 바로 회원에게 적용되고, 한도 안에서 비용이 발생해요."}
          </p>
          <Field label="사유" required hint="관리자 활동 내역에 남아요. 3자 이상 입력하세요.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="사유" />
          </Field>
        </Modal>
      )}
    </Panel>
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
    { key: "calls", header: "호출 수", numeric: true, render: (g) => g.calls.toLocaleString() },
    { key: "err", header: "오류율", numeric: true, render: (g) => (g.error_rate === null ? "아직 데이터 없음" : pct(g.error_rate)) },
    { key: "retry", header: "재시도", numeric: true, render: (g) => g.retries },
    { key: "lat", header: "응답 시간 보통/느릴 때 (ms)", numeric: true, render: (g) => `${g.latency_ms_p50 ?? "—"} / ${g.latency_ms_p95 ?? "—"}` },
    {
      key: "cost",
      header: "비용 (추정)",
      numeric: true,
      render: (g) => (
        <div>
          {usd(g.cost_cents_estimated)}
          {g.calls_cost_unavailable > 0 && <div className="hgadm-cell-sub">비용 확인 안 됨 {g.calls_cost_unavailable}건</div>}
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
    <Panel
      title="사용량·오류"
      description="기능과 모델별로 얼마나 불렀고, 얼마나 실패했고, 얼마가 들었는지예요."
      actions={
        <div className="hgins-seg" role="radiogroup" aria-label="기간">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={days === n}
              className={`hgins-seg__btn${days === n ? " is-on" : ""}`}
              onClick={() => f.patch({ days: String(n) })}
            >
              최근 {n}일
            </button>
          ))}
        </div>
      }
    >
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
            empty="이 기간에 AI를 호출한 기록이 없어요"
          />
          <p className="hgins-cta__hint hgadm-mt-12">
            비용은 단가표({q.data.rate_card_version}) 기준 추정치로, 실제 청구 금액과 다를 수 있어요. 기능이 정해지지 않은 예전 호출{" "}
            {q.data.legacy_unattributed.calls.toLocaleString()}건 · {usd(q.data.legacy_unattributed.cost_cents)} (추정)은 위 표에 포함되지 않아요.
          </p>
        </>
      )}
    </Panel>
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
    { key: "when", header: "일시", render: (t) => <Timestamp at={t.created_at} /> },
    { key: "mode", header: "요청", render: (t) => (t.mode === "hint_only" ? "힌트만" : "설명") },
    {
      key: "route",
      header: "답한 방법",
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
    { key: "fb", header: "회원 반응", render: (t) => (t.learner_feedback === "up" ? "👍" : t.learner_feedback === "down" ? "👎" : "—") },
    ...(showText
      ? [
          {
            key: "text",
            header: "질문 / 답변 (개인정보 가림)",
            render: (t: TutorTurnRow) => (
              <div className="hgadm-cell-text hgadm-cell-text--narrow">
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
    <Panel
      title="AI 튜터 답변 검수"
      description="사람이 직접 확인한 답변을 기준으로 튜터가 얼마나 정확한지 봐요. 회원의 👍는 만족도일 뿐, 정확하다는 근거는 아니에요."
    >
      {reliability.isLoading ? (
        <LoadingState />
      ) : reliability.isError || !r ? (
        <ErrorState message="튜터 정확도를 불러오지 못했습니다." onRetry={() => void reliability.refetch()} />
      ) : (
        <div className="hgins-facts hgadm-mb-12">
          <div className="hgins-fact">
            <div className="hgins-fact__label">정확하고 근거 있는 답변</div>
            <div className="hgins-fact__value">
              <RatioView ratio={r.overall} />
            </div>
            <div className="hgins-fact__hint">사람이 검수한 답변 기준</div>
          </div>
          <div className={`hgins-fact${r.overall.leaks ? " hgins-fact--bad" : ""}`}>
            <div className="hgins-fact__label">정답을 알려 준 답변</div>
            <div className="hgins-fact__value">{r.overall.leaks.toLocaleString()}건</div>
            <div className="hgins-fact__hint">힌트에서 정답이 노출된 경우</div>
          </div>
          <div className="hgins-fact">
            <div className="hgins-fact__label">회원 반응</div>
            <div className="hgins-fact__value">
              👍 {r.learner_satisfaction.up} · 👎 {r.learner_satisfaction.down}
            </div>
            <div className="hgins-fact__hint">만족도 (정확도와 별개)</div>
          </div>
          {Object.entries(r.by_route).map(([routeKey, v]) => (
            <div className="hgins-fact" key={routeKey}>
              <div className="hgins-fact__label">{ROUTE_LABEL[routeKey] ?? routeKey}</div>
              <div className="hgins-fact__value">
                <RatioView ratio={v} compact />
              </div>
              <div className="hgins-fact__hint">정답 노출 {v.leaks}건</div>
            </div>
          ))}
        </div>
      )}
      <div className="hgadm-toolbar">
        <label className="hgadm-checkbox">
          <input type="checkbox" checked={flagged} onChange={(e) => f.patch({ flagged: e.target.checked ? "1" : null, tpage: null })} /> 살펴볼 답변만
        </label>
        <label className="hgadm-checkbox">
          <input type="checkbox" checked={unreviewed} onChange={(e) => f.patch({ unreviewed: e.target.checked ? "1" : null, tpage: null })} /> 아직 검수 안 한 답변만
        </label>
        <Select value={route} aria-label="경로" onChange={(e) => f.patch({ route: e.target.value, tpage: null })}>
          <option value="">모든 답변 방법</option>
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
        <ErrorState message="튜터 답변 목록을 불러오지 못했습니다." onRetry={() => void turns.refetch()} />
      ) : (
        <>
          {!turns.data.transcripts_included && (
            <Notice tone="info" title="대화 원문은 보이지 않아요">
              질문과 답변 내용을 보려면 대화 원문 조회 권한(transcripts:read)이 필요해요.
            </Notice>
          )}
          <DataTable rows={turns.data.items} rowKey={(t) => t.turn_id} columns={columns} empty="아직 데이터 없음" />
          <Pagination page={page} pageSize={25} total={turns.data.total} onPageChange={(p) => f.patch({ tpage: String(p) })} />
        </>
      )}
      {reviewing && <TurnReviewModal turn={reviewing} onClose={() => setReviewing(null)} />}
    </Panel>
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
      toast.success("검수 결과를 저장했어요.");
      void qc.invalidateQueries({ queryKey: ["admin", "learning", "tutor-reliability"] });
      void qc.invalidateQueries({ queryKey: ["admin", "learning", "tutor-turns"] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      title="튜터 답변 검수"
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
      <div className="hgadm-cell-sub hgadm-mb-8">
        {formatDateTime(turn.created_at)} · {ROUTE_LABEL[turn.route] ?? turn.route}
      </div>
      <Field label="내용이 정확한가요?">
        <Switch checked={correct} onChange={setCorrect} label="정확함" />
      </Field>
      <Field label="학습 자료나 검수된 해설에 근거했나요?">
        <Switch checked={grounded} onChange={setGrounded} label="근거 있음" />
      </Field>
      <Field label="힌트에서 정답을 알려 줬나요?">
        <Switch checked={leaked} onChange={setLeaked} label="정답 노출" />
      </Field>
      <Field label="메모">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Field>
    </Modal>
  );
}
