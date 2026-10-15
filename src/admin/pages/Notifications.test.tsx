import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { NotificationsPage } from "./Notifications";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, sendMarketingPush: vi.fn() } };
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
