import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminLecture } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, Field, Input, Modal, Select } from "../../components/kit";

export const TRACKS = [
  ["track_conversation", "회화"],
  ["track_topik", "TOPIK"],
] as const;
export const TRACK_LABEL: Record<string, string> = Object.fromEntries(TRACKS);

interface LectureDraft {
  track_id: string;
  course_id: string;
  title: string;
  access: string;
  sequence: string;
  thumbnail_url: string;
  topik_question_type: string;
}

function draftOf(lecture: AdminLecture | null): LectureDraft {
  return lecture
    ? {
        track_id: lecture.track_id,
        course_id: lecture.course_id ?? "",
        title: lecture.title,
        access: lecture.access,
        sequence: String(lecture.sequence),
        thumbnail_url: lecture.thumbnail_url ?? "",
        topik_question_type: lecture.topik_question_type ?? "",
      }
    : {
        track_id: "track_conversation",
        course_id: "",
        title: "",
        access: "free",
        sequence: "0",
        thumbnail_url: "",
        topik_question_type: "",
      };
}

/**
 * A lecture's basic information — step 1 of setting up a lecture.
 *
 * Every lecture is a video, and its length is read from that video once it
 * is uploaded, so neither a type nor a length is asked for here. Creating a
 * lecture hands it back so the caller can go straight on to its video.
 */
export function LectureFormModal({
  lecture,
  onClose,
  onSaved,
}: {
  /** null to create a new lecture. */
  lecture: AdminLecture | null;
  onClose: () => void;
  onSaved: (lecture: AdminLecture) => void;
}) {
  const toast = useToast();
  const toastError = useToastError();
  const [draft, setDraft] = useState<LectureDraft>(() => draftOf(lecture));
  const editing = lecture !== null;

  const courses = useQuery({
    queryKey: ["admin", "courses", ""],
    queryFn: () => adminApi.listCourses(),
  });
  const draftCourses = courses.data?.items.filter((c) => c.track_id === draft.track_id) ?? [];

  const save = useMutation({
    mutationFn: (d: LectureDraft) => {
      const base = {
        title: d.title,
        access: d.access,
        sequence: Number(d.sequence),
        // null (not omitted) so emptying a field on edit clears it.
        thumbnail_url: d.thumbnail_url || null,
        topik_question_type: d.topik_question_type || null,
      };
      if (lecture) {
        return adminApi.updateLecture(lecture.lecture_id, {
          ...base,
          course_id: d.course_id || undefined,
          clear_course: d.course_id === "",
        });
      }
      return adminApi.createLecture({
        ...base,
        track_id: d.track_id,
        course_id: d.course_id || undefined,
      });
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
            disabled={!draft.title.trim()}
            onClick={() => save.mutate(draft)}
          >
            {editing ? "저장" : "만들고 영상 올리기"}
          </Button>
        </>
      }
    >
      {!editing && (
        <p className="hgadm-lw__note">
          강의는 영상 한 편이에요. 만든 뒤 영상을 올리면 길이는 영상에서 자동으로 읽어 오고, 회화·TOPIK
          연습은 영상의 원하는 지점에 체크포인트로 붙입니다.
        </p>
      )}
      <div className="hgadm-form-grid">
        <Field label="학습 분야" required hint={editing ? "학습 분야는 변경할 수 없습니다." : undefined}>
          <Select
            value={draft.track_id}
            disabled={editing}
            onChange={(e) => setDraft({ ...draft, track_id: e.target.value, course_id: "" })}
          >
            {TRACKS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="제목" required>
          <Input
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>
        <Field label="소속 코스" hint="같은 학습 분야의 코스만 선택 가능">
          <Select value={draft.course_id} onChange={(e) => setDraft({ ...draft, course_id: e.target.value })}>
            <option value="">(코스 없음)</option>
            {draftCourses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="정렬 순서">
          <Input
            type="number"
            min={0}
            value={draft.sequence}
            onChange={(e) => setDraft({ ...draft, sequence: e.target.value })}
          />
        </Field>
        <Field label="공개 범위" required>
          <Select value={draft.access} onChange={(e) => setDraft({ ...draft, access: e.target.value })}>
            <option value="free">무료</option>
            <option value="premium">프리미엄</option>
          </Select>
        </Field>
        {draft.track_id === "track_topik" && (
          <Field label="TOPIK 문제 유형" hint="예: reading_03 — 강의 후 문제 연습의 유형">
            <Input
              value={draft.topik_question_type}
              maxLength={24}
              onChange={(e) => setDraft({ ...draft, topik_question_type: e.target.value })}
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
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Field label="썸네일" hint="JPEG/PNG/WebP, 최대 5MB">
      <div className="hgadm-row">
        {value && <img src={value} alt="썸네일" className="hgadm-thumb" />}
        <div
          className="hgadm-dropzone"
          style={{ flex: 1, padding: "14px 12px" }}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "업로드 중…" : value ? "클릭해서 교체" : "클릭해서 업로드"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const result = await adminApi.uploadMedia(file);
                onChange(result.url);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
        </div>
      </div>
    </Field>
  );
}
