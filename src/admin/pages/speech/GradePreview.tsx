import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Badge, Button, Card, Field, Input, Textarea } from "../../components/kit";
import { Notice } from "../../components/insights";
import { speechApi } from "../../speechApi";
import type { GradeMode, GradeRequest } from "../../speechApi";
import { errorMessage } from "../../../lib/http";
import { Facts } from "./Facts";
import { verdictText } from "./labels";

const MODES: { value: GradeMode; label: string; hint: string }[] = [
  { value: "reading", label: "읽기 (reading)", hint: "발음 차이를 허용하고, 빠진 단어와 무관한 말을 가려냅니다." },
  { value: "exact", label: "정확히 (exact)", hint: "정규화한 뒤 완전히 같아야 정답입니다." },
];

export function GradePreview() {
  const [transcript, setTranscript] = useState("");
  const [expected, setExpected] = useState("");
  const [accepted, setAccepted] = useState("");
  const [mode, setMode] = useState<GradeMode>("reading");
  const grade = useMutation({ mutationFn: (body: GradeRequest) => speechApi.grade(body) });

  const submit = () => {
    grade.mutate({
      transcript,
      expected,
      accepted: accepted
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      mode,
    });
  };

  const result = grade.data;
  const verdict = result ? verdictText(result.verdict) : null;

  return (
    <section className="hgadm-speech__section" aria-labelledby="speech-grade-title">
      <div className="hgadm-speech__section-head">
        <h2 id="speech-grade-title">채점 미리보기</h2>
        <span className="hgadm-muted hgadm-text-xs">
          인식된 문장이 기대 답안과 어떻게 비교되는지 확인합니다. 학습 앱의 말하기 채점과 같은 규칙입니다.
        </span>
      </div>
      <div className="hgadm-speech__grid">
        <Card title="입력">
          <div className="hgadm-stack">
            <Field label="인식된 문장 (transcript)" required>
              <Input value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label="인식된 문장" />
            </Field>
            <Field label="기대 답안 (expected)" required>
              <Input value={expected} onChange={(e) => setExpected(e.target.value)} aria-label="기대 답안 문장" />
            </Field>
            <Field label="허용 답안 (accepted)" hint="한 줄에 하나씩. 비워 두어도 됩니다.">
              <Textarea rows={2} value={accepted} onChange={(e) => setAccepted(e.target.value)} aria-label="허용 답안" />
            </Field>
            <div className="hgadm-field">
              <span className="hgadm-field__label">채점 방식</span>
              <div className="hgadm-speech__seg" role="radiogroup" aria-label="채점 방식">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.value}
                    className={`hgadm-speech__seg-item ${mode === m.value ? "is-active" : ""}`}
                    onClick={() => setMode(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="hgadm-field__hint">{MODES.find((m) => m.value === mode)?.hint}</span>
            </div>
            <div className="hgadm-row">
              <Button variant="primary" onClick={submit} loading={grade.isPending} disabled={!expected.trim()}>
                채점
              </Button>
            </div>
          </div>
        </Card>
        <Card title="결과">
          {grade.isError ? (
            <Notice tone="danger" icon={AlertTriangle} title="채점하지 못했습니다">
              {errorMessage(grade.error)}
            </Notice>
          ) : result && verdict ? (
            <div className="hgadm-stack">
              <div className="hgadm-row hgadm-row--wrap">
                <Badge tone={verdict.tone} dot>{verdict.label}</Badge>
                <Badge tone={result.correct ? "success" : "neutral"}>{result.correct ? "정답 처리" : "오답 처리"}</Badge>
                <span className="hgadm-muted hgadm-text-xs">{MODES.find((m) => m.value === result.mode)?.label ?? result.mode}</span>
              </div>
              <p className="hgadm-m-0">{result.explanation}</p>
              <Facts
                items={[
                  ["유사도", result.similarity === null ? "—" : `${Math.round(result.similarity * 100)}%`],
                  result.pronunciation_score !== null && ["발음 점수", `${Math.round(result.pronunciation_score)} / 100`],
                ]}
              />
              <div className="hgadm-speech__compare">
                <span className="hgadm-speech__compare-label">인식</span>
                <Tokens tokens={result.normalized_transcript} />
                <span className="hgadm-speech__compare-label">기대</span>
                <Tokens tokens={result.normalized_expected} />
              </div>
            </div>
          ) : (
            <p className="hgadm-muted hgadm-text-sm hgadm-m-0">두 문장을 입력하고 '채점'을 누르면 결과가 여기에 나타납니다.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

function Tokens({ tokens }: { tokens: string[] }) {
  if (tokens.length === 0) return <span className="hgadm-muted">(없음)</span>;
  return (
    <span className="hgadm-speech__tokens">
      {tokens.map((tok, i) => (
        <span key={`${tok}-${i}`} className="hgadm-speech__token">
          {tok}
        </span>
      ))}
    </span>
  );
}
