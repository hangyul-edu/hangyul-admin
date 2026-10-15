import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Play } from "lucide-react";
import type { AdminCheckpoint } from "../../../api";
import { Badge, Button } from "../../../components/kit";
import { formatPrecise, parseTime, roundTime } from "../../../lib/videoFile";
import {
  CopyFromCatalog,
  QuizFields,
  SentenceFields,
  emptyQuiz,
  emptySentence,
  quizFormFrom,
  sentenceFormFrom,
} from "../CheckpointContent";
import { KIND_COPY, LEAD_IN_SECONDS, MIN_GAP_SECONDS, TYPE_LABEL, kindOf, type ContentKind, type Draft } from "./model";

/**
 * The scrub bar with a marker per checkpoint. Press and drag anywhere on it
 * to scrub; press a marker to open that checkpoint.
 */
export function Timeline({
  trackRef,
  duration,
  now,
  items,
  kind,
  selectedId,
  draftAt,
  onSeek,
  onSelect,
}: {
  trackRef: React.RefObject<HTMLDivElement>;
  duration: number;
  now: number;
  items: AdminCheckpoint[];
  kind: ContentKind;
  selectedId: string | null;
  draftAt: number | null;
  onSeek: (seconds: number) => void;
  onSelect: (checkpoint: AdminCheckpoint) => void;
}) {
  const pct = (s: number) => `${duration ? Math.min(100, (s / duration) * 100) : 0}%`;
  const at = (e: ReactPointerEvent) => {
    const box = (trackRef.current as HTMLDivElement).getBoundingClientRect();
    return ((e.clientX - box.left) / box.width) * duration;
  };
  return (
    <div className="hgadm-cpe__timeline">
      <div
        ref={trackRef}
        className="hgadm-cpe__track"
        role="slider"
        aria-label="재생 위치"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={roundTime(now)}
        aria-valuetext={formatPrecise(now)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onSeek(at(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) onSeek(at(e));
        }}
      >
        <span className="hgadm-cpe__played" style={{ width: pct(now) }} />
        <span className="hgadm-cpe__head" style={{ left: pct(now) }} />
      </div>
      <div className="hgadm-cpe__markers">
        {items.map((c) => (
          <button
            key={c.checkpoint_id}
            type="button"
            className={[
              "hgadm-cpe__marker",
              `is-${c.sentence_id ? "speak" : "topik"}`,
              c.checkpoint_id === selectedId ? "is-selected" : "",
              c.needs_review || c.out_of_range || kindOf(c) !== kind ? "is-flagged" : "",
            ].join(" ")}
            style={{ left: pct(c.out_of_range ? duration : c.at_second) }}
            title={`${formatPrecise(c.at_second)} · ${TYPE_LABEL[c.interaction_type][0]}`}
            aria-label={`${formatPrecise(c.at_second)} ${TYPE_LABEL[c.interaction_type][0]} 체크포인트`}
            onClick={() => onSelect(c)}
          />
        ))}
        {draftAt !== null && selectedId === null && (
          <span className="hgadm-cpe__marker is-draft" style={{ left: pct(draftAt) }} aria-hidden />
        )}
      </div>
    </div>
  );
}

export function CheckpointList({
  items,
  kind,
  copy,
  onSelect,
  onPreview,
}: {
  items: AdminCheckpoint[];
  kind: ContentKind;
  copy: (typeof KIND_COPY)[ContentKind];
  onSelect: (c: AdminCheckpoint) => void;
  onPreview: (c: AdminCheckpoint) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="hgadm-cpe__empty">
        아직 체크포인트가 없어요. 영상을 재생하거나 타임라인을 끌어 원하는 지점으로 이동한 뒤, ‘{copy.add}’를
        누르고 그 자리에서 {copy.noun}를 바로 쓰면 돼요. 미리 다른 메뉴에서 만들어 둘 필요가 없어요.
      </div>
    );
  }
  return (
    <ul className="hgadm-cpe__list" aria-label="체크포인트 목록">
      {items.map((c) => {
        const [label, tone] = TYPE_LABEL[c.interaction_type];
        return (
          <li key={c.checkpoint_id} className="hgadm-cpe__row">
            <button type="button" className="hgadm-cpe__item" onClick={() => onSelect(c)}>
              <span className="hgadm-cpe__time">{formatPrecise(c.at_second)}</span>
              <span className="hgadm-cpe__item-body">
                <Badge tone={tone}>{label}</Badge>
                <span className="hgadm-cell-main">{c.content_label ?? "(삭제된 콘텐츠)"}</span>
                {c.content_detail && <span className="hgadm-cell-sub">{c.content_detail}</span>}
                {kindOf(c) !== kind ? (
                  <Badge tone="danger">강의 종류와 맞지 않음 — 교체 필요</Badge>
                ) : c.out_of_range ? (
                  <Badge tone="danger">영상 길이를 벗어남</Badge>
                ) : c.needs_review ? (
                  <Badge tone="warning">영상 교체 후 확인 필요</Badge>
                ) : null}
                {c.content_archived && <Badge tone="danger">보관된 콘텐츠 — 교체 필요</Badge>}
                {c.content_owned === false && !c.content_archived && kindOf(c) === kind && (
                  <Badge tone="neutral">공용 콘텐츠 연결</Badge>
                )}
              </span>
            </button>
            <Button size="sm" variant="secondary" onClick={() => onPreview(c)} aria-label={`${formatPrecise(c.at_second)} 미리보기`}>
              <Play size={12} strokeWidth={2.25} aria-hidden />
              미리보기
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function DraftPanel({
  draft,
  kind,
  now,
  duration,
  clash,
  canWrite,
  saving,
  canSave,
  contentProblem,
  onChange,
  onMove,
  onPreview,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  kind: ContentKind;
  now: number;
  duration: number;
  clash: AdminCheckpoint | undefined;
  canWrite: boolean;
  saving: boolean;
  canSave: boolean;
  contentProblem: string | null;
  onChange: (draft: Draft) => void;
  onMove: (to: number) => void;
  onPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const copy = KIND_COPY[kind];
  return (
    <div className="hgadm-cpe__draft" aria-label="체크포인트 편집">
      <div className="hgadm-cpe__draft-title">
        {draft.checkpointId ? "체크포인트 편집" : `새 체크포인트 · ${copy.noun}`}
      </div>

      <Group label="재생 시점">
        <div className="hgadm-cpe__at">
          {canWrite ? (
            <TimeInput value={draft.at} duration={duration} onCommit={onMove} />
          ) : (
            <strong>{formatPrecise(draft.at)}</strong>
          )}
          <Button size="sm" variant="ghost" onClick={onPreview}>
            앞 {LEAD_IN_SECONDS}초부터 미리보기
          </Button>
        </div>
        {canWrite && (
          <div className="hgadm-cpe__at-nudges" role="group" aria-label="시점 조정">
            {[-1, -0.1, 0.1, 1].map((step) => (
              <Button key={step} size="sm" variant="ghost" onClick={() => onMove(draft.at + step)}>
                {step > 0 ? `+${step}초` : `${step}초`}
              </Button>
            ))}
            {now !== draft.at && (
              <Button size="sm" onClick={() => onChange({ ...draft, at: now })}>
                현재 위치({formatPrecise(now)})로
              </Button>
            )}
          </div>
        )}
        {draft.at >= duration && (
          <div className="hgadm-lw__error">영상 길이({formatPrecise(duration)}) 안의 지점을 골라 주세요.</div>
        )}
        {clash && (
          <div className="hgadm-lw__error">
            {formatPrecise(clash.at_second)}의 체크포인트와 {MIN_GAP_SECONDS}초 이상 떨어져야 해요.
          </div>
        )}
      </Group>

      <Group label={copy.heading} hint={copy.hint}>
        {draft.linkedId && (
          <div className="hgadm-cpe__linked" role="note">
            공용 {kind === "sentence" ? "문장" : "문제"}이 연결된 체크포인트예요. 내용을 고치면 이 강의 전용 사본으로
            저장되고, 공용 {kind === "sentence" ? "문장" : "문제"}은 그대로 남아요.
          </div>
        )}
        {kind === "sentence" ? (
          <SentenceFields
            form={draft.sentence ?? emptySentence()}
            readOnly={!canWrite}
            // Editing the content detaches it from the shared row it linked.
            onChange={(sentence) => onChange({ ...draft, sentence, linkedId: null })}
          />
        ) : (
          <QuizFields
            draft={draft.quiz ?? emptyQuiz()}
            readOnly={!canWrite}
            onChange={(quiz) => onChange({ ...draft, quiz, linkedId: null })}
          />
        )}
        {canWrite && (
          <details className="hgadm-cpc__more">
            <summary>기존 {kind === "sentence" ? "문장" : "문제"}에서 불러오기</summary>
            <p className="hgadm-field__hint">고르면 내용이 위 칸에 복사돼요. 복사본은 이 강의 전용이고, 원본은 그대로예요.</p>
            <CopyFromCatalog
              kind={kind}
              onSentence={(s) => onChange({ ...draft, sentence: { ...sentenceFormFrom(s) }, linkedId: null })}
              onQuiz={(q) => onChange({ ...draft, quiz: quizFormFrom(q), linkedId: null })}
            />
          </details>
        )}
      </Group>

      {canWrite && contentProblem && <p className="hgadm-field__hint">{contentProblem}</p>}

      <div className="hgadm-cpe__draft-actions">
        {onDelete && canWrite && (
          <Button variant="danger-soft" onClick={onDelete}>
            삭제
          </Button>
        )}
        <span className="hgadm-cpe__spacer" />
        <Button variant="ghost" onClick={onCancel}>
          닫기
        </Button>
        {canWrite && (
          <Button variant="primary" loading={saving} disabled={!canSave} onClick={onSave}>
            저장
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The checkpoint's time, typed exactly: "1:23.45", "1:02:03.5" or seconds
 * ("83.45"). Applied on Enter or when the field loses focus — the preview
 * jumps there — and Esc puts back the current time.
 */
function TimeInput({ value, duration, onCommit }: { value: number; duration: number; onCommit: (seconds: number) => void }) {
  const [text, setText] = useState(formatPrecise(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(formatPrecise(value));
    setError(null);
  }, [value]);

  function commit() {
    const seconds = parseTime(text);
    if (seconds === null) {
      setError("1:23.45 또는 83.45처럼 입력해 주세요.");
    } else if (seconds >= duration) {
      setError(`영상 길이(${formatPrecise(duration)})보다 앞선 시점을 입력해 주세요.`);
    } else if (seconds === value) {
      setText(formatPrecise(value));
      setError(null);
    } else {
      setError(null);
      onCommit(seconds);
    }
  }

  return (
    <span className="hgadm-cpe__time-input">
      <input
        className="hgadm-input"
        value={text}
        inputMode="decimal"
        spellCheck={false}
        aria-label="체크포인트 시점 (분:초.00)"
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setText(formatPrecise(value));
            setError(null);
          }
        }}
      />
      {error && (
        <span className="hgadm-lw__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * `Field` wraps its control in a <label>, which turns a click anywhere on it
 * into a click on the first button inside — wrong for a radio group or a
 * result list. Same look, as a plain group.
 */
function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="hgadm-field" role="group" aria-label={label}>
      <span className="hgadm-field__label">{label}</span>
      {children}
      {hint && <span className="hgadm-field__hint">{hint}</span>}
    </div>
  );
}
