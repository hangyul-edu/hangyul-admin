import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { adminApi } from "../api";
import { useAdminAuth } from "../auth";
import { errorMessage } from "../../lib/http";
import { Badge, Button, Dl, ErrorState, LoadingState, statusLabel, statusTone } from "../components/kit";
import { formatClock } from "../lib/videoFile";
import { LectureFormModal, TRACK_LABEL } from "./lectures/LectureFormModal";
import { LectureVideoPanel } from "./lectures/LectureVideoPanel";
import { CheckpointEditor } from "./lectures/CheckpointEditor";
import { seriesLessonsKey } from "./courses/LessonOrder";
import { StandInBadge, koreanTitle } from "../components/LanguageFields";

type StepState = "done" | "active" | "waiting";
const TABS = ["info", "video", "checkpoints"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

/** The button at the foot of a tab that moves on to the next step. */
function NextStep({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div className="hgadm-lw__next">
      <Button size="sm" onClick={onClick}>
        {children} →
      </Button>
    </div>
  );
}

/**
 * One lecture, set up in the order it is built: basic information, then its
 * video, then the conversation / TOPIK checkpoints placed on that video.
 * Each step is a tab (kept in the URL as ?tab=info|video|checkpoints), so
 * the long video and checkpoint editors are never stacked on one page.
 *
 * The length is never typed — it is the video's — and checkpoints open only
 * once the video is ready, so a checkpoint is always a moment of the video
 * learners actually watch.
 */
export function LectureWorkspacePage() {
  const { lectureId = "" } = useParams();
  const qc = useQueryClient();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  // The list's filters when the lecture was opened from it — kept for the
  // whole visit, since switching tabs replaces the URL (and its state).
  const location = useLocation();
  const [openedFrom] = useState(() => (location.state as { listSearch?: string } | null)?.listSearch ?? null);

  const lecture = useQuery({
    queryKey: ["admin", "lecture", lectureId],
    // The list endpoint matches a lecture_id exactly, which is all the detail
    // view needs (metadata, video status and checkpoint count).
    queryFn: async () => {
      const page = await adminApi.listLectures({ q: lectureId, page: 1, page_size: 5 });
      const found = page.items.find((l) => l.lecture_id === lectureId);
      if (!found) throw new Error("강의를 찾을 수 없습니다.");
      return found;
    },
  });

  // The lesson's series, in the app's order, for "n번째" in 기본 정보.
  const seriesId = lecture.data?.series_id ?? "";
  // Back link target: the list it was opened from, else (a reload, a pasted
  // link) this lecture's own series — whose list leads back to its course.
  const listSearch =
    openedFrom ??
    (lecture.data?.course_id
      ? `?${new URLSearchParams({
          course_id: lecture.data.course_id,
          ...(seriesId ? { series_id: seriesId } : {}),
        }).toString()}`
      : "");
  const siblings = useQuery({
    queryKey: seriesLessonsKey(seriesId),
    queryFn: () => adminApi.listLectures({ series_id: seriesId, page_size: 100 }),
    enabled: !!seriesId,
  });
  const position = (siblings.data?.items.findIndex((s) => s.lecture_id === lectureId) ?? -1) + 1;

  const refreshLecture = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["admin", "lecture", lectureId] });
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "series-lessons"] });
    void qc.invalidateQueries({ queryKey: ["admin", "lecture-checkpoints", lectureId] });
  }, [qc, lectureId]);

  if (lecture.isPending) return <LoadingState />;
  if (lecture.isError)
    return <ErrorState message={errorMessage(lecture.error)} onRetry={() => void lecture.refetch()} />;

  const l = lecture.data;
  const videoReady = l.video_status === "ready";
  const steps: [Tab, string, string, StepState][] = [
    ["info", "기본 정보", l.title, "done"],
    [
      "video",
      "영상",
      videoReady ? `준비됨 · ${formatClock(l.duration_seconds)}` : l.video_status ? statusLabel(l.video_status) : "올려 주세요",
      videoReady ? "done" : "active",
    ],
    [
      "checkpoints",
      "체크포인트",
      videoReady ? `${l.checkpoint_count}개` : "영상 준비 후",
      !videoReady ? "waiting" : l.checkpoint_count > 0 ? "done" : "active",
    ],
  ];
  // With no tab in the URL, open the step that needs work: the video until it
  // is ready, then the checkpoints.
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : videoReady ? "checkpoints" : "video";
  const setTab = (next: Tab) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("tab", next);
        return out;
      },
      { replace: true },
    );

  return (
    <div className="hgadm-lw">
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row" style={{ marginBottom: 4 }}>
            {/* Back to the list as it was filtered (e.g. one series), not the whole list. */}
            <Link to={`/lectures${listSearch}`} className="hgadm-muted hgadm-row" style={{ fontSize: 13, gap: 4 }}>
              <ArrowLeft size={14} strokeWidth={2} />
              강의·영상 관리
            </Link>
          </div>
          <h1 className="hgadm-row">
            {l.title}
            <Badge tone="brand">{TRACK_LABEL[l.track_id] ?? l.track_id}</Badge>
            <Badge tone={l.access === "premium" ? "warning" : "success"}>
              {l.access === "premium" ? "프리미엄" : "무료"}
            </Badge>
            <StandInBadge title={l.title} />
          </h1>
          {koreanTitle(l) && <div className="hgadm-cell-sub">{koreanTitle(l)}</div>}
          <div className="hgadm-page-head__desc">
            영상을 올리면 길이는 자동으로 맞춰지고, 그 영상을 보면서 회화·TOPIK 체크포인트를 원하는 지점에 붙일 수
            있어요.
          </div>
        </div>
      </div>

      {/* The three steps are tabs, each showing how far along it is. */}
      <div className="hgadm-lw__steps" role="tablist" aria-label="강의 준비 단계">
        {steps.map(([key, name, detail, state], i) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`lw-tab-${key}`}
            aria-controls={`lw-panel-${key}`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            className={`hgadm-lw__step is-${state} ${tab === key ? "is-current" : ""}`}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              setTab(next);
              document.getElementById(`lw-tab-${next}`)?.focus();
            }}
          >
            <span className="hgadm-lw__step-no">{state === "done" ? "✓" : i + 1}</span>
            <span>
              <strong>{name}</strong>
              <span className="hgadm-cell-sub">{detail}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === "info" && (
        <section className="hgadm-card" role="tabpanel" id="lw-panel-info" aria-labelledby="lw-tab-info">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">기본 정보</div>
            {canWrite && (
              <Button size="sm" onClick={() => setEditing(true)}>
                수정
              </Button>
            )}
          </div>
          <div className="hgadm-card__body">
            <Dl
              items={[
                ["소속 코스", l.course_title ?? "—"],
                [
                  "소속 시리즈",
                  l.series_title ?? (
                    <span className="hgadm-muted">시리즈가 없어요 — 수정에서 시리즈를 골라 주세요</span>
                  ),
                ],
                [
                  "시리즈 안 순서",
                  l.series_id ? (
                    <span>
                      {position > 0 ? `${position}번째 / ${siblings.data?.items.length ?? "—"}개` : "—"}{" "}
                      <Link to={`/lectures?course_id=${l.course_id ?? ""}&series_id=${l.series_id}`}>
                        순서 바꾸기 →
                      </Link>
                    </span>
                  ) : (
                    "—"
                  ),
                ],
                ["설명 (English)", l.description || <span className="hgadm-muted">없음</span>],
                [
                  "한국어 제목",
                  koreanTitle(l) ?? <span className="hgadm-muted">없음 — 앱에서 영어로 보여요</span>,
                ],
                [
                  "길이",
                  l.duration_seconds && videoReady
                    ? `${formatClock(l.duration_seconds)} (영상에서 자동)`
                    : "영상이 준비되면 자동으로 채워져요",
                ],
                ...(l.track_id === "track_topik"
                  ? ([["TOPIK 문제 유형", l.topik_question_type ?? "—"]] as [string, string][])
                  : []),
                ["썸네일", l.thumbnail_url ? <img src={l.thumbnail_url} alt="" className="hgadm-thumb" /> : "—"],
              ]}
            />
          </div>
          <NextStep onClick={() => setTab("video")}>다음: 영상</NextStep>
        </section>
      )}

      {tab === "video" && (
        <section className="hgadm-card" role="tabpanel" id="lw-panel-video" aria-labelledby="lw-tab-video">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">영상</div>
            {l.video_status && <Badge tone={statusTone(l.video_status)}>{statusLabel(l.video_status)}</Badge>}
          </div>
          <div className="hgadm-card__body">
            <LectureVideoPanel
              lecture={l}
              canWrite={canWrite}
              checkpointCount={l.checkpoint_count}
              onChanged={refreshLecture}
            />
          </div>
          {videoReady && <NextStep onClick={() => setTab("checkpoints")}>다음: 체크포인트 설정</NextStep>}
        </section>
      )}

      {tab === "checkpoints" && (
        <section className="hgadm-card" role="tabpanel" id="lw-panel-checkpoints" aria-labelledby="lw-tab-checkpoints">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">
              체크포인트 — 영상 중간의 {l.track_id === "track_topik" ? "TOPIK 문제" : "회화 문장"} 모달
            </div>
          </div>
          <div className="hgadm-card__body">
            <p className="hgadm-lw__note">
              {l.track_id === "track_topik"
                ? "영상이 지정한 지점에 오면 재생이 멈추고 TOPIK 문제 모달이 열려요. 학습자가 문제를 풀면 영상이 이어지고, ‘문제 풀이 제외’ 스위치를 켠 학습자는 건너뜁니다."
                : "영상이 지정한 지점에 오면 재생이 멈추고 회화(따라 말하기) 모달이 열려요. 학습자가 문장을 말하면 영상이 이어지고, ‘말하기 제외’ 스위치를 켠 학습자는 건너뜁니다."}
            </p>
            <CheckpointEditor lecture={l} canWrite={canWrite} />
          </div>
          {!videoReady && <NextStep onClick={() => setTab("video")}>영상 탭으로 가기</NextStep>}
        </section>
      )}

      {editing && (
        <LectureFormModal
          lecture={l}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refreshLecture();
          }}
        />
      )}
    </div>
  );
}
