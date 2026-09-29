import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  ModelOverview,
  ModelPicker,
  ProviderChoice,
  guessProvider,
  modelWarnings,
  suggestedModel,
} from "./ModelPicker";
import type { AiModelOption, AiModelsData, AiTierModel } from "../api";

function option(id: string, provider: string, over: Partial<AiModelOption> = {}): AiModelOption {
  return {
    id,
    display_name: id,
    provider,
    provider_name: provider,
    priced: true,
    source: "live",
    compatible: true,
    incompatible_reason: null,
    recommended_for: [],
    ...over,
  };
}

function tier(over: Partial<AiTierModel>): AiTierModel {
  return {
    key: "ai.generation_model",
    provider_key: "ai.generation_provider",
    label: "생성용",
    purpose: "문장·문제 생성",
    model: "gpt-5-mini",
    provider: "openai",
    provider_name: "OpenAI",
    supported: true,
    provider_enabled: true,
    key_configured: true,
    priced: true,
    rate: "입력 $0.25 · 출력 $2 (100만 토큰당)",
    listed: true,
    problem: null,
    ...over,
  };
}

const DATA: AiModelsData = {
  tiers: [
    tier({}),
    tier({
      key: "ai.reasoning_model",
      provider_key: "ai.reasoning_provider",
      label: "추론용",
      purpose: "튜터 설명",
      model: "claude-old",
      provider: "anthropic",
      provider_name: "Anthropic",
      key_configured: false,
      listed: false,
      priced: false,
      rate: "가격표에 없음 → 대체 요율 입력 $30 · 출력 $180",
    }),
  ],
  providers: [
    { id: "openai", name: "OpenAI", supported: true, enabled: true, key_configured: true, listing: "live", message: "" },
    { id: "anthropic", name: "Anthropic", supported: true, enabled: true, key_configured: false, listing: "no_key", message: "API 키를 저장하면 …" },
    { id: "google", name: "Google Gemini", supported: true, enabled: false, key_configured: true, listing: "live", message: "" },
  ],
  models: [
    option("gpt-4.1", "openai", { recommended_for: ["reasoning"] }),
    option("gpt-5-mini", "openai", { recommended_for: ["generation", "reasoning"] }),
    option("gpt-4o-mini", "openai", { recommended_for: ["generation"] }),
    option("gpt-99-preview", "openai", { priced: false }),
    option("text-embedding-3-small", "openai", { compatible: false, incompatible_reason: "임베딩 전용 모델" }),
    option("claude-sonnet-5", "anthropic", { source: "suggested", recommended_for: ["reasoning"] }),
  ],
};

function Harness({
  initial = "gpt-4.1",
  purpose = "generation" as const,
  onChange = vi.fn(),
}: {
  initial?: string;
  purpose?: "generation" | "reasoning";
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="m">생성용 모델</label>
      <ModelPicker
        inputId="m"
        hintId="m-hint"
        value={value}
        savedValue={initial}
        provider="openai"
        purpose={purpose}
        data={DATA}
        loading={false}
        disabled={false}
        label="생성용 모델"
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </form>
  );
}

const input = () => screen.getByRole("combobox", { name: "생성용 모델" });

describe("ModelPicker", () => {
  it("lists only the selected provider's usable models, the purpose's picks first", async () => {
    render(<Harness />);
    await userEvent.click(input());
    const list = screen.getByRole("listbox");
    const names = within(list)
      .getAllByRole("option")
      .filter((o) => o.getAttribute("aria-disabled") !== "true")
      .map((o) => o.textContent);
    // Generation picks (gpt-5-mini, gpt-4o-mini) come first; no Anthropic model here.
    expect(names[0]).toContain("gpt-5-mini");
    expect(names[1]).toContain("gpt-4o-mini");
    expect(names.join()).not.toContain("claude");
    expect(within(list).getByRole("option", { name: /gpt-5-mini.*생성용 추천/ })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /gpt-99-preview.*가격 미확인/ })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /gpt-4.1.*현재/ })).toHaveAttribute("aria-selected", "true");
    expect(within(list).getByText("이 계정에서 쓸 수 있는 모델", { exact: false })).toBeInTheDocument();
  });

  it("shows models that cannot do text, with the reason, but they cannot be chosen", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    expect(screen.queryByText("text-embedding-3-small")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /텍스트 생성에 쓸 수 없는 모델 1개 보기/ }));
    const disabled = screen.getByRole("option", { name: /text-embedding-3-small.*임베딩 전용 모델/ });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("filters as you type and Enter takes the best match", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "4o{Enter}");
    expect(onChange).toHaveBeenCalledWith("gpt-4o-mini");
    expect(input()).toHaveValue("gpt-4o-mini");
  });

  it("accepts a custom model name", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "ft:gpt-4o-mini:acme::x1");
    await userEvent.click(screen.getByRole("option", { name: /ft:gpt-4o-mini:acme::x1 직접 입력해 사용/ }));
    expect(onChange).toHaveBeenCalledWith("ft:gpt-4o-mini:acme::x1");
  });

  it("Enter on an untouched list and Escape change nothing", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.click(input());
    await userEvent.type(input(), "zzz{Escape}");
    expect(input()).toHaveValue("gpt-4.1");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("modelWarnings", () => {
  it("refuses another provider's model, a non-text model and a blank", () => {
    expect(modelWarnings("claude-sonnet-5", "openai", DATA)[0]).toMatchObject({ tone: "danger" });
    expect(modelWarnings("claude-sonnet-5", "openai", DATA)[0].text).toContain("Anthropic 모델 이름으로 보입니다");
    expect(modelWarnings("text-embedding-3-small", "openai", DATA)[0]).toMatchObject({ tone: "danger" });
    expect(modelWarnings("  ", "openai", DATA)[0]).toMatchObject({ tone: "danger" });
  });

  it("warns about names the account does not list and about unpriced models", () => {
    expect(modelWarnings("gpt-typo", "openai", DATA).map((w) => w.text).join()).toContain("목록에 없는 이름");
    expect(modelWarnings("gpt-99-preview", "openai", DATA).map((w) => w.text).join()).toContain("대체 요율");
    expect(modelWarnings("gpt-5-mini", "openai", DATA)).toEqual([]);
  });

  it("says when the provider has no key or is switched off", () => {
    expect(modelWarnings("claude-x", "anthropic", DATA).map((w) => w.text).join()).toContain("API 키가 없어");
    expect(modelWarnings("gemini-2.5-flash", "google", DATA).map((w) => w.text).join()).toContain("꺼져 있어");
  });

  it("names hint at a provider but routing does not depend on it", () => {
    expect(guessProvider("o3-mini")).toBe("openai");
    expect(guessProvider("ft:gpt-4o-mini:acme::x")).toBe("openai");
    expect(guessProvider("my-model")).toBeNull();
    expect(suggestedModel("openai", "generation", DATA)).toBe("gpt-5-mini");
    expect(suggestedModel("openai", "reasoning", DATA)).toBe("gpt-4.1");
  });
});

describe("ProviderChoice", () => {
  it("shows each provider's state and changes the selection", async () => {
    const onChange = vi.fn();
    render(<ProviderChoice inputId="p" label="생성용 제공사" value="openai" data={DATA} disabled={false} onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "생성용 제공사" });
    expect(within(group).getByRole("radio", { name: /OpenAI.*사용 가능/ })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: /Anthropic.*키 없음/ })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /Google Gemini.*꺼짐/ })).toBeInTheDocument();
    await userEvent.click(within(group).getByRole("radio", { name: /Anthropic/ }));
    expect(onChange).toHaveBeenCalledWith("anthropic");
  });
});

describe("ModelOverview", () => {
  it("shows the provider and model for each purpose and what stands in the way", () => {
    render(<ModelOverview data={DATA} loading={false} error={null} aiEnabled refreshing={false} onRefresh={vi.fn()} />);
    const region = screen.getByRole("region", { name: "현재 사용 중인 모델" });
    expect(region).toHaveTextContent("OpenAI");
    expect(region).toHaveTextContent("gpt-5-mini");
    expect(region).toHaveTextContent("입력 $0.25");
    expect(region).toHaveTextContent("Anthropic 키 없음 · 호출 안 됨");
    expect(region).toHaveTextContent("이 계정의 모델 목록에 없음");
    expect(region).toHaveTextContent("대체 요율");
  });

  it("says when AI is switched off", () => {
    render(<ModelOverview data={DATA} loading={false} error={null} aiEnabled={false} refreshing={false} onRefresh={vi.fn()} />);
    expect(screen.getByText(/AI가 꺼져 있어/)).toBeInTheDocument();
  });
});
