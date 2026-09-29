import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
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
      aiModels: vi.fn(),
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

const smtp: IntegrationSettings = {
  ...sendgrid(),
  id: "smtp",
  name: "SMTP 이메일",
  status: "not_configured",
  status_label: "미설정",
  toggle: { enabled: false, source: "env" },
  fields: [field({ key: "email.host", label: "메일 서버 주소", kind: "text", secret: null, value: "", env_var: "SMTP_HOST" })],
};

function page(integration = sendgrid(), over: Partial<SettingsPageData> = {}): SettingsPageData {
  return {
    groups: [{ id: "messaging", label: "이메일·문자", description: "", integrations: [integration, smtp] }],
    restart_pending: [],
    encryption_key_source: "env",
    environment: { app_env: "local", database: "localhost:5432/hangyul" },
    revision: 1,
    ...over,
  };
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.search}</div>;
}

function renderPage(entry = "/settings?item=sendgrid") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <SystemSettingsPage />
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const detail = async () => screen.findByRole("form", { name: "SendGrid 이메일" });
const saveButton = (d: HTMLElement) => within(d).getByRole("button", { name: "저장" });

describe("SystemSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopes = ["settings:read", "settings:write"];
    api.systemSettings.mockResolvedValue(page());
  });

  it("opens on an overview and a list; picking an item shows only that item", async () => {
    renderPage("/settings");
    expect(await screen.findByRole("heading", { name: "한눈에 보기" })).toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "설정 항목" });
    expect(within(list).getByRole("button", { name: /SendGrid 이메일.*사용 중/ })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: /SMTP 이메일/ }));
    expect(await screen.findByRole("form", { name: "SMTP 이메일" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?item=smtp");
    expect(screen.queryByRole("form", { name: "SendGrid 이메일" })).toBeNull();
  });

  it("shows a saved secret only masked, and an empty input keeps it", async () => {
    renderPage();
    const d = await detail();
    expect(within(d).getByText("••••9876 저장됨")).toBeInTheDocument();
    expect(within(d).getByLabelText(/^API 키/)).toHaveValue("");
    expect(within(d).getByText("변경 사항 없음")).toBeInTheDocument();
    expect(saveButton(d)).toBeDisabled();
  });

  it("typing a new key and saving sends it as a secret, and says it was applied", async () => {
    const after = { ...sendgrid(), fields: [field({ source: "admin", secret: { is_set: true, hint: "••••ABCD" } }), sendgrid().fields[1]] };
    api.saveIntegration.mockResolvedValue({ integration: after, applied: { "sendgrid.api_key": "live" }, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage();
    const d = await detail();
    api.systemSettings.mockResolvedValue(page(after));
    await userEvent.type(within(d).getByLabelText(/^API 키/), "SG.new-key-ABCD");
    expect(within(d).getByText(/저장하지 않은 변경 1개/)).toBeInTheDocument();
    await userEvent.click(saveButton(d));
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", {
        changes: [{ key: "sendgrid.api_key", action: "set", secret: "SG.new-key-ABCD" }],
      }),
    );
    expect(await within(d).findByText("저장했습니다. 바로 적용되었습니다.")).toBeInTheDocument();
    expect(await within(d).findByText("••••ABCD 저장됨")).toBeInTheDocument();
    expect(within(d).getByLabelText(/^API 키/)).toHaveValue("");
  });

  it("Enter in a field saves", async () => {
    api.saveIntegration.mockResolvedValue({ integration: sendgrid(), applied: { "sendgrid.from_name": "live" }, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage();
    const d = await detail();
    const name = within(d).getByLabelText("보내는 이름");
    await userEvent.clear(name);
    await userEvent.type(name, "한귤{Enter}");
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", { changes: [{ key: "sendgrid.from_name", action: "set", value: "한귤" }] }),
    );
  });

  it("a restart-only save says it applies after a restart", async () => {
    api.saveIntegration.mockResolvedValue({ integration: sendgrid(), applied: { "sendgrid.from_name": "restart" }, message: "저장했습니다. 서버를 다시 시작하면 적용됩니다." });
    renderPage();
    const d = await detail();
    await userEvent.type(within(d).getByLabelText("보내는 이름"), "!{Enter}");
    expect(await within(d).findByText("저장했습니다. 서버를 다시 시작하면 적용됩니다.")).toBeInTheDocument();
  });

  it("the typed secret is hidden until asked for", async () => {
    renderPage();
    const d = await detail();
    const input = within(d).getByLabelText(/^API 키/);
    expect(input).toHaveAttribute("type", "password");
    await userEvent.type(input, "abc");
    await userEvent.click(within(d).getByRole("button", { name: "입력값 보기" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("removing a key needs a confirmation and then a save", async () => {
    api.saveIntegration.mockResolvedValue({ integration: sendgrid(), applied: {}, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage();
    const d = await detail();
    await userEvent.click(within(d).getByRole("button", { name: "삭제" }));
    await userEvent.click(await screen.findByRole("button", { name: "삭제 표시" }));
    expect(within(d).getByText("저장하면 이 값을 삭제합니다")).toBeInTheDocument();
    expect(api.saveIntegration).not.toHaveBeenCalled();
    await userEvent.click(saveButton(d));
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", { changes: [{ key: "sendgrid.api_key", action: "clear" }] }),
    );
  });

  it("shows the server's message next to the field that failed, and keeps what was typed", async () => {
    api.saveIntegration.mockRejectedValue(
      new ApiError(422, "settings.invalid", "입력값을 확인하세요.", { fields: { "sendgrid.from_name": "너무 깁니다." } }),
    );
    renderPage();
    const d = await detail();
    const name = within(d).getByLabelText("보내는 이름");
    await userEvent.clear(name);
    await userEvent.type(name, "새 이름");
    await userEvent.click(saveButton(d));
    expect(await within(d).findByRole("alert")).toHaveTextContent("너무 깁니다.");
    expect(within(d).getByText(/저장하지 못했습니다/)).toBeInTheDocument();
    expect(within(d).getByDisplayValue("새 이름")).toBeInTheDocument();
  });

  it("turning off asks first and says the key is kept", async () => {
    const off = sendgrid({ status: "off", status_label: "꺼짐", toggle: { enabled: false, source: "admin" } });
    api.saveIntegration.mockResolvedValue({ integration: off, applied: { "toggle:sendgrid": "live" }, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage();
    const d = await detail();
    api.systemSettings.mockResolvedValue(page(off));
    await userEvent.click(within(d).getByRole("checkbox", { name: "SendGrid 이메일 사용" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("지워지지 않으니");
    await userEvent.click(within(dialog).getByRole("button", { name: "끄기" }));
    await waitFor(() => expect(api.saveIntegration).toHaveBeenCalledWith("sendgrid", { changes: [], enabled: false }));
    expect(await within(d).findByText("꺼짐", { selector: ".hgadm-cfg__pill" })).toBeInTheDocument();
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
    const d = await detail();
    await userEvent.type(within(d).getByLabelText(/^API 키/), "SG.try-this");
    await userEvent.click(within(d).getByRole("button", { name: /입력한 값으로 테스트/ }));
    await waitFor(() =>
      expect(api.testIntegration).toHaveBeenCalledWith("sendgrid", { values: {}, secrets: { "sendgrid.api_key": "SG.try-this" } }),
    );
    expect(await within(d).findByText("연결 실패")).toBeInTheDocument();
    expect(within(d).getByText(/거부했습니다/)).toBeInTheDocument();
    expect(api.saveIntegration).not.toHaveBeenCalled();
  });

  it("a stored test of unsaved values does not paint the saved setup as failing", async () => {
    api.systemSettings.mockResolvedValue(
      page(
        sendgrid({
          last_check: { ok: false, message: "거부", latency_ms: 300, checked_at: "2026-09-29T00:00:00Z", checked_by: "관리자", used_unsaved_values: true },
        }),
      ),
    );
    renderPage();
    const d = await detail();
    const box = within(d).getByRole("region", { name: "연결 확인" });
    expect(box).toHaveTextContent("마지막 테스트 (저장하지 않은 값): 실패");
    expect(box).not.toHaveClass("is-fail");
  });

  it("asks before leaving an item with unsaved changes", async () => {
    renderPage();
    const d = await detail();
    await userEvent.type(within(d).getByLabelText("보내는 이름"), "x");
    await userEvent.click(within(screen.getByRole("navigation", { name: "설정 항목" })).getByRole("button", { name: /SMTP 이메일/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?item=sendgrid");
    expect(within(d).getByDisplayValue("Hangyulx")).toBeInTheDocument();
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
    const d = await detail();
    expect(within(d).queryByRole("button", { name: "저장" })).toBeNull();
    expect(within(d).queryByRole("button", { name: /테스트/ })).toBeNull();
    expect(within(d).getByLabelText(/^API 키/)).toBeDisabled();
    expect(within(d).getByRole("checkbox", { name: "SendGrid 이메일 사용" })).toBeDisabled();
    expect(within(d).getByText(/조회 전용입니다/)).toBeInTheDocument();
  });
});

describe("SystemSettingsPage — AI models", () => {
  const ai: IntegrationSettings = {
    ...sendgrid(),
    id: "ai",
    name: "AI 모델 공급자",
    toggle: { enabled: true, source: "admin" },
    fields: [
      field({ key: "ai.reasoning_model", label: "추론용 모델", kind: "model", secret: null, value: "claude-sonnet-5", env_var: "AI_REASONING_MODEL" }),
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scopes = ["settings:read", "settings:write"];
    api.systemSettings.mockResolvedValue(page(ai));
    api.aiModels.mockResolvedValue({
      tiers: [
        {
          key: "ai.reasoning_model",
          label: "추론용",
          purpose: "튜터 설명",
          model: "claude-sonnet-5",
          provider: "anthropic",
          provider_name: "Anthropic",
          supported: true,
          key_configured: true,
          priced: true,
          listed: true,
        },
      ],
      providers: [{ id: "anthropic", name: "Anthropic", supported: true, key_configured: true, listing: "live", message: "" }],
      models: [
        { id: "claude-sonnet-5", display_name: "Claude Sonnet 5", provider: "anthropic", provider_name: "Anthropic", priced: true, source: "live" },
        { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", provider: "anthropic", provider_name: "Anthropic", priced: true, source: "live" },
      ],
    });
  });

  it("shows the configured model per purpose and saves a model picked from the list", async () => {
    api.saveIntegration.mockResolvedValue({ integration: ai, applied: { "ai.reasoning_model": "live" }, message: "저장했습니다. 바로 적용되었습니다." });
    renderPage("/settings?item=ai");
    const d = await screen.findByRole("form", { name: "AI 모델 공급자" });
    const summary = await within(d).findByRole("region", { name: "현재 사용 중인 모델" });
    await within(summary).findByText("claude-sonnet-5");
    expect(summary).toHaveTextContent("제공사 목록에서 확인됨");

    await userEvent.click(within(d).getByRole("combobox", { name: /^추론용 모델/ }));
    await userEvent.type(within(d).getByRole("combobox", { name: /^추론용 모델/ }), "opus{Enter}");
    expect(within(d).getByRole("combobox", { name: /^추론용 모델/ })).toHaveValue("claude-opus-5-5");
    await userEvent.click(saveButton(d));
    await waitFor(() =>
      expect(api.saveIntegration).toHaveBeenCalledWith("ai", {
        changes: [{ key: "ai.reasoning_model", action: "set", value: "claude-opus-5-5" }],
      }),
    );
    expect(api.aiModels).toHaveBeenCalled();
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
