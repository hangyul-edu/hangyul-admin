import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Badge,
  ConfirmDialog,
  DataTable,
  Pagination,
  statusLabel,
  statusTone,
} from "./kit";
import {
  formatMoney,
} from "../lib/format";
import type { Column } from "./kit";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const columns: Column<Row>[] = [
  { key: "name", header: "이름", render: (r) => r.name, sortKey: "name" },
  { key: "amount", header: "금액", numeric: true, render: (r) => r.amount },
];

describe("DataTable", () => {
  it("renders rows and calls onRowClick", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[
          { id: "1", name: "가나다", amount: 10 },
          { id: "2", name: "라마바", amount: 20 },
        ]}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    expect(screen.getByText("가나다")).toBeInTheDocument();
    await userEvent.click(screen.getByText("라마바"));
    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2" }),
    );
  });

  it("shows the empty state when there are no rows", () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(r: Row) => r.id} empty="비어 있음" />,
    );
    expect(screen.getByText("비어 있음")).toBeInTheDocument();
  });

  it("toggles sort direction through the header", async () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r: Row) => r.id}
        sort="name"
        order="desc"
        onSortChange={onSortChange}
      />,
    );
    await userEvent.click(screen.getByText(/이름/));
    expect(onSortChange).toHaveBeenCalledWith("name", "asc");
  });
});

describe("Pagination", () => {
  it("renders range text and disables edges correctly", async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} pageSize={25} total={60} onPageChange={onPageChange} />,
    );
    expect(screen.getByText(/60건 중 1–25/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe("ConfirmDialog", () => {
  it("fires confirm and cancel callbacks", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="삭제 확인"
        message="정말 삭제할까요?"
        danger
        confirmLabel="삭제"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("정말 삭제할까요?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("maps platform statuses to tones", () => {
    expect(statusTone("active")).toBe("success");
    expect(statusTone("trial")).toBe("success");
    expect(statusTone("suspended")).toBe("danger");
    expect(statusTone("processing")).toBe("warning");
    expect(statusTone("void")).toBe("neutral");
  });

  it("formats KRW without minor units and USD with them", () => {
    expect(formatMoney(12900, "KRW")).toContain("12,900");
    expect(formatMoney(999, "USD")).toContain("9.99");
  });

  it("renders badges with the tone class", () => {
    render(<Badge tone="danger">정지</Badge>);
    expect(screen.getByText("정지").className).toContain("hgadm-badge--danger");
  });
});


describe("statusLabel", () => {
  it("renders backend enums as Korean, not raw values", () => {
    expect(statusLabel("grace_period")).toBe("유예 기간");
    expect(statusLabel("trial_ending")).toBe("체험 종료 임박");
    expect(statusLabel("ready")).toBe("재생 가능");
  });

  it("keeps states that mean different things distinct", () => {
    // `open` is an issued invoice not yet paid; `unpaid` is one past due.
    // Collapsing them would hide which invoices actually need chasing.
    expect(statusLabel("open")).not.toBe(statusLabel("unpaid"));
    // A payment succeeding is not the same as the invoice being settled.
    expect(statusLabel("succeeded")).not.toBe(statusLabel("paid"));
    // Every label is distinct, so no two states read the same on screen.
    const labels = [
      "trial", "trial_ending", "active", "payment_pending", "payment_failed",
      "grace_period", "suspended", "cancelled", "expired",
    ].map(statusLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("falls through to the raw value for a status it does not know", () => {
    // A state added on the server should still show, not vanish.
    expect(statusLabel("some_new_state")).toBe("some_new_state");
    expect(statusLabel(null)).toBe("—");
  });
});
