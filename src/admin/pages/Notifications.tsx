import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { adminApi } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Textarea,
} from "../components/kit";

type Kind = "push" | "notice" | "announcement";

const KINDS: { key: Kind; title: string; desc: string; confirm: string }[] = [
  {
    key: "push",
    title: "마케팅 푸시",
    desc: "마케팅 수신에 동의하고 푸시가 켜진 모든 기기에 푸시 알림을 보냅니다.",
    confirm: "마케팅 수신 동의자 전체에게 푸시가 발송됩니다. 진행할까요?",
  },
  {
    key: "notice",
    title: "마케팅 알림 (인앱)",
    desc: "마케팅 수신 동의자의 앱 알림함에 알림을 넣습니다. 푸시는 발송되지 않습니다.",
    confirm: "마케팅 수신 동의자 전체의 알림함에 기록됩니다. 진행할까요?",
  },
  {
    key: "announcement",
    title: "서비스 공지 (인앱)",
    desc: "모든 사용자(서비스 알림 수신자)의 알림함에 공지를 넣습니다.",
    confirm: "전체 사용자의 알림함에 기록됩니다. 진행할까요?",
  },
];

export function NotificationsPage() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("push");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [dedupKey, setDedupKey] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const meta = KINDS.find((k) => k.key === kind)!;

  const send = useMutation({
    mutationFn: async () => {
      if (kind === "push") {
        return adminApi.sendMarketingPush({
          title,
          body: body || undefined,
          image_url: imageUrl || undefined,
          deep_link: deepLink || undefined,
        });
      }
      const payload = {
        title,
        body: body || undefined,
        deep_link: deepLink || undefined,
        dedup_key: dedupKey || undefined,
      };
      return kind === "notice"
        ? adminApi.sendMarketingNotice(payload)
        : adminApi.sendAnnouncement(payload);
    },
    onSuccess: (result) => {
      const count =
        "sent_count" in result ? result.sent_count : (result as { created: number }).created;
      setLastResult(
        kind === "push"
          ? `푸시를 ${count.toLocaleString()}개 기기에 발송했어요.`
          : `${count.toLocaleString()}명의 알림함에 기록했어요.`,
      );
      setConfirming(false);
      setTitle("");
      setBody("");
      setDeepLink("");
      setImageUrl("");
      setDedupKey("");
      toast.success("발송이 완료되었어요.");
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(errorMessage(e));
    },
  });

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>알림 발송</h1>
          <div className="hgadm-page-head__desc">
            대량 발송은 되돌릴 수 없습니다. 발송 전 내용과 대상을 반드시 확인하세요.
            모든 발송은 관리자 활동 내역에 기록됩니다.
          </div>
        </div>
      </div>

      <div className="hgadm-tabs">
        {KINDS.map((k) => (
          <button
            key={k.key}
            className={`hgadm-tab ${kind === k.key ? "active" : ""}`}
            onClick={() => setKind(k.key)}
          >
            {k.title}
          </button>
        ))}
      </div>

      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">{meta.title}</div>
          </div>
          <div className="hgadm-card__body">
            <p className="hgadm-muted" style={{ fontSize: 13, marginTop: 0 }}>
              {meta.desc}
            </p>
            <Field label="제목" required hint="최대 200자">
              <Input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="본문" hint="최대 1000자">
              <Textarea
                rows={4}
                value={body}
                maxLength={1000}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Field label="이동 링크" hint="알림을 눌렀을 때 이동할 앱 내 경로 (예: /subscription)">
              <Input
                value={deepLink}
                maxLength={500}
                onChange={(e) => setDeepLink(e.target.value)}
              />
            </Field>
            {kind === "push" && (
              <Field label="이미지 URL" hint="푸시 미리보기 이미지 (선택)">
                <Input
                  value={imageUrl}
                  maxLength={500}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </Field>
            )}
            {kind !== "push" && (
              <Field
                label="캠페인 키 (dedup_key)"
                hint="같은 키로 재발송하면 이미 받은 사용자는 중복 수신하지 않습니다."
              >
                <Input
                  value={dedupKey}
                  maxLength={120}
                  onChange={(e) => setDedupKey(e.target.value)}
                />
              </Field>
            )}
            <Button
              variant="primary"
              size="lg"
              disabled={!title.trim()}
              onClick={() => setConfirming(true)}
            >
              발송하기
            </Button>
            {lastResult && (
              <p
                className="hgadm-row"
                style={{ color: "var(--success)", fontSize: 13.5, marginTop: 12, gap: 6 }}
              >
                <CheckCircle2 size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                {lastResult}
              </p>
            )}
          </div>
        </div>

        <div className="hgadm-card">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">미리보기</div>
          </div>
          <div className="hgadm-card__body">
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: 14,
                padding: 14,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--brand-gradient)",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                한
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {title || "알림 제목"}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                  {body || "본문 내용이 여기에 표시됩니다."}
                </div>
                {deepLink && (
                  <div className="hgadm-cell-sub hgadm-cell-mono" style={{ marginTop: 4 }}>
                    → {deepLink}
                  </div>
                )}
              </div>
            </div>
            <p className="hgadm-muted" style={{ fontSize: 12.5 }}>
              실제 표시 형태는 기기·OS 설정에 따라 다를 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`${meta.title} 발송`}
        message={
          <div>
            <p style={{ marginTop: 0 }}>{meta.confirm}</p>
            <div className="hgadm-json" style={{ maxHeight: 140 }}>
              <strong>{title}</strong>
              {body ? `\n${body}` : ""}
            </div>
          </div>
        }
        danger
        confirmLabel="발송"
        loading={send.isPending}
        onConfirm={() => send.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
