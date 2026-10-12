/**
 * JSON bulk import: a file (or pasted JSON) is checked row by row on the
 * server before anything is saved, and only the rows that are ready — with
 * duplicates skipped unless kept — are added.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { BulkImportButton, MAX_ITEMS, parseItems } from "./BulkImportButton";
import type { BulkCheckResult } from "../api";

const ITEMS = [
  { korean: "하나", translation: "one" },
  { korean: "둘" },
  { korean: "하나", translation: "one" },
  { korean: "셋", translation: "three" },
];

const REPORT: BulkCheckResult = {
  total: 4,
  ready: 2,
  invalid: 1,
  duplicates: 1,
  rows: [
    { index: 0, ok: true, summary: "하나", errors: [], warnings: [], duplicate: null, duplicate_of: null },
    { index: 1, ok: false, summary: "둘", errors: ["번역(translation): 꼭 넣어야 해요"], warnings: [], duplicate: null, duplicate_of: null },
    { index: 2, ok: true, summary: "하나", errors: [], warnings: [], duplicate: "in_file", duplicate_of: 0 },
    { index: 3, ok: true, summary: "셋", errors: [], warnings: ["알 수 없는 항목은 무시돼요: tranlation"], duplicate: null, duplicate_of: null },
  ],
};

function setup() {
  const check = vi.fn().mockResolvedValue(REPORT);
  const submit = vi.fn().mockResolvedValue({ created: 2 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BulkImportButton
          noun="문장"
          title="문장 일괄 추가"
          fields={[{ name: "korean", need: "필수", meaning: "한국어 문장", example: "안녕하세요." }]}
          template={JSON.stringify([{ korean: "예시", translation: "Example" }], null, 2)}
          templateFilename="문장-예시.json"
          check={check}
          submit={submit}
          invalidateKeys={[["admin", "sentences"]]}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { check, submit };
}

function jsonFile(content: unknown, name = "sentences.json") {
  return new File([typeof content === "string" ? content : JSON.stringify(content)], name, { type: "application/json" });
}

async function upload(file: File) {
  await userEvent.click(screen.getByRole("button", { name: /JSON으로 일괄 추가/ }));
  await userEvent.upload(screen.getByLabelText("JSON 파일 선택"), file);
}

describe("BulkImportButton", () => {
  it("checks an uploaded file row by row before saving anything", async () => {
    const { check, submit } = setup();
    await upload(jsonFile(ITEMS));

    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(check.mock.calls[0][0]).toEqual(ITEMS);
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByText(/sentences\.json · 아직 저장하지 않았어요/)).toBeInTheDocument();
    expect(screen.getByText("번역(translation): 꼭 넣어야 해요")).toBeInTheDocument();
    expect(screen.getByText("파일 안 중복")).toBeInTheDocument();
    expect(screen.getByText(/1번과 같음 · 건너뜀/)).toBeInTheDocument();
    expect(screen.getByText("알 수 없는 항목은 무시돼요: tranlation")).toBeInTheDocument();
  });

  it("adds only the ready rows, skipping duplicates unless they are kept", async () => {
    const { submit } = setup();
    await upload(jsonFile(ITEMS));

    await userEvent.click(await screen.findByRole("button", { name: "2건 추가" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toEqual([ITEMS[0], ITEMS[3]]);
    expect(await screen.findByText("2건을 추가했어요.")).toBeInTheDocument();
  });

  it("can keep duplicates", async () => {
    const { submit } = setup();
    await upload(jsonFile(ITEMS));

    await userEvent.click(await screen.findByRole("checkbox", { name: /중복은 건너뛰기/ }));
    await userEvent.click(screen.getByRole("button", { name: "3건 추가" }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0]).toEqual([ITEMS[0], ITEMS[2], ITEMS[3]]);
  });

  it("filters the review to the rows that need a look", async () => {
    setup();
    await upload(jsonFile(ITEMS));
    await screen.findByText("번역(translation): 꼭 넣어야 해요");

    await userEvent.click(screen.getByRole("radio", { name: /오류·주의 2/ }));
    const body = screen.getAllByRole("rowgroup")[1];
    expect(within(body).getAllByRole("row")).toHaveLength(2);
    expect(within(body).queryByText("파일 안 중복")).not.toBeInTheDocument();
  });

  it("explains a file it cannot read, and sends nothing", async () => {
    const { check } = setup();
    await upload(jsonFile("{ not json"));
    expect(await screen.findByRole("alert")).toHaveTextContent("JSON 형식이 올바르지 않아요");
    expect(check).not.toHaveBeenCalled();
  });

  it("accepts pasted JSON as well", async () => {
    const { check } = setup();
    await userEvent.click(screen.getByRole("button", { name: /JSON으로 일괄 추가/ }));
    await userEvent.click(screen.getByText("파일 대신 직접 붙여넣기"));
    fireEvent.change(screen.getByLabelText("JSON 붙여넣기"), { target: { value: JSON.stringify({ items: ITEMS }) } });
    await userEvent.click(screen.getByRole("button", { name: "확인하기" }));
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(check.mock.calls[0][0]).toEqual(ITEMS);
  });
});

describe("parseItems", () => {
  it("takes a bare array or an { items } envelope, and a BOM", () => {
    expect(parseItems('[{"a":1}]').items).toEqual([{ a: 1 }]);
    expect(parseItems('﻿{"items":[{"a":1}]}').items).toEqual([{ a: 1 }]);
  });

  it("says what is wrong with the shape", () => {
    expect(parseItems('{"a":1}').error).toMatch("목록");
    expect(parseItems("[]").error).toMatch("하나도 없어요");
    expect(parseItems('[{"a":1}, 3]').error).toBe("2번째 항목이 { ... } 모양이 아니에요.");
    const tooMany = JSON.stringify(Array.from({ length: MAX_ITEMS + 1 }, () => ({})));
    expect(parseItems(tooMany).error).toMatch("나눠서 올려 주세요");
  });
});
