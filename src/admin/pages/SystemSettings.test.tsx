import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { SystemSettingsPage, toChanges } from "./SystemSettings";
import { adminApi, type IntegrationSettings, type SettingField, type SettingsPageData } from "../api";
import { ApiError } from "../../lib/http";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      systemSettings: vi.fn(),
      saveIntegration: vi.fn(),
      testIntegration: vi.fn(),
    },
  };
});

let scopes: string[] = ["settings:read", "settings:write"];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: null,
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

const api = vi.mocked(adminApi);

function field(over: Partial<SettingField>): SettingField {
  return {
    key: "sendgrid.api_key",
    label: "API 키",
    help: "",
    kind: "secret",
    required: true,
    restart_required: false,
    placeholder: "",
    choices: [],
    env_var: "SENDGRID_API_KEY",
    source: "env",
    cleared: false,
    value: null,
    secret: { is_set: true, hint: "••••9876" },
    updated_at: null,
    updated_by: null,
    ...over,
  };
}

function sendgrid(over: Partial<IntegrationSettings> = {}): IntegrationSettings {
  return {
    id: "sendgrid",
    group: "messaging",
    name: "SendGrid 이메일",
    description: "기본 메일 서비스입니다.",
    note: "",
    kind: "integration",
    status: "active",
    status_label: "사용 중",
    toggle: { enabled: true, source: "env" },
    testable: true,
    restart_pending: [],
    last_check: null,
    fields: [
      field({}),
      field({ key: "sendgrid.from_name", label: "보내는 이름", kind: "text", required: false, secret: null, value: "Hangyul", env_var: "SENDGRID_FROM_NAME" }),
    ],
    ...over,
  };
}

function page(integration = sendgrid(), over: Partial<SettingsPageData> = {}): SettingsPageData {
  return {
    groups: [{ id: "messaging", label: "이메일·문자", description: "", integrations: [integration] }],
    restart_pending: [],
    encryption_key_source: "env",
    environment: { app_env: "local", database: "localhost:5432/hangyul" },
    revision: 1,
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <SystemSettingsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const card = async () => screen.findByRole("article", { name: "SendGrid 이메일" });

describe("SystemSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopes = ["settings:read", "settings:write"];
    api.systemSettings.mockResolvedValue(page());
  });

  it("shows a masked secret, where each value comes from, and the status", async () => {
    renderPage();
    const c = await card();
    expect(within(c).getByText("••••9876 (설정됨)")).toBeInTheDocument();
    expect(within(c).getByText("사용 중")).toBeInTheDocument();
    expect(within(c).getAllByText(".env").length).toBe(2);
    expect(within(c).getByDisplayValue("Hangyul")).toBeInTheDocument();
    // Nothing to save yet.
    expect(within(c).getByRole("button", { name: "변경사항 저장" })).toBeDisabled();
  });

  it("replacing a key sends it as a secret and leaves untouched fields out", async () => {
    const before = sendgrid();
    const after = { ...before, fields: [field({ source: "admin", secret: { is_set: true, hint: "••••ABCD" } }), before.fields[1]] };
    api.saveIntegration.mockResolvedValue({
      integration: after,
      applied: { "sendgrid.api_key": "live" },
      message: "저장했습니다. 바로 적용되었습니다.",
    });
    renderPage();
    const c = await card();
    api.systemSettings.mockResolvedValue(page(after));
    await userEvent.click(within(c).getByRole("button", { name: "변경" }));
    await userEvent.type(within(c).getByLabelText(/^API 키/), "SG.new-key-ABCD");
    await userEvent.click(within(c).getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", {
        changes: [{ key: "sendgrid.api_key", action: "set", secret: "SG.new-key-ABCD" }],
      }),
    );
    expect(await within(c).findByText("저장했습니다. 바로 적용되었습니다.")).toBeInTheDocument();
    expect(within(c).getByText("••••ABCD (설정됨)")).toBeInTheDocument();
  });

  it("the typed secret is hidden until asked for", async () => {
    renderPage();
    const c = await card();
    await userEvent.click(within(c).getByRole("button", { name: "변경" }));
    const input = within(c).getByLabelText(/^API 키/);
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(within(c).getByRole("button", { name: "입력값 보기" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("removing a key needs a confirmation and then a save", async () => {
    api.saveIntegration.mockResolvedValue({ integration: sendgrid(), applied: {}, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage();
    const c = await card();
    await userEvent.click(within(c).getByRole("button", { name: "삭제" }));
    await userEvent.click(await screen.findByRole("button", { name: "삭제 표시" }));
    expect(within(c).getByText("저장하면 삭제됩니다")).toBeInTheDocument();
    expect(api.saveIntegration).not.toHaveBeenCalled();
    await userEvent.click(within(c).getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", { changes: [{ key: "sendgrid.api_key", action: "clear" }] }),
    );
  });

  it("shows the server's message next to the field that failed, and keeps what was typed", async () => {
    api.saveIntegration.mockRejectedValue(
      new ApiError(422, "settings.invalid", "입력값을 확인하세요.", { fields: { "sendgrid.from_name": "너무 깁니다." } }),
    );
    renderPage();
    const c = await card();
    const name = within(c).getByLabelText("보내는 이름");
    await userEvent.clear(name);
    await userEvent.type(name, "새 이름");
    await userEvent.click(within(c).getByRole("button", { name: "변경사항 저장" }));
    expect(await within(c).findByRole("alert")).toHaveTextContent("너무 깁니다.");
    expect(within(c).getByText(/저장하지 못했습니다/)).toBeInTheDocument();
    expect(within(c).getByDisplayValue("새 이름")).toBeInTheDocument();
  });

  it("turning off asks first and says the key is kept", async () => {
    const off = sendgrid({ status: "off", status_label: "꺼짐", toggle: { enabled: false, source: "admin" } });
    api.saveIntegration.mockResolvedValue({
      integration: off,
      applied: { "toggle:sendgrid": "live" },
      message: "저장했습니다. 바로 적용되었습니다.",
    });
    renderPage();
    const c = await card();
    // What the server returns from now on (the page refetches after a save).
    api.systemSettings.mockResolvedValue(page(off));
    await userEvent.click(within(c).getByRole("checkbox", { name: "SendGrid 이메일 사용" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("지워지지 않으니");
    await userEvent.click(within(dialog).getByRole("button", { name: "끄기" }));
    await waitFor(() => expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", { changes: [], enabled: false }));
    expect(await within(c).findByText("꺼짐", { selector: ".hgadm-badge" })).toBeInTheDocument();
  });

  it("tests the connection with the values typed so far, without saving them", async () => {
    api.testIntegration.mockResolvedValue({
      ok: false,
      message: "SendGrid가 API 키를 거부했습니다. 키를 확인하세요.",
      latency_ms: 210,
      details: [],
      used_unsaved_values: true,
    });
    renderPage();
    const c = await card();
    await userEvent.click(within(c).getByRole("button", { name: "변경" }));
    await userEvent.type(within(c).getByLabelText(/^API 키/), "SG.try-this");
    await userEvent.click(within(c).getByRole("button", { name: /입력한 값으로 연결 테스트/ }));
    await waitFor(() =>
      expect(api.testIntegration).toHaveBeenCalledWith("sendgrid", { values: {}, secrets: { "sendgrid.api_key": "SG.try-this" } }),
    );
    expect(await within(c).findByText("연결 실패")).toBeInTheDocument();
    expect(within(c).getByText(/거부했습니다/)).toBeInTheDocument();
    expect(api.saveIntegration).not.toHaveBeenCalled();
  });

  it("flags settings that wait for a restart", async () => {
    api.systemSettings.mockResolvedValue(
      page(sendgrid(), { restart_pending: [{ key: "background_jobs_enabled", label: "백그라운드 작업 실행" }] }),
    );
    renderPage();
    expect(await screen.findByText(/서버를 다시 시작해야 적용되는 변경이 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/백그라운드 작업 실행/)).toBeInTheDocument();
  });

  it("is read-only without settings:write", async () => {
    scopes = ["settings:read"];
    renderPage();
    const c = await card();
    expect(within(c).queryByRole("button", { name: "변경사항 저장" })).toBeNull();
    expect(within(c).getByRole("button", { name: "변경" })).toBeDisabled();
    expect(within(c).getByRole("checkbox", { name: "SendGrid 이메일 사용" })).toBeDisabled();
    expect(screen.getByText(/조회 전용입니다/)).toBeInTheDocument();
  });
});

describe("toChanges", () => {
  it("puts secrets under `secret` and plain values under `value`", () => {
    const fields = sendgrid().fields;
    expect(
      toChanges(fields, {
        "sendgrid.api_key": { kind: "secret", value: "SG.x" },
        "sendgrid.from_name": { kind: "value", value: "한귤" },
      }),
    ).toEqual([
      { key: "sendgrid.api_key", action: "set", secret: "SG.x" },
      { key: "sendgrid.from_name", action: "set", value: "한귤" },
    ]);
  });
});
