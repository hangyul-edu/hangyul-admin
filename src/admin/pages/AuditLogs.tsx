import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../auth";
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
  Timestamp,
} from "../components/kit";
import type { Column } from "../components/kit";
import { AUDIT_OBJECT_TYPES, cliOperator, describeAuditAction, objectTypeLabel } from "../lib/auditActions";
import { personName, personNameWithEmail } from "../lib/adminIdentity";

/** Who performed a row, as the 수행자 filter names them. `cli` = run on the
 *  server's command line (no portal account acted). */
const ACTOR_TYPE_LABEL: Record<string, string> = { admin: "관리자", system: "시스템", cli: "서버 CLI" };

function actorTypeLabel(type: string): string {
  return ACTOR_TYPE_LABEL[type] ?? type;
}

/** The actor's name: the admin account, or for a CLI row whoever ran it on the server. */
function actorName(e: AuditLogEntry, withEmail: boolean): string {
  const operator = cliOperator(e);
  if (operator) return operator;
  const person = { name: e.actor_name, email: e.actor_email, user_id: e.actor_id };
  return withEmail ? personNameWithEmail(person) : personName(person);
}

export function AuditLogsPage() {
  const filters = useUrlFilters();
  const { can } = useAdminAuth();
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
      render: (e) => <Timestamp at={e.occurred_at} />,
      width: 150,
    },
    {
      key: "actor",
      header: "관리자",
      render: (e) => (
        <div>
          <div className="hgadm-cell-main">{actorName(e, false)}</div>
          <div className="hgadm-cell-sub">
            <Badge tone={e.actor_type === "admin" ? "brand" : "neutral"}>
              {actorTypeLabel(e.actor_type)}
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
      // What kind of thing was touched; which one is in the 작업 column's
      // context. The object's own id stays internal.
      render: (e) => objectTypeLabel(e.object_type),
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
          >
            <option value="">수행자: 전체</option>
            <option value="admin">관리자</option>
            <option value="system">시스템</option>
            <option value="cli">서버 CLI</option>
          </Select>
          <Select
            value={objectType}
            onChange={(e) => filters.patch({ object_type: e.target.value, page: null })}
          >
            <option value="">대상: 전체</option>
            {AUDIT_OBJECT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
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
          <div className="hgadm-text-md">
            <dl className="hgadm-dl">
              <dt>시각</dt>
              <dd><Timestamp at={detail.occurred_at} /></dd>
              <dt>수행자</dt>
              <dd>
                {actorName(detail, true)} ({actorTypeLabel(detail.actor_type)})
              </dd>
              <dt>행위</dt>
              <dd>
                {describeAuditAction(detail).label}
                <div className="hgadm-cell-sub hgadm-cell-mono">{detail.action}</div>
              </dd>
              <dt>대상</dt>
              <dd>
                {objectTypeLabel(detail.object_type)}
                {describeAuditAction(detail).context && (
                  <div className="hgadm-cell-sub">{describeAuditAction(detail).context}</div>
                )}
              </dd>
              <dt>대상 사용자</dt>
              <dd>
                {detail.user_id ? (
                  can("users:read") ? (
                    <Link to={`/users/${detail.user_id}`}>회원 보기</Link>
                  ) : (
                    "있음"
                  )
                ) : (
                  "—"
                )}
              </dd>
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
