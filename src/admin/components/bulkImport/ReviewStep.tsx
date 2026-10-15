import { Download, FileJson } from "lucide-react";
import type { BulkCheckResult, BulkCheckRow } from "../../api";
import { Badge, Button } from "../kit";
import { downloadJson } from "./files";
import type { BulkImportState, Filter } from "./useBulkImport";

/** Step 2: the server's verdict on every row, before anything is saved. */
export function ReviewStep({
  state,
  report,
  noun,
  templateFilename,
}: {
  state: BulkImportState;
  report: BulkCheckResult;
  noun: string;
  templateFilename: string;
}) {
  const { failed, filter, setFilter, skipDuplicates, setSkipDuplicates, shown } = state;
  const filters: [Filter, string][] = [
    ["all", `전체 ${report.total}`],
    ["errors", `오류·주의 ${report.rows.filter((r) => !r.ok || r.warnings.length).length}`],
    ["duplicates", `중복 ${report.rows.filter((r) => r.duplicate).length}`],
  ];
  return (
    <div className="hgbulk">
      <div className="hgins-cta__hint hgadm-mb-12">
        <FileJson className="hgadm-icon-inline" size={14} strokeWidth={2} aria-hidden /> {state.source} · 아직 저장하지 않았어요
      </div>
      <div className="hgins-facts hgadm-mb-12">
        <Fact label={`전체 ${noun}`} value={report.total} />
        <Fact label="추가할 수 있음" value={report.ready} tone={report.ready ? "good" : undefined} />
        <Fact label="오류" value={report.invalid} tone={report.invalid ? "bad" : undefined} hint={report.invalid ? "고쳐야 추가돼요" : "없음"} />
        <Fact label="중복" value={report.duplicates} hint={report.duplicates ? "파일 안이나 이미 등록된 것과 같아요" : "없음"} />
      </div>

      <div className="hgbulk-bar">
        <div className="hgins-seg" role="radiogroup" aria-label="보기">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              className={`hgins-seg__btn${filter === value ? " is-on" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {report.duplicates > 0 && (
          <label className="hgadm-checkbox">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} /> 중복은 건너뛰기
          </label>
        )}
        {failed.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadJson(JSON.stringify(failed, null, 2), `${templateFilename.replace(/\.json$/, "")}-오류.json`)}
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            오류 {failed.length}건 내려받기
          </Button>
        )}
      </div>

      <div className="hgbulk-rows">
        <table className="hgadm-table">
          <thead>
            <tr>
              <th className="hgbulk-col-no">#</th>
              <th>내용</th>
              <th className="hgbulk-col-status">상태</th>
              <th>확인할 점</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="hgadm-table__empty">해당하는 항목이 없어요.</div>
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.index}>
                <td className="hgadm-cell-mono">{r.index + 1}</td>
                <td>{r.summary || <span className="hgadm-cell-sub">(내용 없음)</span>}</td>
                <td>
                  <RowStatus row={r} skipDuplicates={skipDuplicates} />
                </td>
                <td>
                  <RowIssues row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.invalid > 0 && (
        <p className="hgins-cta__hint hgadm-mt-12">
          오류가 있는 {report.invalid.toLocaleString()}건은 추가되지 않아요. "오류 내려받기"로 그 줄만 받아 고친 뒤 다시 올리면 돼요.
        </p>
      )}
    </div>
  );
}

function RowIssues({ row }: { row: BulkCheckRow }) {
  if (row.errors.length + row.warnings.length === 0) return <span className="hgadm-cell-sub">—</span>;
  return (
    <ul className="hgbulk-issues">
      {row.errors.map((e) => (
        <li key={e} className="is-error">
          {e}
        </li>
      ))}
      {row.warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

function RowStatus({ row, skipDuplicates }: { row: BulkCheckRow; skipDuplicates: boolean }) {
  if (!row.ok) return <Badge tone="danger">오류</Badge>;
  if (row.duplicate === "in_file")
    return (
      <div>
        <Badge tone="warning">파일 안 중복</Badge>
        <div className="hgadm-cell-sub">
          {(row.duplicate_of ?? 0) + 1}번과 같음{skipDuplicates ? " · 건너뜀" : ""}
        </div>
      </div>
    );
  if (row.duplicate === "existing")
    return (
      <div>
        <Badge tone="warning">이미 등록됨</Badge>
        {skipDuplicates && <div className="hgadm-cell-sub">건너뜀</div>}
      </div>
    );
  return <Badge tone="success">추가 가능</Badge>;
}

function Fact({ label, value, tone, hint }: { label: string; value: number; tone?: "good" | "bad"; hint?: string }) {
  return (
    <div className={`hgins-fact${tone ? ` hgins-fact--${tone}` : ""}`}>
      <div className="hgins-fact__label">{label}</div>
      <div className="hgins-fact__value">{value.toLocaleString()}</div>
      {hint && <div className="hgins-fact__hint">{hint}</div>}
    </div>
  );
}
