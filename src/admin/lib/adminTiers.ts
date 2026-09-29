import type { AdminTier } from "../api";

/**
 * The portal tiers a super-admin can assign, in descending order of power.
 *
 * Mirrors `ADMIN_ROLE_SCOPES` in `src/common/security/permissions.py`. The
 * server is the authority — it re-checks the caller's scope and rejects an
 * unknown tier — so this list exists only to label the choices. Shared by the
 * admin-accounts page and the promote action on a user's detail page so the
 * two never drift.
 */
export const ADMIN_TIERS: { value: AdminTier; label: string; desc: string }[] = [
  { value: "super_admin", label: "최고 관리자", desc: "모든 권한 + 관리자 계정 관리" },
  { value: "operator", label: "운영자", desc: "관리자 관리·연동 설정 변경을 제외한 모든 권한" },
  { value: "content_manager", label: "콘텐츠 관리자", desc: "콘텐츠 편집 + 사용자 조회" },
  { value: "support_agent", label: "고객지원", desc: "사용자 조회 + 운영 콘텐츠 + 커머스 조회" },
  { value: "content_publisher", label: "콘텐츠 게시 담당", desc: "콘텐츠 검수·게시·회수 + 학습 통계" },
  { value: "educator", label: "교육 검수자", desc: "콘텐츠 검수 + 학습자 학습 기록 조회" },
  { value: "analyst", label: "분석가", desc: "집계 학습 통계·내보내기 (개인 식별 기록 제외)" },
  { value: "viewer", label: "뷰어", desc: "전체 읽기 전용 (대화 원문·내보내기 제외)" },
];

export const ADMIN_TIER_LABEL: Record<string, string> = Object.fromEntries(
  ADMIN_TIERS.map((t) => [t.value, t.label]),
);

/** The safest tier to preselect: read-only until someone widens it on purpose. */
export const DEFAULT_GRANT_TIER: AdminTier = "viewer";

/** Member-account roles, as the directory and the detail page both label them. */
export const ROLE_LABELS: Record<string, string> = {
  member: "일반",
  premium: "프리미엄",
  tester: "테스터",
  admin: "관리자",
};
