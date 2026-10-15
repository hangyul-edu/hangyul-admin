import { useState } from "react";
import type { GeneratedDetail, GeneratedSummary } from "../../api";
import { errorMessage } from "../../../lib/http";
import { CONVERSATION_LEVELS, TOPIK_GRADES } from "../../../lib/levels";
import { useAdminAuth } from "../../auth";
import {
  Badge,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  statusLabel,
  statusTone,
  Timestamp,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { topikTypeLabel } from "../../lib/topik";
import { useUrlFilters } from "../../lib/urlFilters";
import { GeneratedDetailModal } from "./GeneratedDetailModal";
import { KIND_LABEL, QUESTION_KIND, SENTENCE_KIND, useDeleteGenerated, useGeneratedList } from "./useGenerated";

const COLUMNS: Column<GeneratedSummary>[] = [
  {
    key: "preview",
    header: "내용 미리보기",
    render: (g) => (
      <div className="hgadm-cell-text">
        <div className="hgadm-cell-main hgadm-ellipsis">{g.preview}</div>
      </div>
    ),
  },
  {
    key: "kind",
    header: "유형",
    render: (g) => (
      <div>
        <Badge tone="info">{KIND_LABEL[g.content_kind] ?? g.content_kind}</Badge>
        {g.topik_question_type && <div className="hgadm-cell-sub">{topikTypeLabel(g.topik_question_type)}</div>}
      </div>
    ),
  },
  { key: "level", header: "레벨", numeric: true, render: (g) => g.level },
  { key: "model", header: "모델", render: (g) => <span className="hgadm-cell-mono">{g.model}</span> },
  {
    key: "status",
    header: "검수 상태",
    render: (g) => <Badge tone={statusTone(g.review_status)}>{statusLabel(g.review_status)}</Badge>,
  },
  { key: "created", header: "생성일", render: (g) => <Timestamp at={g.created_at} /> },
];

/** AI 생성 콘텐츠 검수: the generated library, reviewed item by item. */
export function AiContentPage() {
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const filters = useUrlFilters();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GeneratedSummary | GeneratedDetail | null>(null);

  const q = filters.value("q");
  const reviewStatus = filters.value("review_status", "pending");
  const kind = filters.value("content_kind");
  const level = filters.value("level");
  const query = useGeneratedList({ q, reviewStatus, kind, level, page: filters.number("page", 1) });
  const remove = useDeleteGenerated(() => {
    setDeleting(null);
    setDetailId(null);
  });

  // The queue mixes generated sentences (회화 1~10) and questions (TOPIK 1~6),
  // so the level options follow whichever kind is filtered; with no kind
  // selected they span both scales.
  const levelOptions = kind === QUESTION_KIND ? TOPIK_GRADES : CONVERSATION_LEVELS;
  const levelLabel = kind === QUESTION_KIND ? "급수" : "레벨";

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>AI 생성 콘텐츠 검수</h1>
          <div className="hgadm-page-head__desc">
            AI가 생성한 문장·문제 라이브러리입니다. 원본 데이터와 생성 조건을 확인하고 승인/반려하거나, 품질이 낮은 항목은 재사용
            목록에서 제외하세요.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="생성 내용·주제 검색" onSearch={(next) => filters.patch({ q: next, page: null })} />
          <Select value={reviewStatus} onChange={(e) => filters.patch({ review_status: e.target.value, page: null })}>
            <option value="pending">검수 대기</option>
            <option value="approved">승인됨</option>
            <option value="rejected">반려됨</option>
            <option value="all">전체</option>
          </Select>
          <Select
            value={kind}
            // Clear the level too: the two kinds run different scales, so a
            // level picked for one can be out of range for the other.
            onChange={(e) => filters.patch({ content_kind: e.target.value, level: null, page: null })}
          >
            <option value="">종류: 전체</option>
            <option value={SENTENCE_KIND}>문장</option>
            <option value={QUESTION_KIND}>문제</option>
          </Select>
          <Select value={level} onChange={(e) => filters.patch({ level: e.target.value, page: null })}>
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
              columns={COLUMNS}
              rows={query.data.items}
              rowKey={(g) => g.content_id}
              onRowClick={(g) => setDetailId(g.content_id)}
              empty={reviewStatus === "pending" ? "검수 대기 중인 항목이 없습니다." : "조건에 맞는 항목이 없습니다."}
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      <GeneratedDetailModal contentId={detailId} canWrite={canWrite} onClose={() => setDetailId(null)} onDelete={setDeleting} />

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
