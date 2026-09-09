import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Info, Languages, Phone } from "lucide-react";
import { adminApi } from "../api";
import { useAdminAuth } from "../auth";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import {
  Button,
  Dl,
  ErrorState,
  Field,
  Input,
  LoadingState,
  formatDateTime,
} from "../components/kit";

/** Matches the server's default; the reminder uses it until an admin changes it. */
const DEFAULT_TIME = "19:00";

const QUERY_KEY = ["admin", "notification-settings", "daily-reminder"];

/**
 * Same rule the API enforces: zero-padded 24-hour `HH:MM`. Deliberately as
 * strict as the server — `9:00` and `19:5` are rejected there too, so accepting
 * them here would only turn a clear inline message into a 422.
 */
export function validateReminderTime(value: string): string | null {
  if (!value.trim()) return "발송 시각을 입력하세요.";
  const parts = value.split(":");
  if (parts.length !== 2 || !parts.every((p) => p.length === 2 && /^\d{2}$/.test(p))) {
    return "HH:MM 형식으로 입력하세요. (예: 19:00)";
  }
  const [hour, minute] = parts.map(Number);
  if (hour > 23) return "시(HH)는 00~23 사이여야 합니다.";
  if (minute > 59) return "분(MM)은 00~59 사이여야 합니다.";
  return null;
}

export function NotificationSettingsPage() {
  const toast = useToast();
  const toastError = useToastError();
  const qc = useQueryClient();
  const { can } = useAdminAuth();
  const canEdit = can("ops:write");

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: adminApi.getDailyReminder });

  const [time, setTime] = useState("");
  const [touched, setTouched] = useState(false);
  const saved = query.data?.daily_reminder_time ?? "";

  // Adopt the server's value once it lands, and again after a save, but never
  // over an edit in progress — a background refetch must not eat what the
  // admin is typing.
  useEffect(() => {
    if (saved && !touched) setTime(saved);
  }, [saved, touched]);

  const error = touched ? validateReminderTime(time) : null;
  const dirty = touched && time !== saved;

  const save = useMutation({
    mutationFn: () => adminApi.updateDailyReminder({ daily_reminder_time: time }),
    onSuccess: (result) => {
      qc.setQueryData(QUERY_KEY, result);
      setTouched(false);
      setTime(result.daily_reminder_time);
      toast.success(`발송 시각을 ${result.daily_reminder_time}으로 변경했어요.`);
    },
    onError: toastError,
  });

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>알림 설정</h1>
          <div className="hgadm-page-head__desc">
            매일 발송되는 학습 리마인더의 발송 시각을 관리합니다. 사용자가 직접 바꿀 수 있는
            값이 아니라, 관리자가 전체 사용자에게 적용하는 설정입니다.
          </div>
        </div>
      </div>

      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">일일 학습 리마인더</div>
          </div>
          <div className="hgadm-card__body">
            {query.isPending ? (
              <LoadingState label="설정을 불러오는 중…" />
            ) : query.isError ? (
              <ErrorState
                message={errorMessage(query.error)}
                onRetry={() => void query.refetch()}
              />
            ) : (
              <>
                <div
                  className="hgadm-row"
                  style={{
                    gap: 8,
                    alignItems: "flex-start",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    marginBottom: 16,
                  }}
                >
                  <Globe2
                    size={16}
                    strokeWidth={2}
                    style={{ flexShrink: 0, marginTop: 2, color: "var(--ink-3)" }}
                  />
                  <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
                    <strong>전체 공통 설정입니다.</strong> 여기서 바꾼 시각은 학습 리마인더를
                    켜 둔 모든 사용자에게 즉시 적용됩니다. 사용자별로 다른 시각을 지정할 수는
                    없습니다.
                  </div>
                </div>

                <Field
                  label="발송 시각"
                  required
                  error={error}
                  hint={`24시간제 HH:MM 형식 (기본값 ${DEFAULT_TIME})`}
                >
                  <Input
                    value={time}
                    onChange={(e) => {
                      setTouched(true);
                      setTime(e.target.value);
                    }}
                    disabled={!canEdit || save.isPending}
                    maxLength={5}
                    inputMode="numeric"
                    placeholder={DEFAULT_TIME}
                    aria-label="발송 시각"
                    aria-invalid={error ? true : undefined}
                    style={{ width: 140, fontVariantNumeric: "tabular-nums" }}
                  />
                </Field>

                {canEdit ? (
                  <div className="hgadm-row" style={{ gap: 8, marginTop: 4 }}>
                    <Button
                      variant="primary"
                      loading={save.isPending}
                      disabled={!dirty || error !== null}
                      onClick={() => save.mutate()}
                    >
                      저장
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={save.isPending || time === DEFAULT_TIME}
                      onClick={() => {
                        setTouched(true);
                        setTime(DEFAULT_TIME);
                      }}
                    >
                      기본값({DEFAULT_TIME})으로
                    </Button>
                    {dirty && !error && (
                      <span className="hgadm-muted" style={{ fontSize: 12.5 }}>
                        저장하지 않은 변경사항이 있습니다.
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="hgadm-muted" style={{ fontSize: 13, marginTop: 4 }}>
                    변경하려면 <code>ops:write</code> 권한이 필요합니다. 현재 계정은 조회만
                    가능합니다.
                  </p>
                )}

                <div style={{ marginTop: 20 }}>
                  <Dl
                    items={[
                      ["현재 적용 값", <strong key="v">{saved}</strong>],
                      [
                        "마지막 변경",
                        query.data?.updated_at
                          ? formatDateTime(query.data.updated_at)
                          : "변경 이력 없음 (기본값)",
                      ],
                      [
                        "변경한 관리자",
                        query.data?.updated_by_admin_id ? (
                          <span className="hgadm-cell-mono">
                            {query.data.updated_by_admin_id}
                          </span>
                        ) : (
                          "—"
                        ),
                      ],
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="hgadm-card">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">발송 시각이 정해지는 방식</div>
          </div>
          <div className="hgadm-card__body">
            <NoteRow icon={<Phone size={16} strokeWidth={2} />} title="기준은 휴대폰 인증 국가">
              위 시각은 UTC 절대 시각이 아니라 <strong>각 사용자의 현지 시각</strong>입니다.
              현지 시각의 기준은 그 사용자가 <strong>인증한 휴대폰 번호의 국가</strong>이며,
              앱 언어 설정이나 기기 타임존은 사용하지 않습니다.
            </NoteRow>
            <NoteRow icon={<Info size={16} strokeWidth={2} />} title="예시">
              <span className="hgadm-cell-mono">{saved || DEFAULT_TIME}</span> 설정 시 +82(한국)
              번호 사용자는 한국 시간, +33(프랑스) 번호 사용자는 프랑스 시간 기준으로 같은
              시각에 받습니다. 국가를 알 수 없는 번호는 UTC 기준으로 발송됩니다.
            </NoteRow>
            <NoteRow icon={<Languages size={16} strokeWidth={2} />} title="언어는 별개">
              알림 <strong>문구</strong>는 각 사용자의 앱 언어를 따릅니다. 언어를 영어로 바꿔도
              발송 시각은 바뀌지 않습니다.
            </NoteRow>
            <p className="hgadm-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
              학습 리마인더를 끈 사용자와 그날 학습 목표를 이미 채운 사용자에게는 발송되지
              않습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteRow({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="hgadm-row" style={{ gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
      <span style={{ flexShrink: 0, marginTop: 2, color: "var(--ink-3)" }} aria-hidden>
        {icon}
      </span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}
