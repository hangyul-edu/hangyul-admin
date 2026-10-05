import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../../api";
import type { AdminCourse, AdminSeries } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, ConfirmDialog, ErrorState, Field, LoadingState, Modal } from "../../components/kit";
import { LanguageFields, StandInBadge, koreanTitle, languageDraft, translationsOf } from "../../components/LanguageFields";
import type { LanguageDraft } from "../../components/LanguageFields";
import { MoveButtons, OrderNumber, useReorder } from "../../components/ordering";
import { LessonOrder } from "./LessonOrder";

interface SeriesDraft {
  text: LanguageDraft;
  thumbnail_url: string;
}

const EMPTY: SeriesDraft = { text: languageDraft(null), thumbnail_url: "" };

/**
 * A course's series — the row of key-art cards learners see under the
 * course on the 강의 tab (COU-001); opening one lists its lessons (COU-002).
 *
 * Each series has its own thumbnail and its title and description in every
 * app language. The cards are in the app's order (left to right) and move
 * with ← / →; each series' lessons are put in order from 강의 순서. A series
 * holding lessons cannot be deleted (move or delete them first), and lessons
 * can only be added into a series, so this is also where a new course gets
 * its first one.
 */
export function SeriesPanel({ course, canWrite }: { course: AdminCourse; canWrite: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [draft, setDraft] = useState<SeriesDraft | null>(null);
  const [editing, setEditing] = useState<AdminSeries | null>(null);
  const [deleting, setDeleting] = useState<AdminSeries | null>(null);
  const [ordering, setOrdering] = useState<AdminSeries | null>(null);

  const key = ["admin", "series", course.course_id];
  const list = useQuery({ queryKey: key, queryFn: () => adminApi.listSeries(course.course_id) });
  const reorder = useReorder<AdminSeries>({
    queryKey: key,
    idOf: (s) => s.series_id,
    save: (ids) => adminApi.reorderSeries(course.course_id, ids),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: key });
    // The course table shows each course's series count.
    void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  }

  const save = useMutation({
    mutationFn: (d: SeriesDraft) => {
      const body = {
        title: d.text.en.title.trim(),
        description: d.text.en.description,
        thumbnail_url: d.thumbnail_url || null,
        translations: translationsOf(d.text),
      };
      return editing ? adminApi.updateSeries(editing.series_id, body) : adminApi.createSeries(course.course_id, body);
    },
    onSuccess: () => {
      toast.success("시리즈를 저장했어요.");
      setDraft(null);
      setEditing(null);
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (s: AdminSeries) => adminApi.deleteSeries(s.series_id),
    onSuccess: () => {
      toast.success("시리즈를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  function openNew() {
    setEditing(null);
    setDraft({ ...EMPTY });
  }

  function openEdit(s: AdminSeries) {
    setEditing(s);
    setDraft({ text: languageDraft(s), thumbnail_url: s.thumbnail_url ?? "" });
  }

  const ids = (list.data?.items ?? []).map((s) => s.series_id);

  return (
    <section className="hgadm-card hgadm-series" aria-label={`${course.title}의 시리즈`}>
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">‘{course.title}’의 시리즈</div>
          <div className="hgadm-cell-sub">
            앱의 강의 탭에서 이 코스 아래 가로로 넘겨 보는 카드들이에요 — 앱에서도 이 순서(왼쪽부터)대로 보여요. ←
            / → 로 순서를 바꾸면 바로 저장돼요. 카드를 누르면 시리즈의 강의 목록이 열립니다.
          </div>
        </div>
        {canWrite && (
          <Button variant="primary" size="sm" onClick={openNew}>
            + 시리즈 추가
          </Button>
        )}
      </div>
      <div className="hgadm-card__body">
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <div className="hgadm-series__empty">
            아직 시리즈가 없어요. 강의는 시리즈 안에만 넣을 수 있으니, 시리즈를 먼저 만들어 주세요.
          </div>
        ) : (
          <ul className="hgadm-series__grid" role="list">
            {list.data.items.map((s, index) => (
              <li key={s.series_id} className="hgadm-series__card">
                <div className="hgadm-series__art">
                  {s.thumbnail_url ? (
                    <img src={s.thumbnail_url} alt="" />
                  ) : (
                    <span className="hgadm-muted">썸네일 없음</span>
                  )}
                  <span className="hgadm-series__order">
                    <OrderNumber position={index + 1} />
                  </span>
                </div>
                <div className="hgadm-series__info">
                  <div className="hgadm-title-row">
                    <span className="hgadm-cell-main">{s.title}</span>
                    <StandInBadge title={s.title} />
                  </div>
                  {koreanTitle(s) && <div className="hgadm-cell-sub">{koreanTitle(s)}</div>}
                  <Link className="hgadm-cell-sub" to={`/lectures?course_id=${course.course_id}&series_id=${s.series_id}`}>
                    강의 {s.lecture_count}개 보기
                  </Link>
                </div>
                <div className="hgadm-row hgadm-series__actions">
                  {canWrite && (
                    <MoveButtons
                      name={s.title}
                      index={index}
                      count={ids.length}
                      axis="horizontal"
                      disabled={reorder.saving}
                      onMove={(dir) => reorder.move(ids, s.series_id, dir)}
                    />
                  )}
                  {s.lecture_count > 1 && (
                    <Button size="sm" onClick={() => setOrdering(s)}>
                      강의 순서
                    </Button>
                  )}
                  {canWrite && (
                    <>
                      <Button size="sm" onClick={() => openEdit(s)}>
                        수정
                      </Button>
                      <Button size="sm" variant="danger-soft" onClick={() => setDeleting(s)}>
                        삭제
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editing ? "시리즈 수정" : "시리즈 추가"}
        size="lg"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft?.text.en.title.trim()}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            <LanguageFields
              noun="시리즈"
              titleMaxLength={120}
              value={draft.text}
              onChange={(text) => setDraft({ ...draft, text })}
            />
            <SeriesThumbnail value={draft.thumbnail_url} onChange={(url) => setDraft({ ...draft, thumbnail_url: url })} />
            {!editing && (
              <p className="hgadm-field__hint">새 시리즈는 이 코스의 맨 뒤에 놓여요. 순서는 카드의 ← / → 로 바꿔요.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={ordering !== null}
        title={ordering ? `‘${ordering.title}’ 강의 순서` : "강의 순서"}
        onClose={() => setOrdering(null)}
        footer={
          <Button variant="ghost" onClick={() => setOrdering(null)}>
            닫기
          </Button>
        }
      >
        {ordering && (
          <>
            <p className="hgadm-cell-sub hgadm-order-note">
              앱의 시리즈 강의 목록에 위에서부터 이 순서대로 보여요. ↑ / ↓ 로 바꾸면 바로 저장돼요.
            </p>
            <LessonOrder series={ordering} canWrite={canWrite} />
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="시리즈 삭제"
        message={
          deleting && deleting.lecture_count > 0
            ? `‘${deleting.title}’ 시리즈에는 강의가 ${deleting.lecture_count}개 있어 삭제할 수 없어요. 강의를 다른 시리즈로 옮기거나 삭제한 뒤 다시 시도해 주세요.`
            : `‘${deleting?.title ?? ""}’ 시리즈를 삭제할까요?`
        }
        danger
        confirmLabel="삭제"
        confirmDisabled={!!deleting && deleting.lecture_count > 0}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

/** The series' key art — shown on its card in the app (COU-001) and on top of its lesson list (COU-002). */
function SeriesThumbnail({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Field label="썸네일" hint="앱의 시리즈 카드와 강의 목록 상단에 쓰여요. 가로형 이미지(약 16:9), JPEG/PNG/WebP, 최대 5MB">
      <div className="hgadm-series__upload">
        {value && <img src={value} alt="썸네일 미리보기" className="hgadm-series__preview" />}
        <div className="hgadm-dropzone" onClick={() => fileRef.current?.click()}>
          {uploading ? "업로드 중…" : value ? "클릭해서 교체" : "클릭해서 이미지 업로드"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="썸네일 파일"
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
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange("")}>
            썸네일 빼기
          </Button>
        )}
      </div>
    </Field>
  );
}
