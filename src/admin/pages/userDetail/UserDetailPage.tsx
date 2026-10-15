import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, ErrorState, LoadingState } from "../../components/kit";
import { accountStatusLabel, accountStatusTone } from "../../lib/accountStatus";
import { personName } from "../../lib/adminIdentity";
import { ADMIN_TIER_LABEL, ROLE_LABELS } from "../../lib/adminTiers";
import { backNavigationState, useBackTarget } from "../../lib/navigation";
import { UserActions } from "./actions";
import { BillingTab, LearningTab, MiscTab, OnboardingTab, OverviewTab } from "./tabs";
import { useUserDetail } from "./useUserDetail";

const TABS = [
  ["overview", "개요"],
  ["billing", "구독·결제"],
  ["learning", "학습·게임"],
  ["onboarding", "온보딩"],
  ["misc", "쿠폰·기기"],
] as const;
type Tab = (typeof TABS)[number][0];

/** One member: who they are, their state, and what an admin may change. */
export function UserDetailPage() {
  const { userId = "" } = useParams();
  const { can, me } = useAdminAuth();
  const back = useBackTarget({ to: "/users", label: "사용자 목록" });
  const [tab, setTab] = useState<Tab>("overview");
  const query = useUserDetail(userId);

  if (query.isPending) return <LoadingState label="사용자 정보를 불러오는 중…" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;

  const user = query.data;
  const canWrite = can("users:write");
  const isSelf = me?.user_id === user.user_id;
  const isAdminAccount = user.role === "admin";

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row hgadm-mb-4">
            {/* Back to wherever this page was opened from — the directory by
                default, but the league that linked here if that is where the
                admin came from. */}
            <Link to={back.to} state={backNavigationState(back)} className="hgadm-muted hgadm-row hgadm-text-sm hgadm-row--tight">
              <ArrowLeft size={14} strokeWidth={2} />
              {back.label}
            </Link>
          </div>
          <h1 className="hgadm-row">
            {personName(user)}
            <Badge tone={accountStatusTone(user.status)} dot>
              {accountStatusLabel(user.status)}
            </Badge>
            <Badge tone={isAdminAccount ? "brand" : "neutral"}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
            {/* The tier decides what an admin can actually do, so it belongs
                next to the role rather than only on the admin-accounts page. */}
            {isAdminAccount && (
              <Badge tone="brand">{ADMIN_TIER_LABEL[user.admin_role ?? ""] ?? user.admin_role ?? "최고 관리자"}</Badge>
            )}
          </h1>
          {/* Nickname and email identify the account to a person; the user_id
              is a developer handle and stays in the URL, which is where support
              copies one from. */}
          <div className="hgadm-page-head__desc">
            {user.nickname ? `${user.nickname} · ` : ""}
            {user.email}
          </div>
        </div>
        <UserActions user={user} canWrite={canWrite} canManageAdmins={can("admins:manage")} isSelf={isSelf} />
      </div>

      <div className="hgadm-tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`hgadm-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab user={user} back={back} />}
      {tab === "onboarding" && <OnboardingTab user={user} />}
      {tab === "billing" && <BillingTab user={user} />}
      {tab === "learning" && <LearningTab user={user} />}
      {tab === "misc" && <MiscTab user={user} />}

      {canWrite && (isSelf || user.status === "deactivated") && (
        <p className="hgadm-muted hgadm-mt-16 hgadm-text-xs">
          {isSelf
            ? "본인 계정의 역할·상태는 이 화면에서 변경할 수 없습니다."
            : "사용자가 직접 탈퇴한 계정은 관리자가 되살릴 수 없습니다."}
        </p>
      )}
    </div>
  );
}
