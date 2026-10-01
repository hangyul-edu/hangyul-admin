import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

type StepState = "done" | "active" | "waiting";

/**
 * One lecture, set up in the order it is built: basic information, then its
 * video, then the conversation / TOPIK checkpoints placed on that video.
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
  const courses = useQuery({ queryKey: ["admin", "courses", ""], queryFn: () => adminApi.listCourses() });

  const refreshLecture = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["admin", "lecture", lectureId] });
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "lecture-checkpoints", lectureId] });
  }, [qc, lectureId]);

  if (lecture.isPending) return <LoadingState />;
  if (lecture.isError)
    return <ErrorState message={errorMessage(lecture.error)} onRetry={() => void lecture.refetch()} />;

  const l = lecture.data;
  const videoReady = l.video_status === "ready";
  const courseTitle = courses.data?.items.find((c) => c.course_id === l.course_id)?.title;
  const steps: [string, string, StepState][] = [
    ["기본 정보", l.title, "done"],
    [
      "영상",
      videoReady ? `준비됨 · ${formatClock(l.duration_seconds)}` : l.video_status ? statusLabel(l.video_status) : "올려 주세요",
      videoReady ? "done" : "active",
    ],
    [
      "체크포인트",
      videoReady ? `${l.checkpoint_count}개` : "영상 준비 후",
      !videoReady ? "waiting" : l.checkpoint_count > 0 ? "done" : "active",
    ],
  ];

  return (
    <div className="hgadm-lw">
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row" style={{ marginBottom: 4 }}>
            <Link to="/lectures" className="hgadm-muted hgadm-row" style={{ fontSize: 13, gap: 4 }}>
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
          </h1>
          <div className="hgadm-page-head__desc">
            영상을 올리면 길이는 자동으로 맞춰지고, 그 영상을 보면서 회화·TOPIK 체크포인트를 원하는 지점에 붙일 수
            있어요.
          </div>
        </div>
      </div>

      <ol className="hgadm-lw__steps" aria-label="강의 준비 단계">
        {steps.map(([name, detail, state], i) => (
          <li key={name} className={`is-${state}`}>
            <span className="hgadm-lw__step-no">{state === "done" ? "✓" : i + 1}</span>
            <span>
              <strong>{name}</strong>
              <span className="hgadm-cell-sub">{detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="hgadm-card hgadm-lw__card" aria-labelledby="lw-info">
        <div className="hgadm-card__head">
          <div className="hgadm-card__title" id="lw-info">
            1. 기본 정보
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setEditing(true)}>
              수정
            </Button>
          )}
        </div>
        <div className="hgadm-card__body">
          <Dl
            items={[
              ["강의 ID", <span className="hgadm-cell-mono">{l.lecture_id}</span>],
              ["소속 코스", courseTitle ?? (l.course_id ? l.course_id : "(코스 없음)")],
              ["정렬 순서", l.sequence],
              ["길이", l.duration_seconds && videoReady ? `${formatClock(l.duration_seconds)} (영상에서 자동)` : "영상이 준비되면 자동으로 채워져요"],
              ...(l.track_id === "track_topik"
                ? ([["TOPIK 문제 유형", l.topik_question_type ?? "—"]] as [string, string][])
                : []),
              ["썸네일", l.thumbnail_url ? <img src={l.thumbnail_url} alt="" className="hgadm-thumb" /> : "—"],
            ]}
          />
        </div>
      </section>

      <section className="hgadm-card hgadm-lw__card" aria-labelledby="lw-video">
        <div className="hgadm-card__head">
          <div className="hgadm-card__title" id="lw-video">
            2. 영상
          </div>
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
      </section>

      <section className="hgadm-card hgadm-lw__card" aria-labelledby="lw-cp">
        <div className="hgadm-card__head">
          <div className="hgadm-card__title" id="lw-cp">
            3. 체크포인트 — 영상 중간의 회화·TOPIK 모달
          </div>
        </div>
        <div className="hgadm-card__body">
          <p className="hgadm-lw__note">
            영상이 지정한 지점에 오면 재생이 멈추고 회화(따라 말하기) 또는 TOPIK 문제 모달이 열려요. 학습자가
            모달을 마치면 영상이 이어집니다. 학습자는 플레이어의 ‘말하기 제외’/‘문제 풀이 제외’ 스위치로 해당
            모달을 건너뛸 수 있어요.
          </p>
          <CheckpointEditor lecture={l} canWrite={canWrite} />
        </div>
      </section>

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
