import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../../api";
import type { AdminLecture } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, Field, Input, Modal, Select } from "../../components/kit";
import { LanguageFields, koreanTitle, languageDraft, translationsOf } from "../../components/LanguageFields";
import type { CatalogTranslation } from "../../api";

/** "English title (한국어 제목)" for a picker option — plain text only. */
function withKorean(item: { title: string; translations?: CatalogTranslation[] }): string {
  const ko = koreanTitle(item);
  return ko && ko !== item.title ? `${item.title} (${ko})` : item.title;
}
import type { LanguageDraft } from "../../components/LanguageFields";
import { TopikTypeSelect } from "../../components/TopikTypeSelect";
import { ImageDropzone } from "../../components/ImageDropzone";
import { TRACKS, TRACK_LABEL } from "../../lib/tracks";


interface LectureDraft {
  course_id: string;
  series_id: string;
  text: LanguageDraft;
  access: string;
  thumbnail_url: string;
  topik_question_type: string;
}

function draftOf(lecture: AdminLecture | null, initial?: { courseId?: string; seriesId?: string }): LectureDraft {
  return lecture
    ? {
        course_id: lecture.course_id ?? "",
        series_id: lecture.series_id ?? "",
        text: languageDraft(lecture),
        access: lecture.access,
        thumbnail_url: lecture.thumbnail_url ?? "",
        topik_question_type: lecture.topik_question_type ?? "",
      }
    : {
        course_id: initial?.courseId ?? "",
        series_id: initial?.seriesId ?? "",
        text: languageDraft(null),
        access: "free",
        thumbnail_url: "",
        topik_question_type: "",
      };
}

/**
 * A lecture's basic information — step 1 of setting up a lecture.
 *
 * A lecture is always filed under a series of a course (코스 › 시리즈); there
 * is no standalone lecture. Its track is the course's. Every lecture is a
 * video, and its length is read from that video once it is uploaded, so
 * neither a type nor a length is asked for here. Creating a lecture hands it
 * back so the caller can go straight on to its video.
 */
export function LectureFormModal({
  lecture,
  initialCourseId,
  initialSeriesId,
  onClose,
  onSaved,
}: {
  /** null to create a new lecture. */
  lecture: AdminLecture | null;
  /** Preselect where a new lecture goes (e.g. from a series' "강의 추가"). */
  initialCourseId?: string;
  initialSeriesId?: string;
  onClose: () => void;
  onSaved: (lecture: AdminLecture) => void;
}) {
  const toast = useToast();
  const toastError = useToastError();
  const [draft, setDraft] = useState<LectureDraft>(() =>
    draftOf(lecture, { courseId: initialCourseId, seriesId: initialSeriesId }),
  );
  const editing = lecture !== null;

  const courses = useQuery({
    queryKey: ["admin", "courses", ""],
    queryFn: () => adminApi.listCourses(),
  });
  const course = courses.data?.items.find((c) => c.course_id === draft.course_id);
  // A lecture keeps its track: once created it can move only to a series of
  // a course in the same track.
  const track = lecture?.track_id ?? course?.track_id ?? "";
  const choosable = (courses.data?.items ?? []).filter((c) => !lecture || c.track_id === lecture.track_id);

  const series = useQuery({
    queryKey: ["admin", "series", draft.course_id],
    queryFn: () => adminApi.listSeries(draft.course_id),
    enabled: !!draft.course_id,
  });
  const seriesItems = series.data?.items ?? [];
  const noSeries = !!draft.course_id && series.isSuccess && seriesItems.length === 0;

  const save = useMutation({
    mutationFn: (d: LectureDraft) => {
      const base = {
        series_id: d.series_id,
        title: d.text.en.title.trim(),
        description: d.text.en.description,
        translations: translationsOf(d.text),
        access: d.access,
        // null (not omitted) so emptying a field on edit clears it.
        thumbnail_url: d.thumbnail_url || null,
        topik_question_type: d.topik_question_type || null,
      };
      return lecture ? adminApi.updateLecture(lecture.lecture_id, base) : adminApi.createLecture(base);
    },
    onSuccess: (saved) => {
      toast.success(editing ? "강의 정보를 저장했어요." : "강의를 만들었어요. 이제 영상을 올려 주세요.");
      onSaved(saved);
    },
    onError: toastError,
  });

  return (
    <Modal
      open
      title={editing ? "기본 정보 수정" : "강의 추가"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!draft.text.en.title.trim() || !draft.series_id}
            onClick={() => save.mutate(draft)}
          >
            {editing ? "저장" : "만들고 영상 올리기"}
          </Button>
        </>
      }
    >
      {!editing && (
        <p className="hgadm-lw__note">
          강의는 영상 한 편이고, 항상 코스의 시리즈 안에 들어가요. 만든 뒤 영상을 올리면 길이는 영상에서
          자동으로 읽어 오고, 회화·TOPIK 연습은 영상의 원하는 지점에 체크포인트로 붙입니다.
        </p>
      )}
      <div className="hgadm-form-grid">
        <Field
          label="소속 코스"
          required
          hint={editing ? "같은 학습 분야의 코스로만 옮길 수 있어요." : "학습 분야는 코스를 따라갑니다."}
        >
          <Select
            value={draft.course_id}
            onChange={(e) => setDraft({ ...draft, course_id: e.target.value, series_id: "" })}
          >
            <option value="" disabled>
              {courses.isPending ? "불러오는 중…" : "코스를 고르세요"}
            </option>
            {/* The kit Select reads plain <option>s only, so the track leads each label. */}
            {TRACKS.flatMap(([trackId, label]) =>
              choosable
                .filter((c) => c.track_id === trackId)
                .map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {`${label} · ${withKorean(c)}`}
                  </option>
                )),
            )}
          </Select>
        </Field>
        <Field
          label="소속 시리즈"
          required
          hint={
            editing
              ? "같은 학습 분야의 다른 시리즈로 옮길 수 있어요. 옮기면 그 시리즈의 맨 뒤에 들어가고, 순서는 코스 관리의 ‘강의 순서’에서 바꿔요."
              : "새 강의는 시리즈의 맨 뒤에 놓여요. 순서는 코스 관리의 ‘강의 순서’에서 바꿔요."
          }
        >
          <Select
            value={draft.series_id}
            disabled={!draft.course_id || noSeries}
            onChange={(e) => setDraft({ ...draft, series_id: e.target.value })}
          >
            <option value="" disabled>
              {!draft.course_id ? "코스를 먼저 고르세요" : series.isPending ? "불러오는 중…" : "시리즈를 고르세요"}
            </option>
            {seriesItems.map((s) => (
              <option key={s.series_id} value={s.series_id}>
                {withKorean(s)}
              </option>
            ))}
          </Select>
        </Field>
        {noSeries && (
          <div className="span-2 hgadm-lf__noseries" role="status">
            ‘{course?.title}’ 코스에는 아직 시리즈가 없어요. 강의는 시리즈 안에만 넣을 수 있으니, 먼저
            시리즈를 만들어 주세요.{" "}
            <Link to={`/courses?course_id=${draft.course_id}`} onClick={onClose}>
              코스 관리에서 시리즈 추가 →
            </Link>
          </div>
        )}
        <div className="span-2">
          <LanguageFields
            noun="강의"
            titleMaxLength={200}
            value={draft.text}
            onChange={(text) => setDraft({ ...draft, text })}
          />
        </div>
        <Field label="학습 분야" hint="코스에서 정해져요.">
          <Input value={track ? TRACK_LABEL[track] ?? track : "—"} readOnly disabled />
        </Field>
        <Field label="공개 범위" required>
          <Select value={draft.access} onChange={(e) => setDraft({ ...draft, access: e.target.value })}>
            <option value="free">무료</option>
            <option value="premium">프리미엄</option>
          </Select>
        </Field>
        {track === "track_topik" && (
          <Field label="TOPIK 문제 유형" hint="강의 후 문제 연습의 유형">
            <TopikTypeSelect
              value={draft.topik_question_type}
              onChange={(code) => setDraft({ ...draft, topik_question_type: code })}
            />
          </Field>
        )}
        <div className="span-2">
          <ThumbnailField
            value={draft.thumbnail_url}
            onChange={(url) => setDraft({ ...draft, thumbnail_url: url })}
          />
        </div>
      </div>
    </Modal>
  );
}

function ThumbnailField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  return (
    <Field label="썸네일" hint="JPEG/PNG/WebP, 최대 5MB">
      <div className="hgadm-row">
        {value && <img src={value} alt="썸네일" className="hgadm-thumb" />}
        <ImageDropzone replacing={!!value} className="hgadm-flex-1 hgadm-dropzone--compact" onUploaded={onChange} />
      </div>
    </Field>
  );
}
