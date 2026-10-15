import { useState } from "react";
import type { PlanSummary } from "../../catalogImportApi";
import { Button, Field, Input, Modal } from "../../components/kit";
import { n } from "./model";
import { Fact } from "./parts";

/**
 * The last gate before an import: the database's name typed back, a backup
 * confirmed, and (when the curriculum is incomplete) consent to create it.
 * Mounted only while open, so every opening starts unchecked.
 */
export function ConfirmImportDialog({
  database,
  plan,
  autoPublish,
  needsSeed,
  importing,
  onImport,
  onClose,
}: {
  database: string;
  plan: PlanSummary | undefined;
  autoPublish: boolean;
  needsSeed: boolean;
  importing: boolean;
  onImport: (confirm: { confirm_database: string; backup_confirmed: boolean; seed_curriculum: boolean }) => void;
  onClose: () => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [backup, setBackup] = useState(false);
  const [seed, setSeed] = useState(false);
  const nameMatches = typedName === database;
  const canConfirm = nameMatches && backup && (!needsSeed || seed);
  return (
    <Modal
      open
      title="앱에 콘텐츠 반영"
      onClose={importing ? () => {} : onClose}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importing}>
            취소
          </Button>
          <Button
            variant="danger"
            loading={importing}
            disabled={!canConfirm}
            onClick={() => onImport({ confirm_database: typedName, backup_confirmed: backup, seed_curriculum: seed })}
          >
            반영하기
          </Button>
        </>
      }
    >
      <div className="hgins-facts hgadm-mb-12">
        <Fact label="새로 추가" value={n(plan?.counts.create)} tone="brand" />
        <Fact label="내용 변경" value={n(plan?.counts.update)} tone="brand" />
      </div>
      <ul className="hgins-list hgadm-mt-0 hgadm-mb-16">
        <li>연습 문항은 {autoPublish ? "바로 회원에게 공개돼요" : "초안으로 저장돼요 (공개는 따로 해야 해요)"}.</li>
        <li>오디오가 아직 없는 듣기 문항과 모의고사·평가 자료는 공개하지 않고 보류해요.</li>
        <li>한 번에 처리되므로 실패하면 아무것도 바뀌지 않아요.</li>
      </ul>
      <Field
        label={`실수를 막기 위해 데이터베이스 이름(${database})을 그대로 입력하세요`}
        error={typedName && !nameMatches ? "이름이 일치하지 않아요." : null}
      >
        <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="off" aria-label="데이터베이스 이름" />
      </Field>
      <label className="hgadm-checkbox hgadm-checkbox--block hgadm-mt-8">
        <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
        반영 전에 이 데이터베이스를 백업했고, 복원할 수 있음을 확인했습니다.
      </label>
      {needsSeed && (
        <label className="hgadm-checkbox hgadm-checkbox--block hgadm-mt-8">
          <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
          빠진 커리큘럼 v1 스킬도 함께 만듭니다.
        </label>
      )}
    </Modal>
  );
}
