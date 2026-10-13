import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, BADGE_MAX_LENGTH } from "../api";
import type { BadgePreset, Plan, PlanBadge, PlanUpdate } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { Badge, Button, DataTable, ErrorState, Field, Input, LoadingState, Modal, Switch } from "../components/kit";
import type { Column } from "../components/kit";
import { formatMoney } from "../lib/format";

/**
 * 요금제 관리 — the monthly and the yearly plan the app's purchase screen sells.
 *
 * Plans are never created or deleted here. Both unlock the same full access
 * (they differ in billing period and price), so an admin sets each plan's
 * prices — the regular one and, optionally, a new member's — and picks or
 * writes its promotional ribbon and publishes or hides it. The free trial is
 * the member's (once, always the same length), so it is shown as policy.
 */

const INTERVAL_LABEL = { month: "월간 (1개월)", year: "연간 (12개월)" } as const;

/** What every subscription includes, whichever plan. */
const INCLUDED = ["맞춤 학습 무제한", "모든 강의 수강", "AI 튜터(챗봇) 무제한"];

/** What one interval's charge comes to per month (yearly ÷ 12, as the app shows it). */
export function monthlyEquivalent(cents: number, interval: Plan["interval"]): number {
  return interval === "year" ? Math.round(cents / 12) : cents;
}

function discountPercent(price: number, discounted: number | null): number {
  if (discounted === null || price <= 0 || discounted >= price) return 0;
  return Math.round((1 - discounted / price) * 100);
}

/**
 * The ribbon exactly as the app's plan card draws it: as wide as its bold
 * 15px white text, up to the widest the card allows. `onOverflow` reports
 * whether the text is wider than that, which the app would cut off.
 */
function RibbonPreview({ text, onOverflow }: { text: string; onOverflow?: (over: boolean) => void }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && onOverflow) onOverflow(el.scrollWidth > el.clientWidth);
  }, [text, onOverflow]);
  return (
    <span className="hgadm-ribbon" aria-label={`배지 미리보기: ${text}`}>
      <span className="hgadm-ribbon__text" ref={textRef}>
        {text}
      </span>
    </span>
  );
}

/** One price as the app shows it: the charge, the struck list price and the
 *  saving, and for a yearly plan what it comes to per month. */
function PriceLine({ plan, charged }: { plan: Plan; charged: number }) {
  const pct = discountPercent(plan.price_cents, charged);
  const per = plan.interval === "year" ? "년" : "월";
  return (
    <div>
      <span className="hgadm-offer__amount">{formatMoney(charged, plan.currency)}</span>
      <span className="hgadm-muted"> / {per}</span>
      {pct > 0 && (
        <>
          {" "}
          <s className="hgadm-muted">{formatMoney(plan.price_cents, plan.currency)}</s> <Badge tone="info">{pct}% 할인</Badge>
        </>
      )}
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

/** Active now and cumulative to date, side by side. */
function SubscriberCounts({ plan }: { plan: Plan }) {
  return (
    <span className="hgadm-offer__counts">
      <span title="지금 구독 중인 회원 (무료 체험·유료, 해지 예약 포함)">
        현재 <b>{plan.active_subscribers.toLocaleString()}명</b>
      </span>
      <span title="무료 체험을 시작했거나 결제한 적이 있는 모든 회원 (지금은 구독하지 않는 회원 포함)">
        누적 <b>{plan.total_subscribers.toLocaleString()}명</b>
      </span>
    </span>
  );
}

function presetOf(badge: PlanBadge, presets: BadgePreset[]): BadgePreset | undefined {
  return presets.find((p) => p.text.ko === badge.ko && p.text.en === badge.en);
}

function OfferCard({
  plan,
  presets,
  canWrite,
  onEdit,
}: {
  plan: Plan;
  presets: BadgePreset[];
  canWrite: boolean;
  onEdit: () => void;
}) {
  const interval = plan.slot?.interval ?? plan.interval;
  const regular = plan.promo_price_cents ?? plan.price_cents;
  const preset = presetOf(plan.badge_text, presets);
  return (
    <div className="hgadm-card hgadm-offer">
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">{INTERVAL_LABEL[interval]}</div>
          <div className="hgadm-cell-sub">{plan.name}</div>
        </div>
        {canWrite && (
          <Button size="sm" onClick={onEdit}>
            수정
          </Button>
        )}
      </div>
      <div className="hgadm-card__body">
        <div className="hgadm-offer__price-row">
          <span className="hgadm-offer__key">일반 회원</span>
          <PriceLine plan={plan} charged={regular} />
        </div>
        <div className="hgadm-offer__price-row">
          <span className="hgadm-offer__key">신규 회원</span>
          {plan.new_member_price_cents === null ? (
            <span className="hgadm-muted">일반 회원과 같은 가격</span>
          ) : (
            <PriceLine plan={plan} charged={plan.new_member_price_cents} />
          )}
        </div>
        <div className="hgadm-offer__line">
          <span className="hgadm-offer__key">배지</span>
          {plan.badge_published ? (
            <span className="hgadm-row hgadm-row--wrap">
              <RibbonPreview text={plan.badge_text.ko} />
              <RibbonPreview text={plan.badge_text.en} />
              <span className="hgadm-muted">{preset ? "기본 문구" : "직접 입력"}</span>
            </span>
          ) : (
            <span className="hgadm-muted">숨김{plan.badge_text.ko || plan.badge_text.en ? " (문구 저장됨)" : ""}</span>
          )}
        </div>
        <div className="hgadm-offer__line">
          <span className="hgadm-offer__key">구독자</span>
          <SubscriberCounts plan={plan} />
        </div>
      </div>
    </div>
  );
}

/** Which badge text the editor uses: a preset's, or the admin's own. */
type BadgeChoice = { kind: "preset"; key: string } | { kind: "custom" };

interface Draft {
  name: string;
  price_cents: string;
  promo_price_cents: string;
  new_member_on: boolean;
  new_member_price_cents: string;
  badge_choice: BadgeChoice;
  custom_badge: PlanBadge;
  badge_published: boolean;
}

function draftOf(plan: Plan, presets: BadgePreset[]): Draft {
  const preset = presetOf(plan.badge_text, presets);
  return {
    name: plan.name,
    price_cents: String(plan.price_cents),
    promo_price_cents: plan.promo_price_cents === null ? "" : String(plan.promo_price_cents),
    new_member_on: plan.new_member_price_cents !== null,
    new_member_price_cents: plan.new_member_price_cents === null ? "" : String(plan.new_member_price_cents),
    badge_choice: preset ? { kind: "preset", key: preset.key } : { kind: "custom" },
    custom_badge: preset ? { ko: "", en: "" } : { ...plan.badge_text },
    badge_published: plan.badge_published,
  };
}

/** The badge text the draft would save. */
function badgeOf(d: Draft, presets: BadgePreset[]): PlanBadge {
  const choice = d.badge_choice;
  if (choice.kind === "preset") {
    const preset = presets.find((p) => p.key === choice.key);
    if (preset) return { ...preset.text };
  }
  return { ko: d.custom_badge.ko.trim(), en: d.custom_badge.en.trim() };
}

/** A whole, non-negative amount in minor units, or null. */
function amount(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw);
}

function draftProblems(d: Draft, badge: PlanBadge): string[] {
  const problems: string[] = [];
  const price = amount(d.price_cents);
  const promo = d.promo_price_cents.trim() === "" ? null : amount(d.promo_price_cents);
  const newMember = amount(d.new_member_price_cents);
  if (!d.name.trim()) problems.push("이름을 입력하세요.");
  if (price === null) problems.push("정가는 0 이상의 정수로 입력하세요.");
  if (d.promo_price_cents.trim() !== "" && promo === null) problems.push("할인가는 0 이상의 정수로 입력하세요.");
  if (price !== null && promo !== null && promo > price) problems.push("할인가는 정가보다 클 수 없어요.");
  if (d.new_member_on && newMember === null) problems.push("신규 회원가는 0 이상의 정수로 입력하세요.");
  if (d.new_member_on && price !== null && newMember !== null && newMember > price)
    problems.push("신규 회원가는 정가보다 클 수 없어요.");
  if (d.badge_published && (!badge.ko || !badge.en)) problems.push("배지를 게시하려면 한국어와 영어 문구를 모두 입력하세요.");
  return problems;
}

function PlanEditor({ plan, presets, onClose }: { plan: Plan; presets: BadgePreset[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [d, setD] = useState<Draft>(() => draftOf(plan, presets));
  const [overflow, setOverflow] = useState<{ ko: boolean; en: boolean }>({ ko: false, en: false });
  const badge = badgeOf(d, presets);
  const problems = draftProblems(d, badge);
  // A published ribbon must fit: the app would cut off the end.
  if (d.badge_published && (overflow.ko || overflow.en)) problems.push("배지 문구가 배지보다 길어요. 더 짧게 써 주세요.");
  const price = amount(d.price_cents);
  const promo = d.promo_price_cents.trim() === "" ? null : amount(d.promo_price_cents);
  const newMember = d.new_member_on ? amount(d.new_member_price_cents) : null;
  const isYear = plan.interval === "year";
  const per = isYear ? "년" : "월";

  const save = useMutation({
    mutationFn: () => {
      const body: PlanUpdate = {
        name: d.name.trim(),
        price_cents: price ?? plan.price_cents,
        promo_price_cents: promo,
        new_member_price_cents: newMember,
        badge_text: badge,
        badge_published: d.badge_published,
      };
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
  const describe = (cents: number) =>
    `${money(cents)} / ${per}${isYear ? ` · 월 환산 ${money(monthlyEquivalent(cents, "year"))}` : ""}${
      price !== null && discountPercent(price, cents) > 0 ? ` · ${discountPercent(price, cents)}% 할인` : ""
    }`;
  const priceChanged =
    price !== plan.price_cents || promo !== plan.promo_price_cents || newMember !== plan.new_member_price_cents;
  const reportOverflow = (lang: "ko" | "en") => (over: boolean) =>
    setOverflow((prev) => (prev[lang] === over ? prev : { ...prev, [lang]: over }));
  // The newly chosen text's previews report again; nothing carries over.
  const choose = (badge_choice: BadgeChoice) => {
    setOverflow({ ko: false, en: false });
    setD({ ...d, badge_choice });
  };

  return (
    <Modal
      open
      title={`${INTERVAL_LABEL[plan.interval]} 요금제 수정`}
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
        <Field label="이름" required hint="내 구독 화면과 결제 내역에 보이는 이름">
          <Input value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div />
        <Field
          label={`정가 (${plan.currency} 최소 단위)`}
          required
          hint={price === null ? "센트 단위 정수" : `${money(price)} / ${per}${isYear ? ` · 월 환산 ${money(monthlyEquivalent(price, "year"))}` : ""}`}
        >
          <Input inputMode="numeric" value={d.price_cents} onChange={(e) => setD({ ...d, price_cents: e.target.value })} />
        </Field>
        <Field label="할인가 (일반 회원)" hint={promo === null ? "비우면 할인 없음 — 정가로 결제돼요" : describe(promo)}>
          <Input
            inputMode="numeric"
            value={d.promo_price_cents}
            placeholder="할인 없음"
            onChange={(e) => setD({ ...d, promo_price_cents: e.target.value })}
          />
        </Field>

        <div className="span-2">
          <fieldset className="hgadm-field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <legend className="hgadm-field__label">신규 회원가</legend>
            <label className="hgadm-row" style={{ marginBottom: 10 }}>
              <Switch
                checked={d.new_member_on}
                onChange={(next) => setD({ ...d, new_member_on: next })}
                label="신규 회원가 적용"
              />
              <span style={{ fontSize: 13 }}>
                {d.new_member_on
                  ? "무료 체험이나 결제를 한 번도 하지 않은 회원에게 이 가격을 보여주고 청구해요."
                  : "꺼짐 — 신규 회원도 일반 회원과 같은 가격을 내요."}
              </span>
            </label>
            {d.new_member_on && (
              <Field
                label="신규 회원 결제 금액"
                hint={newMember === null ? "센트 단위 정수" : `${describe(newMember)} · 이 가격으로 시작한 구독은 갱신 때도 유지돼요`}
              >
                <Input
                  inputMode="numeric"
                  value={d.new_member_price_cents}
                  placeholder="예: 499"
                  aria-label="신규 회원 결제 금액"
                  onChange={(e) => setD({ ...d, new_member_price_cents: e.target.value })}
                />
              </Field>
            )}
          </fieldset>
        </div>

        {priceChanged && plan.active_subscribers > 0 && (
          <p className="span-2 hgadm-field__hint" role="note">
            바뀐 가격은 새로 구독하는 회원부터 적용돼요. 지금 구독 중인 {plan.active_subscribers.toLocaleString()}명은 가입할 때의
            가격으로 계속 갱신됩니다.
          </p>
        )}

        <div className="span-2">
          <fieldset className="hgadm-field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <legend className="hgadm-field__label">요금제 배지</legend>
            {/* A label, so the visible track toggles the (hidden) checkbox. */}
            <label className="hgadm-row" style={{ marginBottom: 10 }}>
              <Switch checked={d.badge_published} onChange={(next) => setD({ ...d, badge_published: next })} label="배지 게시" />
              <span style={{ fontSize: 13 }}>
                {d.badge_published ? "결제 화면의 요금제 카드에 배지를 보여줍니다." : "숨김 — 고른 문구는 저장돼요."}
              </span>
            </label>
            <div className="hgadm-badge-choices" role="radiogroup" aria-label="배지 문구">
              {presets.map((preset) => {
                const on = d.badge_choice.kind === "preset" && d.badge_choice.key === preset.key;
                return (
                  <label key={preset.key} className={`hgadm-badge-choice${on ? " hgadm-badge-choice--on" : ""}`}>
                    <input
                      type="radio"
                      name="badge-choice"
                      checked={on}
                      aria-label={`${preset.text.ko} / ${preset.text.en}`}
                      onChange={() => choose({ kind: "preset", key: preset.key })}
                    />
                    <RibbonPreview text={preset.text.ko} onOverflow={on ? reportOverflow("ko") : undefined} />
                    <RibbonPreview text={preset.text.en} onOverflow={on ? reportOverflow("en") : undefined} />
                  </label>
                );
              })}
              <label className={`hgadm-badge-choice${d.badge_choice.kind === "custom" ? " hgadm-badge-choice--on" : ""}`}>
                <input
                  type="radio"
                  name="badge-choice"
                  checked={d.badge_choice.kind === "custom"}
                  aria-label="직접 입력"
                  onChange={() => choose({ kind: "custom" })}
                />
                <span className="hgadm-badge-choice__custom">직접 입력</span>
              </label>
            </div>
            {d.badge_choice.kind === "custom" && (
              <div className="hgadm-form-grid" style={{ marginTop: 12 }}>
                {(["ko", "en"] as const).map((lang) => (
                  <Field
                    key={lang}
                    label={lang === "ko" ? "한국어" : "English"}
                    hint={`${d.custom_badge[lang].length}/${BADGE_MAX_LENGTH}자`}
                    error={overflow[lang] ? "배지 끝이 잘려요. 더 짧게 써 주세요." : undefined}
                  >
                    <Input
                      value={d.custom_badge[lang]}
                      maxLength={BADGE_MAX_LENGTH}
                      placeholder={lang === "ko" ? "예: 첫 달 특가" : "e.g. First month deal"}
                      onChange={(e) => setD({ ...d, custom_badge: { ...d.custom_badge, [lang]: e.target.value } })}
                    />
                    {d.custom_badge[lang].trim() && (
                      <div className="hgadm-offer__ribbon-preview">
                        <RibbonPreview text={d.custom_badge[lang].trim()} onOverflow={reportOverflow(lang)} />
                      </div>
                    )}
                  </Field>
                ))}
              </div>
            )}
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
  const presets = query.data?.badge_presets ?? [];
  const onSale = plans.filter((p) => p.slot !== null);
  const older = plans.filter((p) => p.slot === null);

  const olderColumns: Column<Plan>[] = [
    { key: "plan", header: "요금제", render: (p) => <div className="hgadm-cell-main">{p.name}</div> },
    {
      key: "price",
      header: "가격",
      numeric: true,
      render: (p) => `${formatMoney(p.promo_price_cents ?? p.price_cents, p.currency)} / ${p.interval === "year" ? "년" : "월"}`,
    },
    { key: "active", header: "현재 구독자", numeric: true, render: (p) => `${p.active_subscribers.toLocaleString()}명` },
    { key: "total", header: "누적 구독자", numeric: true, render: (p) => `${p.total_subscribers.toLocaleString()}명` },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>요금제 관리</h1>
          <div className="hgadm-page-head__desc">
            앱 결제 화면에서 판매하는 월간·연간 요금제입니다. 두 요금제는 이용 혜택이 같고 결제 주기와 가격만 달라요. 여기서
            일반 회원 가격, 신규 회원가, 배지를 조정합니다. 가격을 바꾸면 새로 구독하는 회원부터 적용돼요.
          </div>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="hgadm-grid-2 hgadm-section">
            <div className="hgadm-card hgadm-offer-trial" role="note">
              <b>무료 체험 · 회원당 1회, {query.data.trial_days}일</b>
              <span>
                요금제와 상관없이 모든 회원이 한 번만 받을 수 있어요. 탈퇴 후 다시 가입해도 새로 생기지 않으며, 체험이 끝나면 고른
                요금제로 결제됩니다. 회원별 사용 여부는 회원 상세에서 확인할 수 있어요.
              </span>
            </div>
            <div className="hgadm-card hgadm-offer-trial" role="note">
              <b>모든 구독에 포함</b>
              <span>
                {INCLUDED.join(" · ")}. 월간·연간, 무료 체험 중에도 똑같이 이용할 수 있어요.
              </span>
            </div>
          </div>

          <section className="hgadm-section">
            <h2 className="hgadm-offer-group__title">판매 중인 요금제</h2>
            <p className="hgadm-offer-group__desc">
              신규 회원가는 무료 체험이나 결제를 한 번도 하지 않은 회원에게 일반 가격 대신 보여요. 로그인 전 화면과 그 밖의 회원은
              일반 회원 가격을 봅니다.
            </p>
            <div className="hgadm-grid-2">
              {onSale.map((p) => (
                <OfferCard key={p.plan_id} plan={p} presets={presets} canWrite={canWrite} onEdit={() => setEditing(p)} />
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

      {editing && <PlanEditor plan={editing} presets={presets} onClose={() => setEditing(null)} />}
    </div>
  );
}
