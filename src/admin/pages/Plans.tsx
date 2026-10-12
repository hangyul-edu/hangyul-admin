import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, BADGE_MAX_LENGTH, ENTITLEMENTS } from "../api";
import type { Entitlement, Plan, PlanBadge, PlanUpdate } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { Badge, Button, DataTable, ErrorState, Field, Input, LoadingState, Modal, Switch } from "../components/kit";
import type { Column } from "../components/kit";
import { formatMoney } from "../lib/format";
import payRibbon from "../../assets/brand/pay-ribbon.svg";

/**
 * 요금제 관리 — the fixed offer slots the app's purchase screen sells.
 *
 * Plans are never created or deleted here: the catalogue is the standard and
 * the new-member price, monthly and yearly. An admin prices them, writes and
 * publishes their promotional ribbon, and switches the new-member prices on
 * or off. The free trial is the member's (once, always the same length), so
 * it is shown as policy, not as a plan setting.
 */

/** Korean names for what a plan unlocks (access checks read these values). */
const ENTITLEMENT_LABELS: Record<Entitlement, { label: string; hint: string }> = {
  premium_courses: { label: "프리미엄 강의", hint: "모든 레슨·강의" },
  ai_tutor: { label: "AI 한귤 튜터", hint: "튜터 대화와 오답 설명" },
  offline_download: { label: "오프라인 저장", hint: "강의·음성 내려받기" },
  premium_content: { label: "프리미엄 콘텐츠", hint: "프리미엄 전용 학습 자료" },
};

const INTERVAL_LABEL = { month: "월간 (1개월)", year: "연간 (12개월)" } as const;

/** What one interval's charge comes to per month (yearly ÷ 12, as the app shows it). */
export function monthlyEquivalent(cents: number, interval: Plan["interval"]): number {
  return interval === "year" ? Math.round(cents / 12) : cents;
}

function discountPercent(price: number, promo: number | null): number {
  if (promo === null || price <= 0 || promo >= price) return 0;
  return Math.round((1 - promo / price) * 100);
}

/**
 * The ribbon exactly as the app's plan card draws it (pay-ribbon art, 150×27,
 * bold 15px white text). `onOverflow` reports whether the text runs past the
 * ribbon's tail, which the app would clip.
 */
function RibbonPreview({ text, onOverflow }: { text: string; onOverflow?: (over: boolean) => void }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && onOverflow) onOverflow(el.offsetLeft + el.scrollWidth > RIBBON_TEXT_LIMIT);
  }, [text, onOverflow]);
  return (
    <span className="hgadm-ribbon" aria-label={`배지 미리보기: ${text}`}>
      <img className="hgadm-ribbon__art" src={payRibbon} alt="" aria-hidden="true" />
      <span className="hgadm-ribbon__text" ref={textRef}>
        {text}
      </span>
    </span>
  );
}

/** Where the ribbon's swallow-tail notch starts: text past it is cut off. */
const RIBBON_TEXT_LIMIT = 136;

function PriceSummary({ plan }: { plan: Plan }) {
  const charged = plan.promo_price_cents ?? plan.price_cents;
  const pct = discountPercent(plan.price_cents, plan.promo_price_cents);
  const per = plan.interval === "year" ? "년" : "월";
  return (
    <div className="hgadm-offer__price">
      <div>
        <span className="hgadm-offer__amount">{formatMoney(charged, plan.currency)}</span>
        <span className="hgadm-muted"> / {per}</span>
        {pct > 0 && (
          <>
            {" "}
            <s className="hgadm-muted">{formatMoney(plan.price_cents, plan.currency)}</s>{" "}
            <Badge tone="info">{pct}% 할인</Badge>
          </>
        )}
      </div>
      {plan.interval === "year" && (
        <div className="hgadm-offer__monthly">
          월 환산 <b>{formatMoney(monthlyEquivalent(charged, "year"), plan.currency)}</b>
          {pct > 0 && (
            <span className="hgadm-muted"> (정가 월 {formatMoney(monthlyEquivalent(plan.price_cents, "year"), plan.currency)})</span>
          )}
        </div>
      )}
    </div>
  );
}

function OfferCard({ plan, canWrite, onEdit }: { plan: Plan; canWrite: boolean; onEdit: () => void }) {
  const offered = plan.status === "active";
  const interval = plan.slot?.interval ?? plan.interval;
  return (
    <div className={`hgadm-card hgadm-offer${offered ? "" : " hgadm-offer--off"}`}>
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">{INTERVAL_LABEL[interval]}</div>
          <div className="hgadm-cell-sub">{plan.name}</div>
        </div>
        <div className="hgadm-row">
          <Badge tone={offered ? "success" : "neutral"}>{offered ? "판매 중" : "꺼짐"}</Badge>
          {canWrite && (
            <Button size="sm" onClick={onEdit}>
              수정
            </Button>
          )}
        </div>
      </div>
      <div className="hgadm-card__body">
        <PriceSummary plan={plan} />
        <div className="hgadm-offer__line">
          <span className="hgadm-offer__key">배지</span>
          {plan.badge_published ? (
            <span className="hgadm-row hgadm-row--wrap">
              <RibbonPreview text={plan.badge_text.ko} />
              <RibbonPreview text={plan.badge_text.en} />
            </span>
          ) : (
            <span className="hgadm-muted">없음{plan.badge_text.ko || plan.badge_text.en ? " (작성됨, 게시 안 함)" : ""}</span>
          )}
        </div>
        <div className="hgadm-offer__line">
          <span className="hgadm-offer__key">이용 권한</span>
          <span className="hgadm-row hgadm-row--wrap" style={{ gap: 4 }}>
            {plan.entitlements.map((value) => (
              <Badge key={value} tone="info">
                {ENTITLEMENT_LABELS[value]?.label ?? value}
              </Badge>
            ))}
          </span>
        </div>
        <div className="hgadm-offer__line">
          <span className="hgadm-offer__key">구독자</span>
          <span>{plan.live_subscribers.toLocaleString()}명</span>
        </div>
      </div>
    </div>
  );
}

interface Draft {
  name: string;
  price_cents: string;
  promo_price_cents: string;
  entitlements: Entitlement[];
  badge_text: PlanBadge;
  badge_published: boolean;
  offered: boolean;
}

function draftOf(plan: Plan): Draft {
  return {
    name: plan.name,
    price_cents: String(plan.price_cents),
    promo_price_cents: plan.promo_price_cents === null ? "" : String(plan.promo_price_cents),
    entitlements: [...plan.entitlements],
    badge_text: { ...plan.badge_text },
    badge_published: plan.badge_published,
    offered: plan.status === "active",
  };
}

/** A whole, non-negative amount in minor units, or null. */
function amount(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw);
}

function draftProblems(d: Draft): string[] {
  const problems: string[] = [];
  const price = amount(d.price_cents);
  const promo = d.promo_price_cents.trim() === "" ? null : amount(d.promo_price_cents);
  if (!d.name.trim()) problems.push("이름을 입력하세요.");
  if (price === null) problems.push("정가는 0 이상의 정수로 입력하세요.");
  if (d.promo_price_cents.trim() !== "" && promo === null) problems.push("할인가는 0 이상의 정수로 입력하세요.");
  if (price !== null && promo !== null && promo > price) problems.push("할인가는 정가보다 클 수 없어요.");
  if (d.entitlements.length === 0) problems.push("이용 권한을 하나 이상 고르세요.");
  if (d.badge_published && (!d.badge_text.ko.trim() || !d.badge_text.en.trim()))
    problems.push("배지를 게시하려면 한국어와 영어 문구를 모두 입력하세요.");
  return problems;
}

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [d, setD] = useState<Draft>(() => draftOf(plan));
  const [overflow, setOverflow] = useState<{ ko: boolean; en: boolean }>({ ko: false, en: false });
  const problems = draftProblems(d);
  // A published ribbon must fit: the app would cut off the end.
  if (d.badge_published && (overflow.ko || overflow.en)) problems.push("배지 문구가 배지보다 길어요. 더 짧게 써 주세요.");
  const price = amount(d.price_cents);
  const promo = d.promo_price_cents.trim() === "" ? null : amount(d.promo_price_cents);
  const isYear = plan.interval === "year";
  const optional = !!plan.slot?.optional;

  const save = useMutation({
    mutationFn: () => {
      const body: PlanUpdate = {
        name: d.name.trim(),
        price_cents: price ?? plan.price_cents,
        promo_price_cents: promo,
        // In the canonical order, whatever order they were ticked in.
        entitlements: ENTITLEMENTS.filter((e) => d.entitlements.includes(e)),
        badge_text: { ko: d.badge_text.ko.trim(), en: d.badge_text.en.trim() },
        badge_published: d.badge_published,
      };
      if (optional) body.offered = d.offered;
      return adminApi.updatePlan(plan.plan_id, body);
    },
    onSuccess: () => {
      toast.success("요금제를 저장했어요.");
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      onClose();
    },
    onError: toastError,
  });

  const money = (cents: number | null) => (cents === null ? "" : formatMoney(cents, plan.currency));
  const priceChanged = price !== plan.price_cents || promo !== plan.promo_price_cents;

  return (
    <Modal
      open
      title={`${plan.slot?.audience === "new_user" ? "신규 회원" : "기본"} · ${INTERVAL_LABEL[plan.interval]} 수정`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={problems.length > 0} onClick={() => save.mutate()}>
            저장
          </Button>
        </>
      }
    >
      <div className="hgadm-form-grid">
        {optional && (
          <div className="span-2">
            <Field label="결제 화면에 제공">
              <div className="hgadm-row">
                <Switch checked={d.offered} onChange={(next) => setD({ ...d, offered: next })} label="결제 화면에 제공" />
                <span style={{ fontSize: 13 }}>
                  {d.offered
                    ? "체험·결제 이력이 없는 신규 회원에게 이 가격을 보여줍니다."
                    : "꺼짐 — 신규 회원도 기본 요금을 봅니다. 이미 이 요금제를 쓰는 구독자는 그대로 갱신돼요."}
                </span>
              </div>
            </Field>
          </div>
        )}
        <Field label="이름" required hint="내 구독 화면과 결제 내역에 보이는 이름">
          <Input value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div />
        <Field
          label={`정가 (${plan.currency} 최소 단위)`}
          required
          hint={
            price === null
              ? "센트 단위 정수"
              : `${money(price)} / ${isYear ? "년" : "월"}${isYear ? ` · 월 환산 ${money(monthlyEquivalent(price, "year"))}` : ""}`
          }
        >
          <Input inputMode="numeric" value={d.price_cents} onChange={(e) => setD({ ...d, price_cents: e.target.value })} />
        </Field>
        <Field
          label="할인가"
          hint={
            promo === null
              ? "비우면 할인 없음 — 정가로 결제돼요"
              : `${money(promo)} / ${isYear ? "년" : "월"}${isYear ? ` · 월 환산 ${money(monthlyEquivalent(promo, "year"))}` : ""}${
                  price !== null ? ` · ${discountPercent(price, promo)}% 할인` : ""
                }`
          }
        >
          <Input
            inputMode="numeric"
            value={d.promo_price_cents}
            placeholder="할인 없음"
            onChange={(e) => setD({ ...d, promo_price_cents: e.target.value })}
          />
        </Field>
        {priceChanged && plan.live_subscribers > 0 && (
          <p className="span-2 hgadm-field__hint" role="note">
            바뀐 가격은 새로 구독하는 회원부터 적용돼요. 지금 구독 중인 {plan.live_subscribers.toLocaleString()}명은 가입할 때의
            가격으로 계속 갱신됩니다.
          </p>
        )}

        <div className="span-2">
          <fieldset className="hgadm-field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <legend className="hgadm-field__label">요금제 배지</legend>
            {/* A label, so the visible track toggles the (hidden) checkbox. */}
            <label className="hgadm-row" style={{ marginBottom: 10 }}>
              <Switch
                checked={d.badge_published}
                onChange={(next) => setD({ ...d, badge_published: next })}
                label="배지 게시"
              />
              <span style={{ fontSize: 13 }}>
                {d.badge_published ? "결제 화면의 요금제 카드에 배지를 보여줍니다." : "게시 안 함 — 문구는 저장돼요."}
              </span>
            </label>
            <div className="hgadm-form-grid">
              {(["ko", "en"] as const).map((lang) => (
                <Field
                  key={lang}
                  label={lang === "ko" ? "한국어" : "English"}
                  hint={`${d.badge_text[lang].length}/${BADGE_MAX_LENGTH}자`}
                  error={overflow[lang] ? "배지 끝이 잘려요. 더 짧게 써 주세요." : undefined}
                >
                  <Input
                    value={d.badge_text[lang]}
                    maxLength={BADGE_MAX_LENGTH}
                    placeholder={lang === "ko" ? "예: 런칭 기념 특별 할인" : "e.g. Launch special"}
                    onChange={(e) => setD({ ...d, badge_text: { ...d.badge_text, [lang]: e.target.value } })}
                  />
                  {d.badge_text[lang].trim() && (
                    <div className="hgadm-offer__ribbon-preview">
                      <RibbonPreview
                        text={d.badge_text[lang].trim()}
                        onOverflow={(over) => setOverflow((prev) => (prev[lang] === over ? prev : { ...prev, [lang]: over }))}
                      />
                    </div>
                  )}
                </Field>
              ))}
            </div>
          </fieldset>

          <fieldset className="hgadm-field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <legend className="hgadm-field__label">
              이용 권한<span className="req">*</span>
            </legend>
            <div className="hgadm-row hgadm-row--wrap" style={{ gap: "8px 22px" }}>
              {ENTITLEMENTS.map((value) => (
                <label key={value} className="hgadm-checkbox" title={ENTITLEMENT_LABELS[value].hint}>
                  <input
                    type="checkbox"
                    checked={d.entitlements.includes(value)}
                    onChange={(e) =>
                      setD({
                        ...d,
                        entitlements: e.target.checked
                          ? [...d.entitlements, value]
                          : d.entitlements.filter((x) => x !== value),
                      })
                    }
                  />
                  {ENTITLEMENT_LABELS[value].label}
                </label>
              ))}
            </div>
            <span className="hgadm-field__hint">
              구독자가 실제로 쓸 수 있는 기능입니다. 기존 구독자에게는 다음 갱신·요금제 변경 때부터 적용돼요.
            </span>
          </fieldset>

          {problems.length > 0 && (
            <ul className="hgadm-field__error" role="alert" style={{ margin: 0, paddingLeft: 18 }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function PlansPage() {
  const { can } = useAdminAuth();
  const canWrite = can("commerce:write");
  const [editing, setEditing] = useState<Plan | null>(null);
  const query = useQuery({ queryKey: ["admin", "plans"], queryFn: adminApi.listPlans });

  const plans = query.data?.plans ?? [];
  const standard = plans.filter((p) => p.slot?.audience === "default");
  const newMember = plans.filter((p) => p.slot?.audience === "new_user");
  const older = plans.filter((p) => p.slot === null);

  const olderColumns: Column<Plan>[] = [
    { key: "plan", header: "요금제", render: (p) => <div className="hgadm-cell-main">{p.name}</div> },
    {
      key: "price",
      header: "가격",
      numeric: true,
      render: (p) => `${formatMoney(p.promo_price_cents ?? p.price_cents, p.currency)} / ${p.interval === "year" ? "년" : "월"}`,
    },
    { key: "subs", header: "구독자", numeric: true, render: (p) => `${p.live_subscribers.toLocaleString()}명` },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>요금제 관리</h1>
          <div className="hgadm-page-head__desc">
            앱 결제 화면에서 판매하는 요금제입니다. 기본 요금과 신규 회원 요금이 월간·연간으로 하나씩 정해져 있고, 여기서
            가격·할인·배지를 조정합니다. 가격을 바꾸면 새로 구독하는 회원부터 적용돼요.
          </div>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="hgadm-card hgadm-offer-trial hgadm-section" role="note">
            <b>무료 체험 · 회원당 1회, {query.data.trial_days}일</b>
            <span>
              요금제와 상관없이 모든 회원이 한 번만 받을 수 있어요. 탈퇴 후 다시 가입해도 새로 생기지 않으며, 체험이 끝나면 고른
              요금제로 결제됩니다. 회원별 사용 여부는 회원 상세에서 확인할 수 있어요.
            </span>
          </div>

          <section className="hgadm-section">
            <h2 className="hgadm-offer-group__title">기본 요금</h2>
            <p className="hgadm-offer-group__desc">신규 회원 요금이 적용되지 않는 모든 회원과 로그인 전 화면에 보여요.</p>
            <div className="hgadm-grid-2">
              {standard.map((p) => (
                <OfferCard key={p.plan_id} plan={p} canWrite={canWrite} onEdit={() => setEditing(p)} />
              ))}
            </div>
          </section>

          <section className="hgadm-section">
            <h2 className="hgadm-offer-group__title">신규 회원 요금</h2>
            <p className="hgadm-offer-group__desc">
              무료 체험이나 결제를 한 번도 하지 않은 회원에게 기본 요금 대신 보여요. 꺼 두면 신규 회원도 기본 요금을 봅니다.
            </p>
            <div className="hgadm-grid-2">
              {newMember.map((p) => (
                <OfferCard key={p.plan_id} plan={p} canWrite={canWrite} onEdit={() => setEditing(p)} />
              ))}
            </div>
          </section>

          {older.length > 0 && (
            <section className="hgadm-section">
              <h2 className="hgadm-offer-group__title">이전 요금제</h2>
              <p className="hgadm-offer-group__desc">더 이상 판매하지 않고, 이미 구독 중인 회원의 갱신에만 쓰여요.</p>
              <div className="hgadm-card">
                <DataTable columns={olderColumns} rows={older} rowKey={(p) => p.plan_id} empty="" />
              </div>
            </section>
          )}
        </>
      )}

      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
