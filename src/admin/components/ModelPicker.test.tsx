import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ModelOverview, ModelPicker, modelWarnings, providerForModel } from "./ModelPicker";
import type { AiModelsData } from "../api";

const DATA: AiModelsData = {
  tiers: [
    {
      key: "ai.generation_model",
      label: "생성용",
      purpose: "문장·문제 생성",
      model: "gemini-2.5-flash",
      provider: "google",
      provider_name: "Google Gemini",
      supported: true,
      key_configured: true,
      priced: false,
      listed: true,
    },
    {
      key: "ai.reasoning_model",
      label: "추론용",
      purpose: "튜터 설명",
      model: "claude-old",
      provider: "anthropic",
      provider_name: "Anthropic",
      supported: true,
      key_configured: false,
      priced: true,
      listed: false,
    },
  ],
  providers: [
    { id: "anthropic", name: "Anthropic", supported: true, key_configured: true, listing: "live", message: "" },
    { id: "google", name: "Google Gemini", supported: true, key_configured: true, listing: "live", message: "" },
    { id: "openai", name: "OpenAI", supported: false, key_configured: false, listing: "unsupported", message: "아직 연동 코드가 없어 선택할 수 없습니다." },
  ],
  models: [
    { id: "claude-sonnet-5", display_name: "Claude Sonnet 5", provider: "anthropic", provider_name: "Anthropic", priced: true, source: "live" },
    { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5", provider: "anthropic", provider_name: "Anthropic", priced: true, source: "live" },
    { id: "gemini-2.5-flash", display_name: "Gemini 2.5 Flash", provider: "google", provider_name: "Google Gemini", priced: false, source: "live" },
  ],
};

function Harness({ initial = "claude-sonnet-5", onChange = vi.fn() }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="m">추론용 모델</label>
      <ModelPicker
        inputId="m"
        hintId="m-hint"
        value={value}
        savedValue={initial}
        data={DATA}
        loading={false}
        disabled={false}
        label="추론용 모델"
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </form>
  );
}

const input = () => screen.getByRole("combobox", { name: "추론용 모델" });

describe("ModelPicker", () => {
  it("opens a search box with the current model as a hint and lists models by provider", async () => {
    render(<Harness />);
    await userEvent.click(input());
    expect(input()).toHaveValue("");
    expect(input()).toHaveAttribute("placeholder", expect.stringContaining("claude-sonnet-5"));
    const list = screen.getByRole("listbox");
    expect(within(list).getByText("Anthropic")).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: /claude-sonnet-5.*현재/ })).toHaveAttribute("aria-selected", "true");
    expect(within(list).getByRole("option", { name: /gemini-2.5-flash.*가격 정보 없음/ })).toBeInTheDocument();
    expect(within(list).getByText(/아직 연동 코드가 없어/)).toHaveTextContent("OpenAI");
  });

  it("filters as you type and Enter takes the best match", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "haiku");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("claude-haiku-4-5"),
      expect.stringContaining("haiku 직접 입력해 사용"),
    ]);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("claude-haiku-4-5");
    expect(input()).toHaveValue("claude-haiku-4-5");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("accepts a name that is not in the list", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "claude-brand-new-7");
    await userEvent.click(screen.getByRole("option", { name: /claude-brand-new-7 직접 입력해 사용/ }));
    expect(onChange).toHaveBeenCalledWith("claude-brand-new-7");
  });

  it("Enter on an untouched list and Escape change nothing", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.click(input());
    await userEvent.type(input(), "zzz{Escape}");
    expect(input()).toHaveValue("claude-sonnet-5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("arrow keys move through the options", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("claude-haiku-4-5");
  });
});

describe("modelWarnings", () => {
  it("refuses OpenAI and blanks", () => {
    expect(modelWarnings("gpt-4o", DATA)[0]).toMatchObject({ tone: "danger" });
    expect(modelWarnings("  ", DATA)[0]).toMatchObject({ tone: "danger" });
  });

  it("warns about a name the provider does not list, and about unpriced models", () => {
    expect(modelWarnings("claude-typo", DATA).map((w) => w.text).join()).toContain("목록에 없는 이름");
    expect(modelWarnings("gemini-2.5-flash", DATA).map((w) => w.text).join()).toContain("가격 정보가 없어");
    expect(modelWarnings("claude-sonnet-5", DATA)).toEqual([]);
  });

  it("says when the provider key is missing, and flags unverifiable new names only when changed", () => {
    const noKeys: AiModelsData = {
      ...DATA,
      providers: DATA.providers.map((p) => ({ ...p, key_configured: false, listing: p.supported ? "no_key" : p.listing })),
      models: [],
    };
    const changed = modelWarnings("claude-x", noKeys).map((w) => w.text).join();
    expect(changed).toContain("API 키가 없어");
    expect(changed).toContain("확인하지 못했습니다");
    expect(modelWarnings("claude-x", noKeys, false).map((w) => w.text).join()).not.toContain("확인하지 못했습니다");
  });

  it("infers providers like the backend", () => {
    expect(providerForModel("claude-sonnet-5")).toBe("anthropic");
    expect(providerForModel("o3-mini")).toBe("openai");
    expect(providerForModel("gemma-3")).toBe("google");
  });
});

describe("ModelOverview", () => {
  it("shows the model for each purpose and what stands in its way", () => {
    render(<ModelOverview data={DATA} loading={false} error={null} aiEnabled refreshing={false} onRefresh={vi.fn()} />);
    const region = screen.getByRole("region", { name: "현재 사용 중인 모델" });
    expect(region).toHaveTextContent("생성용");
    expect(region).toHaveTextContent("gemini-2.5-flash");
    expect(region).toHaveTextContent("가격 정보 없음 · 예산 미반영");
    expect(region).toHaveTextContent("claude-old");
    expect(region).toHaveTextContent("Anthropic 키 없음 · 모의 응답");
    expect(region).toHaveTextContent("제공사 목록에 없음");
  });

  it("says when AI is switched off", () => {
    render(<ModelOverview data={DATA} loading={false} error={null} aiEnabled={false} refreshing={false} onRefresh={vi.fn()} />);
    expect(screen.getByText(/AI가 꺼져 있어/)).toBeInTheDocument();
  });
});
