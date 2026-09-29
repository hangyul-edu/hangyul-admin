/**
 * The bulk-cleanup dialog must show what it is about to archive before it can
 * be confirmed. When the preview cannot be loaded there are no counts to show:
 * "0건" would read as "nothing is affected", and confirming blind is exactly
 * what the preview exists to prevent.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { ContentCleanupButton } from "./ContentCleanupButton";

interface Counts {
  sentences_archived: number;
}

function renderButton(preview: () => Promise<Counts>, clear = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ContentCleanupButton<Counts>
          label="문장 전체 정리"
          preview={preview}
          clear={clear}
          countLabels={[["sentences_archived", "문장"]]}
          invalidateKeys={[]}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return clear;
}

describe("ContentCleanupButton", () => {
  it("shows the preview counts and allows confirming", async () => {
    renderButton(async () => ({ sentences_archived: 1234 }));
    await userEvent.click(screen.getByRole("button", { name: /문장 전체 정리/ }));
    expect(await screen.findByText("1,234건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학습 대상에서 제외" })).toBeEnabled();
  });

  it("does not print 0건 or allow confirming when the preview fails", async () => {
    const clear = renderButton(async () => {
      throw new Error("preview down");
    });
    await userEvent.click(screen.getByRole("button", { name: /문장 전체 정리/ }));
    expect(await screen.findByText(/미리보기를 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText("0건")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "학습 대상에서 제외" });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(clear).not.toHaveBeenCalled();
  });
});
