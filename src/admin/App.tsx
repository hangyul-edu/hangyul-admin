import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";
import { Compass, Lock } from "lucide-react";
import { useAdminAuth } from "./auth";
import { AccessDenied } from "./components/AccessDenied";
import { AdminLayout } from "./components/Layout";
import { LoadingState, EmptyState } from "./components/kit";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { UsersPage } from "./pages/Users";
import { UserDetailPage } from "./pages/UserDetail";
import { AdminsPage } from "./pages/Admins";
import { AuditLogsPage } from "./pages/AuditLogs";
import { PlansPage } from "./pages/Plans";
import { CouponsPage } from "./pages/Coupons";
import { SubscriptionsPage } from "./pages/Subscriptions";
import { PaymentsPage } from "./pages/Payments";
// NOTE: the banner-management page lives in HomeCards.tsx — in dev mode every
// source file is a browser-visible URL, and a path containing "banner" gets
// blocked by common adblocker lists, which kills the whole module graph.
import { BannersPage } from "./pages/HomeCards";
import { NoticesPage } from "./pages/Notices";
import { FaqsPage } from "./pages/Faqs";
import { NotificationsPage } from "./pages/Notifications";
import { NotificationSettingsPage } from "./pages/NotificationSettings";
import { CoursesPage } from "./pages/Courses";
import { LecturesPage } from "./pages/Lectures";
import { SentencesPage } from "./pages/Sentences";
import { QuizzesPage } from "./pages/Quizzes";
import { AiContentPage } from "./pages/AiContent";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  if (status === "booting") return <LoadingState label="관리자 세션 확인 중…" />;
  if (status === "denied") return <AccessDenied />;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Scope gate for a whole page; shows the permission-denied state instead. */
export function RequireScope({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const { can } = useAdminAuth();
  if (!can(scope)) {
    return (
      <EmptyState
        icon={<Lock size={28} strokeWidth={1.75} />}
        title="접근 권한이 없습니다"
        desc={`이 화면을 보려면 '${scope}' 권한이 필요합니다. 필요한 경우 최고 관리자에게 요청하세요.`}
      />
    );
  }
  return <>{children}</>;
}

// The router uses basename "/admin", but on hosts without a /admin →
// /admin.html rewrite the page is reached AS /admin.html (directly, or via
// the member app's redirect carrying the original deep link in ?path=).
// Normalize the address bar to /admin/... before the router mounts.
if (window.location.pathname.startsWith("/admin.html")) {
  const params = new URLSearchParams(window.location.search);
  const deepLink = params.get("path") ?? "";
  window.history.replaceState(null, "", `/admin${deepLink}` || "/admin");
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route path="/" element={<RequireScope scope="users:read"><DashboardPage /></RequireScope>} />
        <Route path="/users" element={<RequireScope scope="users:read"><UsersPage /></RequireScope>} />
        <Route path="/users/:userId" element={<RequireScope scope="users:read"><UserDetailPage /></RequireScope>} />
        <Route path="/courses" element={<RequireScope scope="content:read"><CoursesPage /></RequireScope>} />
        <Route path="/lectures" element={<RequireScope scope="content:read"><LecturesPage /></RequireScope>} />
        <Route path="/sentences" element={<RequireScope scope="content:read"><SentencesPage /></RequireScope>} />
        <Route path="/quizzes" element={<RequireScope scope="content:read"><QuizzesPage /></RequireScope>} />
        <Route path="/ai-content" element={<RequireScope scope="content:read"><AiContentPage /></RequireScope>} />
        <Route path="/plans" element={<RequireScope scope="commerce:read"><PlansPage /></RequireScope>} />
        <Route path="/coupons" element={<RequireScope scope="commerce:read"><CouponsPage /></RequireScope>} />
        <Route path="/subscriptions" element={<RequireScope scope="commerce:read"><SubscriptionsPage /></RequireScope>} />
        <Route path="/payments" element={<RequireScope scope="commerce:read"><PaymentsPage /></RequireScope>} />
        <Route path="/banners" element={<RequireScope scope="ops:read"><BannersPage /></RequireScope>} />
        <Route path="/notices" element={<RequireScope scope="ops:read"><NoticesPage /></RequireScope>} />
        <Route path="/faqs" element={<RequireScope scope="ops:read"><FaqsPage /></RequireScope>} />
        <Route path="/notifications" element={<RequireScope scope="ops:write"><NotificationsPage /></RequireScope>} />
        {/* ops:read, unlike the send page above: the reminder time is worth
            seeing for anyone who can read ops, and the form itself is what
            gates on ops:write. */}
        <Route path="/notification-settings" element={<RequireScope scope="ops:read"><NotificationSettingsPage /></RequireScope>} />
        <Route path="/audit-logs" element={<RequireScope scope="audit:read"><AuditLogsPage /></RequireScope>} />
        <Route path="/admins" element={<RequireScope scope="admins:manage"><AdminsPage /></RequireScope>} />
        <Route path="*" element={<EmptyState icon={<Compass size={28} strokeWidth={1.75} />} title="페이지를 찾을 수 없습니다" />} />
      </Route>
    </>,
  ),
  { basename: "/admin" },
);

export function AdminApp() {
  return <RouterProvider router={router} />;
}
