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
  it("shows the app's own mark, not a stand-in glyph", () => {
    renderPage();
    // It used to render a hand-made gradient square containing the bare glyph
    // "한" — not the app's mark (한귤 is a tangerine), and a lone 한 reads as
    // 한글. The preview must show what a device actually puts there.
    expect(preview().querySelector(".hgadm-brand-mark")).not.toBeNull();
    expect(preview().textContent).not.toContain("한글");
    const marks = preview().querySelectorAll(".hgadm-brand-mark");
    expect(marks).toHaveLength(1);
    // The mark is decorative beside the title, so it is hidden from readers.
    expect(marks[0]).toHaveAttribute("aria-hidden");
  });

  it("shares one brand-mark definition with the rest of the admin", () => {
    // A class rather than inline styles: the sidebar logo and this icon are
    // the same mark, and duplicating the gradient would let them drift.
    renderPage();
    const mark = preview().querySelector(".hgadm-brand-mark") as HTMLElement;
    expect(mark.getAttribute("style")).toBeNull();
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

  it("keeps the mark beside the title, not above it", () => {
    // The icon and the text column are siblings in a flex row; if the mark
    // ended up inside the text block the preview would stop resembling a
    // notification.
    renderPage();
    const mark = preview().querySelector(".hgadm-brand-mark")!;
    const row = mark.parentElement!;
    expect(row.style.display).toBe("flex");
    expect(row.style.alignItems).toBe("flex-start");
    expect(row.children).toHaveLength(2);
  });
});
