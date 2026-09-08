import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { GeneratedDetail, GeneratedSummary } from "../api";
import { errorMessage } from "../../lib/http";
import { CONVERSATION_LEVELS, TOPIK_GRADES } from "../../lib/levels";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dl,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
  Textarea,
  formatDateTime,
  statusLabel,
  statusTone,
} from "../components/kit";
import type { Column } from "../components/kit";

const KIND_LABEL: Record<string, string> = {
  sentence: "문장",
  question: "문제",
  quiz: "문제",
};

export function AiContentPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [params, setParams] = useSearchParams();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState<GeneratedSummary | GeneratedDetail | null>(null);

  const q = params.get("q") ?? "";
  const reviewStatus = params.get("review_status") ?? "pending";
  const kind = params.get("content_kind") ?? "";
  const level = params.get("level") ?? "";
  const page = Number(params.get("page") ?? "1");

  // The queue mixes generated sentences (회화 1~10) and questions (TOPIK 1~6),
  // so the level options follow whichever kind is filtered; with no kind
  // selected they span both scales.
  const levelOptions =
    kind === "question" ? TOPIK_GRADES : CONVERSATION_LEVELS;
  const levelLabel = kind === "question" ? "급수" : "레벨";

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const query = useQuery({
    queryKey: ["admin", "generated", { q, reviewStatus, kind, level, page }],
    queryFn: () =>
      adminApi.listGenerated({
        q: q || undefined,
        // "all" is a sentinel for "no status filter"; sending it would filter
        // to a non-existent status. Everything else is a real status value.
        review_status: reviewStatus === "all" ? undefined : reviewStatus,
        content_kind: kind || undefined,
        level: level || undefined,
        page,
        page_size: 25,
      }),
  });

  const detail = useQuery({
    queryKey: ["admin", "generated-detail", detailId],
    queryFn: () => adminApi.getGenerated(detailId!),
    enabled: detailId !== null,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "generated"] });
    void qc.invalidateQueries({ queryKey: ["admin", "generated-detail"] });
    void qc.invalidateQueries({ queryKey: ["admin", "metrics", "overview"] });
  }

  const review = useMutation({
    mutationFn: ({
      contentId,
      status,
    }: {
      contentId: string;
      status: "approved" | "rejected" | "pending";
    }) => adminApi.reviewGenerated(contentId, { review_status: status, note: note || undefined }),
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "approved"
          ? "승인했어요."
          : variables.status === "rejected"
            ? "반려했어요."
            : "검수 대기로 되돌렸어요.",
      );
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (contentId: string) => adminApi.deleteGenerated(contentId),
    onSuccess: () => {
      toast.success("항목을 삭제했어요.");
      setDeleting(null);
      setDetailId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<GeneratedSummary>[] = [
    {
      key: "preview",
      header: "내용 미리보기",
      render: (g) => (
        <div style={{ maxWidth: 420 }}>
          <div
            className="hgadm-cell-main"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {g.preview}
          </div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{g.content_id}</div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "유형",
      render: (g) => (
        <div>
          <Badge tone="info">{KIND_LABEL[g.content_kind] ?? g.content_kind}</Badge>
          {g.topik_question_type && (
            <div className="hgadm-cell-sub">{g.topik_question_type}</div>
          )}
        </div>
      ),
    },
    { key: "level", header: "레벨", numeric: true, render: (g) => g.level },
    {
      key: "model",
      header: "모델",
      render: (g) => <span className="hgadm-cell-mono">{g.model}</span>,
    },
    {
      key: "status",
      header: "검수 상태",
      render: (g) => <Badge tone={statusTone(g.review_status)}>{statusLabel(g.review_status)}</Badge>,
    },
    { key: "created", header: "생성일", render: (g) => formatDateTime(g.created_at) },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>AI 생성 콘텐츠 검수</h1>
          <div className="hgadm-page-head__desc">
            AI가 생성한 문장·문제 라이브러리입니다. 원본 데이터와 생성 조건을
            확인하고 승인/반려하거나, 품질이 낮은 항목은 재사용 목록에서 제외하세요.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="생성 내용·주제·콘텐츠 ID 검색"
            onSearch={(next) => patchParams({ q: next, page: null })}
          />
          <Select
            value={reviewStatus}
            onChange={(e) => patchParams({ review_status: e.target.value, page: null })}
            style={{ width: 160 }}
          >
            <option value="pending">검수 대기</option>
            <option value="approved">승인됨</option>
            <option value="rejected">반려됨</option>
            <option value="all">전체</option>
          </Select>
          <Select
            value={kind}
            // Clear the level too: the two kinds run different scales, so a
            // level picked for one can be out of range for the other.
            onChange={(e) =>
              patchParams({ content_kind: e.target.value, level: null, page: null })
            }
            style={{ width: 140 }}
          >
            <option value="">종류: 전체</option>
            <option value="sentence">문장</option>
            <option value="question">문제</option>
          </Select>
          <Select
            value={level}
            onChange={(e) => patchParams({ level: e.target.value, page: null })}
            style={{ width: 120 }}
          >
            <option value="">{levelLabel}: 전체</option>
            {levelOptions.map((l) => (
              <option key={l} value={l}>
                {levelLabel} {l}
              </option>
            ))}
          </Select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(g) => g.content_id}
              onRowClick={(g) => setDetailId(g.content_id)}
              empty={
                reviewStatus === "pending"
                  ? "검수 대기 중인 항목이 없습니다."
                  : "조건에 맞는 항목이 없습니다."
              }
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => patchParams({ page: String(next) })}
            />
          </>
        )}
      </div>

      <Modal
        open={detailId !== null}
        title="생성 콘텐츠 상세"
        size="xl"
        onClose={() => setDetailId(null)}
        footer={
          canWrite && detail.data ? (
            <>
              <Button
                variant="danger-soft"
                onClick={() => detail.data && setDeleting(detail.data)}
              >
                삭제
              </Button>
              <span style={{ flex: 1 }} />
              {detail.data.review_status !== "rejected" && (
                <Button
                  variant="danger"
                  loading={review.isPending}
                  onClick={() =>
                    review.mutate({ contentId: detail.data!.content_id, status: "rejected" })
                  }
                >
                  반려
                </Button>
              )}
              {detail.data.review_status !== "approved" && (
                <Button
                  variant="primary"
                  loading={review.isPending}
                  onClick={() =>
                    review.mutate({ contentId: detail.data!.content_id, status: "approved" })
                  }
                >
                  승인
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detail.isPending ? (
          <LoadingState />
        ) : detail.isError ? (
          <ErrorState message={errorMessage(detail.error)} />
        ) : detail.data ? (
          <div style={{ fontSize: 13.5 }}>
            <div className="hgadm-row hgadm-row--wrap" style={{ marginBottom: 12 }}>
              <Badge tone={statusTone(detail.data.review_status)}>
                {detail.data.review_status}
              </Badge>
              <Badge tone="info">
                {KIND_LABEL[detail.data.content_kind] ?? detail.data.content_kind}
              </Badge>
              <Badge tone="neutral">레벨 {detail.data.level}</Badge>
              <span className="hgadm-cell-mono hgadm-muted">{detail.data.model}</span>
            </div>
            <Dl
              items={[
                ["생성일", formatDateTime(detail.data.created_at)],
                ["생성 경로", detail.data.source],
                ["주제", detail.data.topic],
                ["TOPIK 유형", detail.data.topik_question_type],
                ["언어", detail.data.language],
                ["요청 사용자", detail.data.created_by_user_id],
                [
                  "검수",
                  detail.data.reviewed_by
                    ? `${detail.data.reviewed_by} · ${formatDateTime(detail.data.reviewed_at)}`
                    : "아직 검수되지 않음",
                ],
                ["검수 메모", detail.data.review_note],
              ]}
            />
            <hr className="hgadm-divider" />
            <div className="hgadm-field__label">생성 결과 원본</div>
            <pre className="hgadm-json">{JSON.stringify(detail.data.payload, null, 2)}</pre>
            {canWrite && (
              <Field label="검수 메모" hint="승인/반려와 함께 저장됩니다.">
                <Textarea
                  rows={2}
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="생성 콘텐츠 삭제"
        message="이 항목을 라이브러리에서 영구 삭제할까요? 재사용 목록에서도 빠지며 되돌릴 수 없습니다."
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.content_id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
