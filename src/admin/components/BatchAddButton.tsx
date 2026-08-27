import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { Button, Field, Modal, Textarea } from "./kit";

const MAX_ITEMS = 1000;

/**
 * JSON-paste bulk registration for content catalogs (sentences, TOPIK
 * questions). The admin pastes a JSON array of create payloads — typically
 * exported from a spreadsheet or produced by an LLM — previews the parsed
 * count, and submits everything as one atomic batch request: the server
 * saves all items or none, reporting failing indexes as `items[N]`.
 */
export function BatchAddButton({
  title,
  hint,
  template,
  submit,
  invalidateKeys,
}: {
  /** Modal title, e.g. "문장 일괄 추가". */
  title: string;
  /** One-line description of the expected payload shown above the editor. */
  hint: string;
  /** Pretty-printed example JSON the "예시 넣기" button inserts. */
  template: string;
  submit: (items: Record<string, unknown>[]) => Promise<{ created: number }>;
  /** React-Query keys to invalidate after a successful batch. */
  invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const parsed = useMemo(() => parseItems(text), [text]);

  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: (res) => {
      toast.success(`${res.created.toLocaleString()}건을 추가했어요.`);
      for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key });
      setOpen(false);
      setText("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ListPlus size={15} strokeWidth={2} />
        일괄 추가
      </Button>
      <Modal
        open={open}
        title={title}
        size="lg"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={mutation.isPending}
              disabled={parsed.items === null}
              onClick={() => parsed.items && mutation.mutate(parsed.items)}
            >
              {parsed.items ? `${parsed.items.length}건 추가` : "추가"}
            </Button>
          </>
        }
      >
        <Field
          label="JSON 배열"
          required
          hint={`${hint} 한 번에 최대 ${MAX_ITEMS.toLocaleString()}건. 한 건이라도 실패하면 아무것도 저장되지 않습니다.`}
        >
          <Textarea
            rows={14}
            value={text}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
            spellCheck={false}
            placeholder={template}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="hgadm-row" style={{ justifyContent: "space-between" }}>
          <Button size="sm" variant="ghost" onClick={() => setText(template)}>
            예시 넣기
          </Button>
          {text.trim() !== "" &&
            (parsed.error ? (
              <span className="hgadm-field__error">{parsed.error}</span>
            ) : (
              <span className="hgadm-cell-sub">{parsed.items?.length}건 인식됨</span>
            ))}
        </div>
      </Modal>
    </>
  );
}

function parseItems(text: string): {
  items: Record<string, unknown>[] | null;
  error: string | null;
} {
  if (!text.trim()) return { items: null, error: null };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { items: null, error: `JSON 문법 오류: ${(e as Error).message}` };
  }
  // Accept both a bare array and the request envelope { items: [...] }.
  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { items?: unknown }).items;
  }
  if (!Array.isArray(data)) return { items: null, error: "JSON 배열이어야 합니다." };
  if (data.length === 0) return { items: null, error: "항목이 비어 있습니다." };
  if (data.length > MAX_ITEMS)
    return {
      items: null,
      error: `한 번에 최대 ${MAX_ITEMS.toLocaleString()}건까지 추가할 수 있습니다.`,
    };
  if (!data.every((it) => it && typeof it === "object" && !Array.isArray(it)))
    return { items: null, error: "모든 항목은 JSON 객체여야 합니다." };
  return { items: data as Record<string, unknown>[], error: null };
}
