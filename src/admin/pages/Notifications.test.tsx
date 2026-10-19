import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { NotificationsPage } from "./Notifications";

const { sendMarketingNotice } = vi.hoisted(() => ({ sendMarketingNotice: vi.fn() }));
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, sendMarketingPush: vi.fn(), sendMarketingNotice } };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/notifications"]}>
          <NotificationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The device mock-up beside the form. */
function preview(): HTMLElement {
  return screen.getByText("미리보기").closest(".hgadm-card") as HTMLElement;
}

describe("notification preview", () => {
  it("shows no icon or decorative image beside the title", () => {
    renderPage();
    // The slot previously held a gradient square — first with the glyph "한",
    // then the app mark. Neither is here now: the preview is text only.
    expect(preview().querySelector(".hgadm-brand-mark")).toBeNull();
    expect(preview().querySelector("svg")).toBeNull();
    expect(preview().querySelector("img")).toBeNull();
  });

  it("leaves no gap where the icon used to sit", () => {
    renderPage();
    // The row was a flex container whose gap and alignment existed only to
    // place the icon. With one child left, that spacing would show as an
    // indent before the title.
    const title = screen.getByText("알림 제목");
    const box = title.closest(".hgadm-push-preview") as HTMLElement;
    expect(box).not.toBeNull();
    // Title and body stack in one plain block: no flex row, no gap before the title.
    expect(box.className).not.toMatch(/hgadm-row|hgadm-note/);
  });

  it("previews the title and body the admin is typing", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(preview().textContent).toContain("알림 제목");

    await user.type(screen.getByLabelText(/제목/), "점검 안내");
    expect(preview().textContent).toContain("점검 안내");
    // The placeholder gives way to the real copy.
    expect(preview().textContent).not.toContain("알림 제목");
  });

});

describe("inbox broadcast", () => {
  it("says it also pushes, and re-sends a failed broadcast under the same campaign key", async () => {
    const user = userEvent.setup();
    sendMarketingNotice
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ created: 3 })
      .mockResolvedValueOnce({ created: 5 });
    renderPage();
    await user.click(screen.getByRole("button", { name: "마케팅 알림 (인앱)" }));
    // The inbox notice is pushed as well (it used to claim it was not).
    expect(screen.getByText(/푸시도 함께 보냅니다/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/제목/), "가을 할인");
    const send = async () => {
      await user.click(screen.getByRole("button", { name: "발송하기" }));
      await user.click(screen.getByRole("button", { name: "발송" }));
    };
    await send(); // fails partway
    await send(); // the operator retries
    expect(sendMarketingNotice).toHaveBeenCalledTimes(2);
    const [first, retry] = sendMarketingNotice.mock.calls.map((c) => c[0].dedup_key as string);
    expect(first).toBeTruthy();
    // Users the failed run already reached are skipped, not posted twice.
    expect(retry).toBe(first);

    // A new campaign after the success gets a new key.
    await user.type(screen.getByLabelText(/제목/), "겨울 할인");
    await send();
    expect(sendMarketingNotice.mock.calls[2][0].dedup_key).not.toBe(first);
  });
});
