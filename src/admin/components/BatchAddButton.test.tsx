import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { BatchAddButton } from "./BatchAddButton";

const TEMPLATE = JSON.stringify([{ korean: "예시 문장", translation: "Example" }], null, 2);

function renderButton(submit = vi.fn().mockResolvedValue({ created: 1 })) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BatchAddButton
          title="문장 일괄 추가"
          hint="JSON 배열을 붙여넣으세요."
          template={TEMPLATE}
          submit={submit}
          invalidateKeys={[["admin", "sentences"]]}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return submit;
}

function openModal() {
  fireEvent.click(screen.getByRole("button", { name: /일괄 추가/ }));
}

describe("BatchAddButton", () => {
  it("keeps submit disabled until valid JSON is pasted, then shows the count", () => {
    renderButton();
    openModal();

    const submitButton = screen.getByRole("button", { name: "추가" });
    expect(submitButton).toBeDisabled();

    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "not json" } });
    expect(screen.getByText(/JSON 문법 오류/)).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: '{"korean": "객체 하나"}' } });
    expect(screen.getByText("JSON 배열이어야 합니다.")).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: TEMPLATE } });
    expect(screen.getByText("1건 인식됨")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1건 추가" })).toBeEnabled();
  });

  it("submits the parsed items and reports the created count", async () => {
    const submit = renderButton(vi.fn().mockResolvedValue({ created: 2 }));
    openModal();

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: JSON.stringify([
          { korean: "하나", translation: "one" },
          { korean: "둘", translation: "two" },
        ]),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "2건 추가" }));

    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toEqual([
      { korean: "하나", translation: "one" },
      { korean: "둘", translation: "two" },
    ]);
    expect(await screen.findByText("2건을 추가했어요.")).toBeInTheDocument();
  });

  it("unwraps an { items: [...] } envelope and enforces the 1000-item cap", () => {
    renderButton();
    openModal();

    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, {
      target: { value: JSON.stringify({ items: [{ korean: "봉투 안 항목" }] }) },
    });
    expect(screen.getByText("1건 인식됨")).toBeInTheDocument();

    const oversized = Array.from({ length: 1001 }, (_, i) => ({ korean: `문장 ${i}` }));
    fireEvent.change(editor, { target: { value: JSON.stringify(oversized) } });
    expect(
      screen.getByText("한 번에 최대 1,000건까지 추가할 수 있습니다."),
    ).toBeInTheDocument();
  });
});
