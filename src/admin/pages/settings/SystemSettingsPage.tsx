import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { adminApi } from "../../api";
import { useAdminAuth } from "../../auth";
import { errorMessage } from "../../../lib/http";
import { ConfirmDialog, ErrorState, LoadingState } from "../../components/kit";
import { IntegrationDetail } from "./IntegrationDetail";
import { IntegrationList } from "./IntegrationList";
import { QUERY_KEY } from "./model";
import { Overview } from "./Overview";

/**
 * Which item is open (in the URL, so it can be linked), and a guard on leaving
 * it with unsaved edits: switching items asks first, and so does closing the tab.
 */
function useSelectedItemWithGuard() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("item");
  const dirtyRef = useRef(false);
  // undefined: no question pending; otherwise the item (or null = overview) asked for.
  const [pendingNav, setPendingNav] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const go = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("item", id);
    else next.delete("item");
    dirtyRef.current = false;
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return {
    selectedId,
    pendingNav,
    request: (id: string | null) => {
      if (id === selectedId) return;
      if (dirtyRef.current) setPendingNav(id);
      else go(id);
    },
    setDirty: (dirty: boolean) => {
      dirtyRef.current = dirty;
    },
    cancel: () => setPendingNav(undefined),
    confirm: () => {
      const target = pendingNav;
      setPendingNav(undefined);
      go(target ?? null);
    },
  };
}

export function SystemSettingsPage() {
  const { can } = useAdminAuth();
  const canEdit = can("settings:write");
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: adminApi.systemSettings });
  const nav = useSelectedItemWithGuard();

  const all = useMemo(() => query.data?.groups.flatMap((g) => g.integrations) ?? [], [query.data]);
  const selected = all.find((i) => i.id === nav.selectedId) ?? null;

  return (
    <div className="hgadm-cfg">
      <div className="hgadm-page-head">
        <div>
          <h1>연동·환경 설정</h1>
          <div className="hgadm-page-head__desc">
            외부 서비스의 키를 입력하고, 켜고 끄고, 연결을 확인합니다. 대부분 저장하는 즉시 적용됩니다.
          </div>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState label="설정을 불러오는 중…" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.restart_pending.length > 0 && (
            <div className="hgadm-cfg__restart" role="status">
              <AlertTriangle size={18} strokeWidth={2} aria-hidden />
              <div>
                <strong>서버를 다시 시작해야 적용되는 변경이 있습니다</strong>
                <span>
                  {query.data.restart_pending.map((p) => p.label).join(", ")} — 저장은 되었고, 재시작하면 적용됩니다.
                </span>
              </div>
            </div>
          )}
          <div className={`hgadm-cfg__layout ${selected ? "has-selection" : ""}`}>
            <IntegrationList data={query.data} selectedId={selected?.id ?? null} onSelect={nav.request} />
            <div className="hgadm-cfg__detail">
              {selected ? (
                <IntegrationDetail
                  key={selected.id}
                  integration={selected}
                  canEdit={canEdit}
                  onBack={() => nav.request(null)}
                  onDirtyChange={nav.setDirty}
                />
              ) : (
                <Overview data={query.data} canEdit={canEdit} onSelect={nav.request} />
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={nav.pendingNav !== undefined}
        title="저장하지 않은 변경이 있습니다"
        message="이동하면 입력한 내용이 사라집니다. 저장하려면 '취소'를 누른 뒤 '저장'을 누르세요."
        confirmLabel="변경 버리고 이동"
        danger
        onCancel={nav.cancel}
        onConfirm={nav.confirm}
      />
    </div>
  );
}
