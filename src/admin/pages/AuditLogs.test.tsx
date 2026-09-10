/**
 * The Activity History table and its detail drawer.
 *
 * `styles/ipWrapping.test.ts` proves `.hgadm-ip` stops an address wrapping;
 * these prove the page actually asks for it. Without this pair the styling
 * could be perfect and unused, or applied in the table and forgotten in the
 * drawer — which is how the two places drift apart.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { AuditLogsPage } from "./AuditLogs";
import { adminApi } from "../api";
import type { AuditLogEntry } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, listAuditLogs: vi.fn() } };
});

const listAuditLogs = vi.mocked(adminApi.listAuditLogs);

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    actor_type: "admin",
    actor_id: "usr_admin",
    actor_name: "김하늘",
    actor_email: "haneul@talkhangyul.co.kr",
    action: "POST /admin/admins",
    object_type: "admin",
    object_id: "usr_target",
    user_id: "usr_target",
    request_id: "req_1",
    ip_address: "203.0.113.42",
    before: null,
    after: null,
    occurred_at: "2026-09-10T04:05:00Z",
    ...overrides,
  };
}

function renderPage(rows: AuditLogEntry[]) {
  listAuditLogs.mockResolvedValue({ items: rows, total: rows.length, page: 1, page_size: 25 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/audit-logs"]}>
          <AuditLogsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("the IP column", () => {
  it("marks the address so it cannot wrap", async () => {
    renderPage([entry()]);
    const ip = await screen.findByText("203.0.113.42");
    expect(ip).toHaveClass("hgadm-ip");
  });

  it("marks a full-length IPv6 the same way", async () => {
    const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
    renderPage([entry({ ip_address: ipv6 })]);
    expect(await screen.findByText(ipv6)).toHaveClass("hgadm-ip");
  });

  it("keeps the monospace class as well, so the column still aligns", async () => {
    renderPage([entry()]);
    expect(await screen.findByText("203.0.113.42")).toHaveClass("hgadm-cell-mono");
  });

  it("renders an em dash for a row with no address", async () => {
    renderPage([entry({ ip_address: null })]);
    await screen.findByText("관리자 권한 부여");
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("the detail drawer", () => {
  it("marks the address there too", async () => {
    const user = userEvent.setup();
    renderPage([entry()]);
    await user.click(await screen.findByText("관리자 권한 부여"));

    // Two now: the row behind the dialog, and the dialog's own.
    await waitFor(() => expect(screen.getAllByText("203.0.113.42")).toHaveLength(2));
    for (const node of screen.getAllByText("203.0.113.42")) {
      expect(node).toHaveClass("hgadm-ip");
    }
  });

  it("labels the field IP, since the user agent is not exposed", async () => {
    const user = userEvent.setup();
    renderPage([entry()]);
    await user.click(await screen.findByText("관리자 권한 부여"));

    // "IP" is also the table's column header, so look at the drawer's own
    // definition terms rather than at every match on the page.
    await screen.findByText("요청 ID");
    const terms = [...document.querySelectorAll("dt")].map((d) => d.textContent);
    expect(terms).toContain("IP");
    expect(terms).not.toContain("IP / UA");
  });
});

describe("the action column", () => {
  it("leads with the operation and keeps the endpoint below it", async () => {
    renderPage([entry()]);
    expect(await screen.findByText("관리자 권한 부여")).toBeInTheDocument();
    expect(screen.getByText("POST /admin/admins")).toBeInTheDocument();
  });
});

describe("the 시각 column", () => {
  it("splits the date and the time onto two lines, down to the second", async () => {
    // 04:05:42Z is 13:05:42 in Seoul. Seconds matter here: two admin actions
    // within a minute have to be told apart and put in order.
    const { container } = renderPage([entry({ occurred_at: "2026-09-10T04:05:42Z" })]);
    await screen.findByText("관리자 권한 부여");

    const time = container.querySelector("time")!;
    expect(time.getAttribute("datetime")).toBe("2026-09-10T04:05:42Z");
    expect(time.querySelector(".hgadm-timestamp__date")?.textContent).toBe("2026. 09. 10.");
    expect(time.querySelector(".hgadm-timestamp__time")?.textContent).toBe("오후 01:05:42");
  });

  it("uses the same two lines in the detail drawer", async () => {
    // The drawer used to format its own copy; the two are one component now.
    const user = userEvent.setup();
    renderPage([entry({ occurred_at: "2026-09-10T04:05:42Z" })]);
    await user.click(await screen.findByText("관리자 권한 부여"));

    await waitFor(() => expect(document.querySelectorAll("time")).toHaveLength(2));
    for (const time of document.querySelectorAll("time")) {
      expect(time.querySelector(".hgadm-timestamp__date")?.textContent).toBe("2026. 09. 10.");
      expect(time.querySelector(".hgadm-timestamp__time")?.textContent).toBe("오후 01:05:42");
    }
  });
});
