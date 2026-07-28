import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "./auth";
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
import { BannersPage } from "./pages/Banners";
import { NoticesPage } from "./pages/Notices";
import { FaqsPage } from "./pages/Faqs";
import { NotificationsPage } from "./pages/Notifications";
import { CoursesPage } from "./pages/Courses";
import { LecturesPage } from "./pages/Lectures";
import { SentencesPage } from "./pages/Sentences";
import { QuizzesPage } from "./pages/Quizzes";
import { AiContentPage } from "./pages/AiContent";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  if (status === "booting") return <LoadingState label="관리자 세션 확인 중…" />;
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
        icon="🔒"
        title="접근 권한이 없습니다"
        desc={`이 화면을 보려면 '${scope}' 권한이 필요합니다. 필요한 경우 최고 관리자에게 요청하세요.`}
      />
    );
  }
  return <>{children}</>;
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
        <Route path="/audit-logs" element={<RequireScope scope="audit:read"><AuditLogsPage /></RequireScope>} />
        <Route path="/admins" element={<RequireScope scope="admins:manage"><AdminsPage /></RequireScope>} />
        <Route path="*" element={<EmptyState icon="🧭" title="페이지를 찾을 수 없습니다" />} />
      </Route>
    </>,
  ),
  { basename: "/admin" },
);

export function AdminApp() {
  return <RouterProvider router={router} />;
}
