import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { UsersPage } from "./Users";
import { adminApi } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listUsers: vi.fn(),
      createTester: vi.fn(),
    },
  };
});

vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: {
      user_id: "usr_admin",
      email: "admin@talkhangyul.co.kr",
      name: "관리자",
      nickname: "admin",
      admin_role: "super_admin",
      scopes: ["users:read", "users:write"],
    },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => ["users:read", "users:write"].includes(scope),
  }),
}));

const listUsers = vi.mocked(adminApi.listUsers);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/users"]}>
          <UsersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    listUsers.mockReset();
  });

  it("renders users from the API with masked phone and status badges", async () => {
    listUsers.mockResolvedValue({
      items: [
        {
          user_id: "usr_1",
          email: "learner@talkhangyul.co.kr",
          name: "학습자",
          nickname: "hangyul-fan",
          phone_masked: "+821••••1234",
          role: "member",
          status: "active",
          subscription_status: "trial",
          plan_id: "plan_monthly",
          created_at: "2026-07-01T00:00:00Z",
          deactivated_at: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    renderPage();
    expect(await screen.findByText("hangyul-fan")).toBeInTheDocument();
    expect(screen.getByText("learner@talkhangyul.co.kr")).toBeInTheDocument();
    expect(screen.getByText("+821••••1234")).toBeInTheDocument();
    // Status badges render the Korean label, not the raw backend enum.
    expect(screen.getByText("무료 체험")).toBeInTheDocument();
    expect(screen.queryByText("trial")).not.toBeInTheDocument();
    expect(screen.getByText(/1건 중 1–1/)).toBeInTheDocument();
  });

  it("shows the empty state when no users match", async () => {
    listUsers.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
    renderPage();
    expect(
      await screen.findByText("조건에 맞는 사용자가 없습니다."),
    ).toBeInTheDocument();
  });

  it("shows an error state with retry when the API fails", async () => {
    listUsers.mockRejectedValue(new Error("서버 오류"));
    renderPage();
    expect(await screen.findByText("문제가 발생했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    await waitFor(() => expect(listUsers).toHaveBeenCalled());
  });
});
