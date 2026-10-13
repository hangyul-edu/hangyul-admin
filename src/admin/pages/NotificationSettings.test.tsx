import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { NotificationSettingsPage, validateReminderTime } from "./NotificationSettings";
import { adminApi } from "../api";
import { ApiError } from "../../lib/http";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getDailyReminder: vi.fn(),
      updateDailyReminder: vi.fn(),
    },
  };
});

let scopes: string[] = ["ops:read", "ops:write"];

vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: {
      user_id: "usr_admin",
      email: "admin@talkhangyul.co.kr",
      name: "관리자",
      nickname: "admin",
      admin_role: "operator",
      scopes,
    },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

const getDailyReminder = vi.mocked(adminApi.getDailyReminder);
const updateDailyReminder = vi.mocked(adminApi.updateDailyReminder);

const DEFAULTS = {
  daily_reminder_time: "19:00",
  updated_at: null,
  updated_by_admin_id: null,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/notification-settings"]}>
          <NotificationSettingsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const timeInput = () => screen.getByLabelText("발송 시각") as HTMLInputElement;

describe("validateReminderTime", () => {
  it.each(["00:00", "09:05", "19:00", "23:59"])("accepts %s", (value) => {
    expect(validateReminderTime(value)).toBeNull();
  });

  // The API rejects these too — the client must not accept what the server 422s.
  it.each(["25:00", "19:60", "7pm", "19", "1900", "19:00:00", "-1:00", ""])(
    "rejects %s",
    (value) => {
      expect(validateReminderTime(value)).not.toBeNull();
    },
  );

  it("rejects times that are not zero-padded, matching the server", () => {
    expect(validateReminderTime("9:00")).not.toBeNull();
    expect(validateReminderTime("19:5")).not.toBeNull();
  });
});

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    scopes = ["ops:read", "ops:write"];
    getDailyReminder.mockReset();
    updateDailyReminder.mockReset();
  });

  it("shows a loading state, then the stored time", async () => {
    let resolve: (v: typeof DEFAULTS) => void = () => {};
    getDailyReminder.mockReturnValue(
      new Promise<typeof DEFAULTS>((r) => {
        resolve = r;
      }),
    );
    renderPage();

    expect(screen.getByText("설정을 불러오는 중…")).toBeInTheDocument();
    resolve({ ...DEFAULTS, daily_reminder_time: "20:30" });

    await waitFor(() => expect(timeInput().value).toBe("20:30"));
  });

  it("defaults to 19:00 when no admin has changed it", async () => {
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    expect(screen.getByText("변경 이력 없음 (기본값)")).toBeInTheDocument();
  });

  it("says plainly that the setting is global, not per user", async () => {
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    expect(await screen.findByText("전체 공통 설정입니다.")).toBeInTheDocument();
    expect(
      screen.getByText(/사용자별로 다른 시각을 지정할 수는 없습니다/),
    ).toBeInTheDocument();
  });

  it("explains that the clock comes from the synced device timezone, not the phone or language", async () => {
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    expect(await screen.findByText("기준은 앱이 동기화한 기기 시간대")).toBeInTheDocument();
    expect(
      screen.getByText(/휴대폰 번호의 국가나 앱 언어 설정은 사용하지 않습니다/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/기기 시간대가 동기화되지 않은 사용자는 UTC 기준으로 발송됩니다/),
    ).toBeInTheDocument();
    // Language localization is called out as a separate concern.
    expect(screen.getByText("언어는 별개")).toBeInTheDocument();
    expect(
      screen.getByText(/언어를 영어로 바꿔도\s*발송 시각은 바뀌지 않습니다/),
    ).toBeInTheDocument();
  });

  it("saves a new time and reflects the server's response", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockResolvedValue(DEFAULTS);
    updateDailyReminder.mockResolvedValue({
      daily_reminder_time: "21:30",
      updated_at: "2026-09-08T05:00:00Z",
      updated_by_admin_id: "usr_admin",
    });
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    await user.clear(timeInput());
    await user.type(timeInput(), "21:30");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(updateDailyReminder).toHaveBeenCalledWith({ daily_reminder_time: "21:30" }),
    );
    expect(await screen.findByText(/21:30으로 변경했어요/)).toBeInTheDocument();
    // The audit line now names the admin who changed it.
    expect(screen.getByText("usr_admin")).toBeInTheDocument();
  });

  it("blocks saving an invalid time without calling the API", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    await user.clear(timeInput());
    await user.type(timeInput(), "25:00");

    expect(screen.getByText("시(HH)는 00~23 사이여야 합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(updateDailyReminder).not.toHaveBeenCalled();
  });

  it("keeps save disabled until the value actually changes", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    await user.clear(timeInput());
    await user.type(timeInput(), "20:00");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  it("restores the default with the reset action", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockResolvedValue({ ...DEFAULTS, daily_reminder_time: "07:15" });
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("07:15"));
    await user.click(screen.getByRole("button", { name: "기본값(19:00)으로" }));

    expect(timeInput().value).toBe("19:00");
    // Staged, not saved — the admin still has to confirm with 저장.
    expect(updateDailyReminder).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  it("surfaces a save failure and keeps the edit", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockResolvedValue(DEFAULTS);
    updateDailyReminder.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable_entity",
        "`daily_reminder_time` must be a 24-hour HH:MM time.",
      ),
    );
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    await user.clear(timeInput());
    await user.type(timeInput(), "20:00");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText("`daily_reminder_time` must be a 24-hour HH:MM time."),
    ).toBeInTheDocument();
    expect(timeInput().value).toBe("20:00");
  });

  it("offers a retry when the settings cannot be loaded", async () => {
    const user = userEvent.setup();
    getDailyReminder.mockRejectedValueOnce(
      new ApiError(500, "internal_error", "서버 오류"),
    );
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    expect(await screen.findByText("문제가 발생했어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
  });

  it("is read-only for an admin who only holds ops:read", async () => {
    scopes = ["ops:read"];
    getDailyReminder.mockResolvedValue(DEFAULTS);
    renderPage();

    await waitFor(() => expect(timeInput().value).toBe("19:00"));
    expect(timeInput()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    expect(screen.getByText(/권한이 필요합니다/)).toBeInTheDocument();
  });
});
