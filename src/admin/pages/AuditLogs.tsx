import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type { AuditLogEntry } from "../api";
import { errorMessage } from "../../lib/http";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
} from "../components/kit";
import {
  formatDateTime,
} from "../lib/format";
import type { Column } from "../components/kit";
import { describeAuditAction } from "../lib/auditActions";
import { personName, personNameWithEmail } from "../lib/adminIdentity";

export function AuditLogsPage() {
  const filters = useUrlFilters();
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const actorType = filters.value("actor_type");
  const objectType = filters.value("object_type");
  const action = filters.value("action");
  const page = filters.number("page", 1);

  const query = useQuery({
    queryKey: ["admin", "audit", { actorType, objectType, action, page }],
    queryFn: () =>
      adminApi.listAuditLogs({
        actor_type: actorType || undefined,
        object_type: objectType || undefined,
        action: action || undefined,
        page,
        page_size: 25,
      }),
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "when",
      header: "일시",
      render: (e) => formatDateTime(e.occurred_at),
      width: 150,
    },
    {
      key: "actor",
      header: "관리자",
      render: (e) => (
        <div>
          <div className="hgadm-cell-main">
            {personName({ name: e.actor_name, email: e.actor_email, user_id: e.actor_id })}
          </div>
          <div className="hgadm-cell-sub">
            <Badge tone={e.actor_type === "admin" ? "brand" : "neutral"}>
              {e.actor_type}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: "작업",
      render: (e) => {
        const described = describeAuditAction(e);
        return (
          <div>
            <div className="hgadm-cell-main">{described.label}</div>
            {described.context && (
              <div className="hgadm-cell-sub">{described.context}</div>
            )}
            {/* The endpoint stays on screen, demoted: it is what you quote in a
                bug report, and the only label an unmapped route can offer. */}
            {described.known && (
              <div className="hgadm-cell-sub hgadm-cell-mono">{described.raw}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "object",
      header: "대상",
      render: (e) => (
        <div>
          <div>{e.object_type}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{e.object_id}</div>
        </div>
      ),
    },
    {
      key: "ip",
      header: "IP",
      render: (e) => (
        <span className="hgadm-cell-mono hgadm-ip">{e.ip_address ?? "—"}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>관리자 활동 내역</h1>
          <div className="hgadm-page-head__desc">
            누가, 언제, 무엇을 변경했는지의 전체 기록입니다. 행을 클릭하면 요청 본문
            (민감 필드 마스킹)과 변경 전후 상태를 볼 수 있습니다.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={action}
            placeholder="작업 검색 (예: PATCH /admin/users)"
            onSearch={(next) => filters.patch({ action: next, page: null })}
          />
          <Select
            value={actorType}
            onChange={(e) => filters.patch({ actor_type: e.target.value, page: null })}
            style={{ width: 150 }}
          >
            <option value="">수행자: 전체</option>
            <option value="admin">관리자</option>
            <option value="system">시스템</option>
          </Select>
          <Select
            value={objectType}
            onChange={(e) => filters.patch({ object_type: e.target.value, page: null })}
            style={{ width: 170 }}
          >
            <option value="">대상: 전체</option>
            {["user", "admin", "banners", "coupons", "quizzes", "lectures", "courses", "sentences", "support", "notifications", "subscriptions", "generated_content", "media", "subscription", "invoice", "payment"].map(
              (t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ),
            )}
          </Select>
        </div>

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(e) => String(e.id)}
              onRowClick={setDetail}
              empty="활동 내역이 없습니다."
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

      <Modal
        open={detail !== null}
        title={`활동 내역 #${detail?.id ?? ""}`}
        size="lg"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div style={{ fontSize: 13.5 }}>
            <dl className="hgadm-dl">
              <dt>시각</dt>
              <dd>{formatDateTime(detail.occurred_at)}</dd>
              <dt>수행자</dt>
              <dd>
                {personNameWithEmail({
                  name: detail.actor_name,
                  email: detail.actor_email,
                  user_id: detail.actor_id,
                })}{" "}
                ({detail.actor_type})
              </dd>
              <dt>행위</dt>
              <dd>
                {describeAuditAction(detail).label}
                <div className="hgadm-cell-sub hgadm-cell-mono">{detail.action}</div>
              </dd>
              <dt>대상</dt>
              <dd className="hgadm-cell-mono">
                {detail.object_type} / {detail.object_id}
              </dd>
              <dt>대상 사용자</dt>
              <dd className="hgadm-cell-mono">{detail.user_id ?? "—"}</dd>
              <dt>요청 ID</dt>
              <dd className="hgadm-cell-mono">{detail.request_id ?? "—"}</dd>
              {/* The row also stores a user agent, but the API does not expose
                  it — the label said "IP / UA" while only ever showing the IP. */}
              <dt>IP</dt>
              <dd className="hgadm-cell-mono hgadm-ip">{detail.ip_address ?? "—"}</dd>
            </dl>
            {detail.before && (
              <>
                <hr className="hgadm-divider" />
                <div className="hgadm-field__label">변경 전</div>
                <pre className="hgadm-json">{JSON.stringify(detail.before, null, 2)}</pre>
              </>
            )}
            {detail.after && (
              <>
                <hr className="hgadm-divider" />
                <div className="hgadm-field__label">변경 후 / 요청 본문</div>
                <pre className="hgadm-json">{JSON.stringify(detail.after, null, 2)}</pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
