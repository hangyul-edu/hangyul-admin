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
    // The name is the label; nickname and email sit under it on one line.
    expect(await screen.findByText("학습자")).toBeInTheDocument();
    expect(
      screen.getByText("hangyul-fan · learner@talkhangyul.co.kr"),
    ).toBeInTheDocument();
    expect(screen.getByText("+821••••1234")).toBeInTheDocument();
    // Status badges render the Korean label, not the raw backend enum.
    expect(screen.getByText("무료 체험")).toBeInTheDocument();
    expect(screen.queryByText("trial")).not.toBeInTheDocument();
    expect(screen.getByText(/1건 중 1–1/)).toBeInTheDocument();
  });

  it("falls back to the email when a user has no name", async () => {
    listUsers.mockResolvedValue({
      items: [
        {
          user_id: "usr_2",
          email: "nameless@talkhangyul.co.kr",
          name: "",
          nickname: null,
          phone_masked: null,
          role: "member",
          status: "active",
          subscription_status: null,
          plan_id: null,
          created_at: "2026-07-01T00:00:00Z",
          deactivated_at: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    renderPage();

    // The row still identifies somebody — never a blank or a placeholder.
    await screen.findByText("nameless@talkhangyul.co.kr");
    const label = document.querySelector(".hgadm-cell-main");
    expect(label?.textContent).toBe("nameless@talkhangyul.co.kr");
    expect(screen.queryByText("(닉네임 없음)")).not.toBeInTheDocument();
    // ...and the email is not repeated underneath itself.
    expect(screen.getAllByText("nameless@talkhangyul.co.kr")).toHaveLength(1);
  });

  it("sorts the user column by name", async () => {
    listUsers.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
    renderPage();
    await screen.findByText(/사용자/);
    // The column header sorts on what it displays, not on the old email label.
    expect(listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "created_at" }),
    );
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
