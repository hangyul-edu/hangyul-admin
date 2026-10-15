import { useState } from "react";
import { Download, FileJson } from "lucide-react";
import { Badge, Button, Textarea } from "../kit";
import { MAX_ITEMS, downloadJson, type FieldDoc } from "./files";
import type { BulkImportState } from "./useBulkImport";

/** Step 1: a file dropped or chosen, or JSON pasted — with the example and field reference at hand. */
export function PickStep({
  state,
  noun,
  fields,
  template,
  templateFilename,
}: {
  state: BulkImportState;
  noun: string;
  fields: FieldDoc[];
  template: string;
  templateFilename: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  return (
    <div className="hgbulk">
      <label
        className={`hgbulk-drop${dragging ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void state.readFile(file);
        }}
      >
        <input
          type="file"
          accept=".json,application/json"
          aria-label="JSON 파일 선택"
          className="hgins-sr"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void state.readFile(file);
            e.target.value = "";
          }}
        />
        <span className="hgbulk-drop__icon" aria-hidden>
          <FileJson size={26} strokeWidth={1.8} />
        </span>
        <span className="hgbulk-drop__title">
          {state.checking ? "파일을 확인하는 중…" : "JSON 파일을 여기에 끌어다 놓거나, 눌러서 고르세요"}
        </span>
        <span className="hgbulk-drop__hint">
          {noun} 목록이 담긴 .json 파일 · 한 번에 최대 {MAX_ITEMS.toLocaleString()}건 · 올리면 저장 전에 한 줄씩 확인해요
        </span>
      </label>
      {state.parseError && (
        <p className="hgadm-field__error hgadm-mt-12" role="alert">
          {state.parseError}
        </p>
      )}

      <div className="hgbulk-help">
        <Button size="sm" variant="secondary" onClick={() => downloadJson(template, templateFilename)}>
          <Download size={15} strokeWidth={2} aria-hidden />
          예시 파일 받기
        </Button>
        <span className="hgins-cta__hint">예시 파일을 열어 같은 모양으로 채운 뒤 올리면 돼요. 각 항목의 뜻은 아래 설명에 있어요.</span>
      </div>

      <details className="hgins-more">
        <summary>항목 설명 보기 ({fields.length}개)</summary>
        <div className="hgins-more__body">
          <FieldReference fields={fields} />
        </div>
      </details>

      <details className="hgins-more">
        <summary>파일 대신 직접 붙여넣기</summary>
        <div className="hgins-more__body">
          <Textarea
            className="hgadm-mono hgadm-text-sm"
            rows={10}
            value={pasted}
            aria-label="JSON 붙여넣기"
            spellCheck={false}
            placeholder={template}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="hgadm-row hgadm-row--end hgadm-mt-8">
            <Button
              size="sm"
              variant="primary"
              disabled={!pasted.trim()}
              loading={state.checking}
              onClick={() => state.load(pasted, "붙여넣은 내용")}
            >
              확인하기
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

const NEED_TONE = (need: string) => (need === "필수" ? "danger" : need === "선택" ? "neutral" : "info");

function FieldReference({ fields }: { fields: FieldDoc[] }) {
  return (
    <table className="hgadm-table hgbulk-fields">
      <thead>
        <tr>
          <th>항목</th>
          <th>필요</th>
          <th>뜻</th>
          <th>예시</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((fd) => (
          <tr key={fd.name}>
            <td className="hgadm-cell-mono">{fd.name}</td>
            <td>
              <Badge tone={NEED_TONE(fd.need)}>{fd.need}</Badge>
            </td>
            <td>{fd.meaning}</td>
            <td className="hgadm-cell-mono">{fd.example ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
