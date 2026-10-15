import { Check } from "lucide-react";
import type { AdminQuiz } from "../../api";
import { sanitizeHtml } from "../../../lib/sanitizeHtml";
import { Badge, Modal } from "../../components/kit";
import { FORMAT_LABEL } from "./draft";

/** A question as it reads, with its answer marked. */
export function QuizViewer({ quiz, onClose }: { quiz: AdminQuiz | null; onClose: () => void }) {
  return (
    <Modal open={quiz !== null} title="문제 상세" size="lg" onClose={onClose}>
      {quiz && (
        <div className="hgadm-prose">
          <div className="hgadm-row hgadm-row--wrap hgadm-mb-12">
            <Badge tone="info">{FORMAT_LABEL[quiz.answer_format]}</Badge>
            {quiz.topik_section && <Badge tone="brand">{quiz.topik_section}</Badge>}
            <Badge tone="neutral">{quiz.level}급</Badge>
            {quiz.is_ai_generated && <Badge tone="warning">AI 생성</Badge>}
          </div>
          <p className="hgadm-fw-700 hgadm-pre-wrap">{quiz.prompt}</p>
          {quiz.content_html && (
            <div
              className="hgadm-json hgadm-json--prose"
              // Often LLM-generated; sanitized so a hostile passage cannot run
              // script in an admin's session.
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(quiz.content_html) }}
            />
          )}
          {quiz.choices.length > 0 && (
            <ol className="hgadm-bullets hgadm-bullets--roomy">
              {quiz.choices.map((c) => (
                <li key={c.key}>
                  {c.text}
                  {quiz.correct_choice === c.key && (
                    <strong className="hgadm-row hgadm-success-line hgadm-answer-mark">
                      <Check size={15} strokeWidth={2.5} />
                      정답
                    </strong>
                  )}
                </li>
              ))}
            </ol>
          )}
          {quiz.blanks.length > 0 && (
            <ul className="hgadm-bullets hgadm-bullets--roomy">
              {quiz.blanks.map((b, i) => (
                <li key={i}>
                  {b.label || "빈칸"}: <strong>{b.answer ?? "(기준 채점)"}</strong>
                </li>
              ))}
            </ul>
          )}
          {quiz.explanation && (
            <>
              <hr className="hgadm-divider" />
              <div className="hgadm-field__label">해설</div>
              <p className="hgadm-pre-wrap">{quiz.explanation}</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
