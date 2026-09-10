import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { Plan } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Select,
  Switch,
  Textarea,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatMoney,
} from "../lib/format";
import type { Column } from "../components/kit";

interface PlanDraft {
  plan_id: string;
  name: string;
  description: string;
  price_cents: string;
  currency: string;
  interval: string;
  trial_days: string;
  promo_price_cents: string;
  features: string;
  audience: string;
  is_public: boolean;
  priority: string;
}

const EMPTY_DRAFT: PlanDraft = {
  plan_id: "",
  name: "",
  description: "",
  price_cents: "0",
  currency: "USD",
  interval: "month",
  trial_days: "0",
  promo_price_cents: "",
  features: "",
  audience: "default",
  is_public: true,
  priority: "0",
};

export function PlansPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("commerce:write");
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<Plan | null>(null);

  const query = useQuery({ queryKey: ["admin", "plans"], queryFn: adminApi.listPlans });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
  }

  const save = useMutation({
    mutationFn: async (d: PlanDraft) => {
      const body = {
        name: d.name,
        description: d.description || null,
        price_cents: Number(d.price_cents),
        trial_days: Number(d.trial_days),
        promo_price_cents: d.promo_price_cents === "" ? null : Number(d.promo_price_cents),
        features: d.features
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        audience: d.audience,
        is_public: d.is_public,
        priority: Number(d.priority),
      };
      if (editingId) return adminApi.updatePlan(editingId, body);
      return adminApi.createPlan({
        ...body,
        plan_id: d.plan_id,
        currency: d.currency,
        interval: d.interval,
      });
    },
    onSuccess: () => {
      toast.success(editingId ? "요금제를 수정했어요." : "요금제를 만들었어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: toastError,
  });

  const archive = useMutation({
    mutationFn: (plan: Plan) => adminApi.archivePlan(plan.plan_id),
    onSuccess: () => {
      toast.success("요금제를 보관 처리했어요.");
      setArchiving(null);
      refresh();
    },
    onError: toastError,
  });

  function edit(plan: Plan) {
    setEditingId(plan.plan_id);
    setDraft({
      plan_id: plan.plan_id,
      name: plan.name,
      description: plan.description ?? "",
      price_cents: String(plan.price_cents),
      currency: plan.currency,
      interval: plan.interval,
      trial_days: String(plan.trial_days),
      promo_price_cents: plan.promo_price_cents === null ? "" : String(plan.promo_price_cents),
      features: plan.features.join("\n"),
      audience: plan.audience,
      is_public: plan.is_public,
      priority: String(plan.priority),
    });
  }

  const columns: Column<Plan>[] = [
    {
      key: "plan",
      header: "요금제",
      render: (p) => (
        <div>
          <div className="hgadm-cell-main">{p.name}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{p.plan_id}</div>
        </div>
      ),
    },
    {
      key: "price",
      header: "가격",
      numeric: true,
      render: (p) => (
        <div>
          <div className="hgadm-cell-main">
            {formatMoney(p.promo_price_cents ?? p.price_cents, p.currency)}
            <span className="hgadm-muted"> / {p.interval === "year" ? "년" : "월"}</span>
          </div>
          {p.promo_price_cents !== null && (
            <div className="hgadm-cell-sub" style={{ textDecoration: "line-through" }}>
              {formatMoney(p.price_cents, p.currency)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "trial",
      header: "체험",
      render: (p) => (p.trial_days ? `${p.trial_days}일` : "—"),
    },
    { key: "audience", header: "대상", render: (p) => p.audience },
    {
      key: "visibility",
      header: "노출",
      render: (p) => (
        <Badge tone={p.is_public ? "success" : "neutral"}>
          {p.is_public ? "공개" : "비공개"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: "actions",
      header: "",
      render: (p) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => edit(p)}>
              수정
            </Button>
            {p.status === "active" && (
              <Button size="sm" variant="danger-soft" onClick={() => setArchiving(p)}>
                보관
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  /** What the number in a price box actually costs, for the field hint.
   *  Only called from inside the editor, where `draft` is non-null. */
  function pricePreview(minorUnits: string, currency: string): string {
    const n = Number(minorUnits);
    if (!minorUnits.trim() || Number.isNaN(n) || n < 0) return "";
    return ` — ${formatMoney(n, currency)}`;
  }

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>요금제 관리</h1>
          <div className="hgadm-page-head__desc">
            구독 요금제 목록을 관리합니다. 보관된 요금제는 신규 구매에서 숨겨지지만 기존
            구독자는 유지됩니다. 통화·주기는 생성 후 변경할 수 없습니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY_DRAFT });
              }}
            >
              + 새 요금제
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data.plans}
            rowKey={(p) => p.plan_id}
            empty="등록된 요금제가 없습니다."
          />
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? `요금제 수정 — ${editingId}` : "새 요금제"}
        size="lg"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft || !draft.name || (!editingId && draft.plan_id.length < 3)}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div className="hgadm-form-grid">
            {!editingId && (
              <Field label="요금제 ID" required hint="영문/숫자/언더스코어, 3자 이상. 생성 후 변경 불가.">
                <Input
                  value={draft.plan_id}
                  onChange={(e) => setDraft({ ...draft, plan_id: e.target.value })}
                  placeholder="plan_monthly_b2b"
                />
              </Field>
            )}
            <Field label="이름" required>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field
              label={`가격 (${draft.currency} 최소 단위)`}
              required
              hint={`센트 단위로 입력합니다${pricePreview(draft.price_cents, draft.currency)}`}
            >
              <Input
                type="number"
                min={0}
                value={draft.price_cents}
                onChange={(e) => setDraft({ ...draft, price_cents: e.target.value })}
              />
            </Field>
            <Field
              label="프로모션 가격"
              hint={`비우면 프로모션 없음${pricePreview(draft.promo_price_cents, draft.currency)}`}
            >
              <Input
                type="number"
                min={0}
                value={draft.promo_price_cents}
                onChange={(e) =>
                  setDraft({ ...draft, promo_price_cents: e.target.value })
                }
              />
            </Field>
            {!editingId && (
              <>
                <Field label="통화" required>
                  <Select
                    value={draft.currency}
                    onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                  >
                    {/* Billing is USD-only. The field stays so an existing
                        plan shows what it is priced in, but there is nothing
                        else to choose. */}
                    <option value="USD">USD</option>
                  </Select>
                </Field>
                <Field label="결제 주기" required>
                  <Select
                    value={draft.interval}
                    onChange={(e) => setDraft({ ...draft, interval: e.target.value })}
                  >
                    <option value="month">월간</option>
                    <option value="year">연간</option>
                  </Select>
                </Field>
              </>
            )}
            <Field label="무료 체험 (일)">
              <Input
                type="number"
                min={0}
                value={draft.trial_days}
                onChange={(e) => setDraft({ ...draft, trial_days: e.target.value })}
              />
            </Field>
            <Field label="공개 대상" hint="기본값 = 모두에게 공개">
              <Select
                value={draft.audience}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
              >
                <option value="default">default</option>
                <option value="new_user">new_user</option>
                <option value="retention">retention</option>
              </Select>
            </Field>
            <Field label="우선순위" hint="클수록 목록 위쪽">
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              />
            </Field>
            <Field label="공개 여부">
              <div className="hgadm-row">
                <Switch
                  checked={draft.is_public}
                  onChange={(next) => setDraft({ ...draft, is_public: next })}
                  label="공개 여부"
                />
                <span style={{ fontSize: 13 }}>
                  {draft.is_public ? "목록에 노출" : "비공개 (타겟 제안 전용)"}
                </span>
              </div>
            </Field>
            <div className="span-2">
              <Field label="설명">
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
              </Field>
              <Field label="기능 목록" hint="한 줄에 하나씩">
                <Textarea
                  value={draft.features}
                  onChange={(e) => setDraft({ ...draft, features: e.target.value })}
                  rows={4}
                  placeholder={"프리미엄 강의 무제한\nAI 튜터"}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={archiving !== null}
        title="요금제 보관"
        message={`'${archiving?.name ?? ""}' 요금제를 보관하면 신규 구매가 중단됩니다. 기존 구독자는 영향을 받지 않습니다. 진행할까요?`}
        danger
        confirmLabel="보관"
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
