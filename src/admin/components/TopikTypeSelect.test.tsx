import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopikTypeSelect } from "./TopikTypeSelect";
import { topikSectionLabel, topikTypeLabel, typeForSection } from "../lib/topik";

describe("TopikTypeSelect", () => {
  it("offers question types by name and returns the code", async () => {
    const onChange = vi.fn();
    render(<TopikTypeSelect value="" onChange={onChange} aria-label="문제 유형" />);
    await userEvent.click(screen.getByLabelText("문제 유형"));
    await userEvent.click(screen.getByRole("option", { name: "[유형07] 신문 기사 제목의 의미 고르기" }));
    expect(onChange).toHaveBeenCalledWith("reading_07");
  });

  it("offers only the chosen section's types", async () => {
    render(<TopikTypeSelect value="" section="writing" onChange={() => {}} aria-label="문제 유형" />);
    await userEvent.click(screen.getByLabelText("문제 유형"));
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual([
      "선택 안 함",
      "[51번, 52번 유형] 빈칸에 알맞은 말 쓰기",
      "[53번 유형] 자료를 설명하는 글 쓰기",
      "[54번 유형] 주제에 대해 글 쓰기",
    ]);
  });

  it("keeps a stored code it does not know", () => {
    render(<TopikTypeSelect value="reading_99" onChange={() => {}} aria-label="문제 유형" />);
    expect(screen.getByLabelText("문제 유형")).toHaveTextContent("reading_99");
  });
});

describe("TOPIK labels", () => {
  it("names sections and types, falling back to the code", () => {
    expect(topikSectionLabel("listening")).toBe("듣기");
    expect(topikTypeLabel("listening_04")).toBe("[유형04] 일치하는 내용 고르기");
    expect(topikTypeLabel("custom_1")).toBe("custom_1");
  });

  it("drops a type that belongs to another section", () => {
    expect(typeForSection("reading_03", "listening")).toBe("");
    expect(typeForSection("reading_03", "reading")).toBe("reading_03");
    expect(typeForSection("reading_03", "")).toBe("reading_03");
  });
});
