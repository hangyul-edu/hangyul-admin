// Admin design-system primitives. Every visual atom the portal uses is
// defined here against the classes in src/admin/styles/admin.css.
import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, TextareaHTMLAttributes } from "react";
import { AlertCircle, AlertTriangle, Check, ChevronDown, Inbox, Search as SearchIcon, X } from "lucide-react";
import { formatDateTimeParts } from "../lib/format";

/* ---------- Button ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "danger-soft" | "ghost";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        "hgadm-btn",
        `hgadm-btn--${variant}`,
        size !== "md" ? `hgadm-btn--${size}` : "",
        block ? "hgadm-btn--block" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="hgadm-btn__spinner" aria-hidden />}
      {children}
    </button>
  );
}

/* ---------- Badge ---------- */

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

/**
 * A timestamp shown as two unbreakable lines: the date, then the time to the
 * second.
 *
 * Used wherever an operator scans a column of times looking for *when* — the
 * audit history and the dashboard's recent-activity cards. One component so
 * the two cannot drift; `<time dateTime>` so the machine-readable instant
 * travels with the rendered one, which is the part a display format must not
 * change.
 */
export function Timestamp({ at }: { at: string | null | undefined }) {
  const parts = formatDateTimeParts(at);
  if (!parts) return <span className="hgadm-muted">—</span>;
  return (
    <time className="hgadm-timestamp" dateTime={at ?? undefined}>
      <span className="hgadm-timestamp__date">{parts.date}</span>
      <span className="hgadm-timestamp__time">{parts.time}</span>
    </time>
  );
}

export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`hgadm-badge hgadm-badge--${tone}`}>
      {dot && <span className="hgadm-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Canonical tone mapping for the platform's status strings. */
/**
 * Korean label for a backend status value.
 *
 * The tables used to print the raw enum — an admin read "grace_period" and
 * "trial_ending" in English. Every label here is written from the state's
 * documented meaning, and states that differ stay distinct: `open`(청구서 발행,
 * 아직 결제 전) is not `unpaid`(납부 기한이 지난 미납), and `cancelled`(이미 해지됨)
 * is not the `cancel_at_period_end` flag(기간 말 해지 예약), which the tables show
 * separately.
 *
 * An unknown value falls through to itself, so a status added on the server
 * shows up verbatim rather than disappearing.
 */
const STATUS_LABELS: Record<string, string> = {
  // 구독 — /subscriptions/me 가 문서화한 9개 실효 상태.
  trial: "무료 체험",
  trial_ending: "체험 종료 임박",
  active: "이용 중",
  payment_pending: "결제 대기",
  payment_failed: "결제 실패",
  grace_period: "유예 기간",
  suspended: "이용 중지",
  cancelled: "해지됨",
  expired: "만료",
  // 결제 / 청구서
  succeeded: "결제 성공",
  failed: "실패",
  refunded: "환불됨",
  paid: "결제 완료",
  open: "결제 전",
  unpaid: "미납",
  void: "무효",
  // 영상 업로드
  pending: "대기 중",
  uploading: "업로드 중",
  processing: "변환 중",
  ready: "재생 가능",
  deleted: "삭제됨",
  // 쿠폰
  consumed: "사용 완료",
  revoked: "회수됨",
  queued: "사용 대기",
  // 검수 / 요금제. Account status is NOT here: `users.status` has its own
  // vocabulary in `lib/accountStatus.ts`, because an account and a
  // subscription both have an `active` that means different things, and this
  // map keyed by a bare string cannot tell them apart. It printed the
  // subscription word on the user table for exactly that reason.
  approved: "승인",
  rejected: "반려",
  archived: "보관됨",
};

/** The Korean label for a status, or the raw value when it has none yet. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case "active":
    case "ready":
    case "succeeded":
    case "paid":
    case "approved":
    case "trial":
      return "success";
    case "pending":
    case "processing":
    case "uploading":
    case "open":
    case "queued":
    case "grace_period":
    case "payment_pending":
      return "warning";
    case "failed":
    case "suspended":
    case "revoked":
    case "rejected":
    case "unpaid":
    case "payment_failed":
    case "expired":
      return "danger";
    case "cancelled":
    case "void":
    case "archived":
    case "deleted":
      return "neutral";
    default:
      return "neutral";
  }
}

/* ---------- Form fields ---------- */

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="hgadm-field">
      <span className="hgadm-field__label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {error ? (
        <span className="hgadm-field__error">{error}</span>
      ) : hint ? (
        <span className="hgadm-field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`hgadm-input ${props.className ?? ""}`} />;
}

/**
 * Custom single-select dropdown. Drop-in replacement for a native <select>:
 * accepts the same `value` / `onChange(e => e.target.value)` / <option> children
 * API, but renders its own listbox (portalled to <body>) that always opens
 * directly BELOW the field — flipping above only when there isn't room — instead
 * of the native macOS overlay that covers the control. Keyboard + a11y complete.
 */
interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  className = "",
  style,
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: SelectProps) {
  const options = useMemo<SelectOption[]>(() => {
    const out: SelectOption[] = [];
    Children.forEach(children, (child) => {
      if (!isValidElement(child) || child.type !== "option") return;
      const p = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
      out.push({ value: String(p.value ?? ""), label: p.children, disabled: p.disabled });
    });
    return out;
  }, [children]);

  const current = String(value ?? "");
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<
    { left: number; width: number; maxHeight: number; top?: number; bottom?: number } | null
  >(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const desired = Math.min(288, options.length * 37 + 8);
    const openUp = spaceBelow < Math.min(desired, 200) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(desired, openUp ? spaceAbove : spaceBelow));
    setPos(
      openUp
        ? { left: r.left, bottom: window.innerHeight - r.top + gap, width: r.width, maxHeight }
        : { left: r.left, top: r.bottom + gap, width: r.width, maxHeight },
    );
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  }, [disabled, place, selectedIndex]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt || opt.disabled) return;
      if (opt.value !== current) onChange?.({ target: { value: opt.value } });
      close();
    },
    [options, current, onChange, close],
  );

  // Keep the menu glued to the trigger while scrolling/resizing; close on an
  // outside pointer press. The menu's own scroll is ignored via the ref check.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    menuRef.current?.focus();
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      place();
    };
    const onResize = () => place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, place, close]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setActive((prev) => {
        let next = prev;
        for (let i = 0; i < options.length; i++) {
          next = (next + dir + options.length) % options.length;
          if (!options[next]?.disabled) break;
        }
        return next;
      });
    },
    [options.length, options],
  );

  function onTriggerKey(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  }

  function onMenuKey(e: ReactKeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className={`hgadm-select hgadm-select-trigger ${className}`}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} className="hgadm-select-trigger__caret" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            className="hgadm-dropdown-menu"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={undefined}
            style={{
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            }}
            onKeyDown={onMenuKey}
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === current;
              return (
                <li
                  key={`${opt.value}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  className={`hgadm-dropdown-option ${i === active ? "active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                >
                  <span className="hgadm-dropdown-option__label">{opt.label}</span>
                  {isSelected && (
                    <Check size={15} strokeWidth={2.5} className="hgadm-dropdown-option__check" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`hgadm-textarea ${props.className ?? ""}`} />;
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <span className="hgadm-switch" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="hgadm-switch__track" aria-hidden />
    </span>
  );
}

/* ---------- States ---------- */

export function Spinner() {
  return <span className="hgadm-spinner" role="status" aria-label="로딩 중" />;
}

export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="hgadm-state">
      <Spinner />
      <div className="hgadm-state__desc">{label}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="hgadm-state">
      <div className="hgadm-state__icon" aria-hidden>
        {icon ?? <Inbox size={28} strokeWidth={1.75} />}
      </div>
      <div className="hgadm-state__title">{title}</div>
      {desc && <div className="hgadm-state__desc">{desc}</div>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="hgadm-state">
      <div className="hgadm-state__icon" aria-hidden>
        <AlertTriangle size={28} strokeWidth={1.75} />
      </div>
      <div className="hgadm-state__title">문제가 발생했어요</div>
      <div className="hgadm-state__desc">{message}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

/* ---------- Modal & confirm ---------- */

export function Modal({
  open,
  title,
  onClose,
  size,
  children,
  footer,
  hideHeader,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  footer?: ReactNode;
  /** Suppress the default title/close header (caller renders its own). */
  hideHeader?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="hgadm-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`hgadm-modal ${size ? `hgadm-modal--${size}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {!hideHeader && (
          <div className="hgadm-modal__head">
            <div className="hgadm-modal__title">{title}</div>
            <button className="hgadm-modal__close" onClick={onClose} aria-label="닫기">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className="hgadm-modal__body">{children}</div>
        {footer && <div className="hgadm-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "확인",
  danger,
  icon,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Contextual glyph shown in the badge; defaults to a heads-up icon. */
  icon?: ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={loading ? () => {} : onCancel}
      size="sm"
      hideHeader
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading} block>
            취소
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            block
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="hgadm-confirm">
        <div className={`hgadm-confirm__icon ${danger ? "hgadm-confirm__icon--danger" : ""}`} aria-hidden>
          {icon ?? (danger ? <AlertTriangle size={24} strokeWidth={2} /> : <AlertCircle size={24} strokeWidth={2} />)}
        </div>
        <div className="hgadm-confirm__title">{title}</div>
        <div className="hgadm-confirm__text">{message}</div>
      </div>
    </Modal>
  );
}

/* ---------- Data table ---------- */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-align numeric columns. */
  numeric?: boolean;
  /** Set to enable click-to-sort with this backend sort key. */
  sortKey?: string;
  width?: string | number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  order,
  onSortChange,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: string;
  order?: "asc" | "desc";
  onSortChange?: (sort: string, order: "asc" | "desc") => void;
  empty?: ReactNode;
}) {
  return (
    <div className="hgadm-table-wrap">
      <table className="hgadm-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = Boolean(col.sortKey && onSortChange);
              const isActive = sortable && sort === col.sortKey;
              return (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={[
                    col.numeric ? "num" : "",
                    sortable ? "sortable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-sort={
                    isActive ? (order === "asc" ? "ascending" : "descending") : undefined
                  }
                  onClick={
                    sortable
                      ? () =>
                          onSortChange!(
                            col.sortKey!,
                            isActive && order === "desc" ? "asc" : "desc",
                          )
                      : undefined
                  }
                >
                  {col.header}
                  {isActive ? (order === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="hgadm-table__empty">
                  {empty ?? "표시할 항목이 없습니다."}
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? "clickable" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.numeric ? "num" : undefined}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="hgadm-pagination">
      <span>
        {total.toLocaleString()}건 중 {from.toLocaleString()}–{to.toLocaleString()}
      </span>
      <div className="hgadm-pagination__pages">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(1)}>
          «
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </Button>
        <span style={{ padding: "5px 8px", fontWeight: 700 }}>
          {page} / {pages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => onPageChange(pages)}
        >
          »
        </Button>
      </div>
    </div>
  );
}

/* ---------- Search box (debounced) ---------- */

export function SearchBox({
  value,
  onSearch,
  placeholder = "검색…",
}: {
  value: string;
  onSearch: (q: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(value), [value]);
  return (
    <span className="hgadm-search">
      <span className="hgadm-search__icon" aria-hidden>
        <SearchIcon size={16} strokeWidth={1.75} />
      </span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onSearch(next), 350);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            onSearch(draft);
          }
        }}
      />
    </span>
  );
}

/* ---------- Stat tile ---------- */

export function Stat({
  label,
  value,
  sub,
  subTone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: "up" | "down";
}) {
  return (
    <div className="hgadm-stat">
      <div className="hgadm-stat__label">{label}</div>
      <div className="hgadm-stat__value">{value}</div>
      {sub && (
        <div className={`hgadm-stat__sub ${subTone ? `hgadm-stat__sub--${subTone}` : ""}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ---------- Description list ---------- */

export function Dl({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="hgadm-dl">
      {items.map(([label, value], i) => (
        <FragmentRow key={i} label={label} value={value} />
      ))}
    </dl>
  );
}

function FragmentRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </>
  );
}

/* ---------- Formatting helpers ---------- */
