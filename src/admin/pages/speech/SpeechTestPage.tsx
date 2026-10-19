// 음성 인식 테스트: an operator's end-to-end check of the realtime speech
// pipeline (microphone → LiveKit → STT agent → API), the upload-only
// fallback, and the grading rules, all from the browser.
import { useAdminAuth } from "../../auth";
import { PipelineStatus } from "./PipelineStatus";
import { RealtimeTest } from "./RealtimeTest";
import { UploadTest } from "./UploadTest";
import { GradePreview } from "./GradePreview";

function microphoneSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function SpeechTestPage() {
  const { can } = useAdminAuth();
  const canWrite = can("settings:write");
  return (
    <div className="hgadm-speech">
      <div className="hgadm-page-head">
        <div>
          <h1>음성 인식 테스트</h1>
          <div className="hgadm-page-head__desc">
            마이크 캡처부터 음성 감지, 인식, 저장, 채점까지 실시간 음성 파이프라인이 끝까지 동작하는지 확인합니다. 활성 인식기와
            지연 시간, 오류를 그대로 보여 줍니다.
          </div>
        </div>
      </div>
      <PipelineStatus />
      <RealtimeTest canRun={microphoneSupported()} />
      <UploadTest canWrite={canWrite} />
      <GradePreview />
    </div>
  );
}
