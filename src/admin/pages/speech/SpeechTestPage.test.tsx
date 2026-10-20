import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SpeechTestPage } from "./SpeechTestPage";
import { speechApi } from "../../speechApi";
import type { GradeResult, SpeechSession, SpeechStatus } from "../../speechApi";
import { ApiError } from "../../../lib/http";

vi.mock("../../speechApi", () => ({
  speechApi: {
    status: vi.fn(),
    availability: vi.fn(),
    openSession: vi.fn(),
    endSession: vi.fn(),
    sessionTranscripts: vi.fn(),
    transcribe: vi.fn(),
    grade: vi.fn(),
  },
}));

let scopes: string[] = ["settings:read", "settings:write"];
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: null,
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

/** A LiveKit room under the test's control: `on` records the handlers the hook registers. */
const lk = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  connect: vi.fn(),
  disconnect: vi.fn(),
  switchActiveDevice: vi.fn(),
  setMicrophoneEnabled: vi.fn(),
  publishData: vi.fn(),
  getLocalDevices: vi.fn(),
}));

vi.mock("livekit-client", () => {
  class Room {
    localParticipant = { setMicrophoneEnabled: lk.setMicrophoneEnabled, publishData: lk.publishData };
    connect = lk.connect;
    disconnect = lk.disconnect;
    switchActiveDevice = lk.switchActiveDevice;
    on(event: string, fn: (...args: unknown[]) => void) {
      lk.handlers[event] = fn;
      return this;
    }
    static getLocalDevices = lk.getLocalDevices;
  }
  return {
    Room,
    RoomEvent: {
      DataReceived: "dataReceived",
      Disconnected: "disconnected",
      MediaDevicesError: "mediaDevicesError",
      Reconnecting: "reconnecting",
    },
  };
});

const api = vi.mocked(speechApi);

function status(over: Partial<SpeechStatus> = {}): SpeechStatus {
  return {
    stt: {
      provider: "whisper_local",
      requested: "auto",
      reason: "auto_no_external_key",
      is_fallback: false,
      model: "large-v3-turbo",
      device: "cpu",
      compute_type: "int8",
      loaded: true,
      load_seconds: 3.4,
      load_error: null,
      beam_size: 1,
      max_concurrency: 1,
    },
    pronunciation: { provider: "mock", azure_configured: false },
    livekit: { configured: true, url: "ws://localhost:7880", reachable: true, latency_ms: 11, error: null, rooms: 0 },
    agent: {
      online: true,
      workers: [
        {
          worker_id: "host-123",
          provider: "whisper_local",
          model: "large-v3-turbo",
          model_loaded: true,
          started_at: "2026-10-19T13:36:29+00:00",
          last_seen_at: "2026-10-19T13:40:00+00:00",
          version: "1.0.0",
          hostname: "host",
          rooms_active: 0,
        },
      ],
      shared_secret_configured: true,
    },
    recent: {
      window_minutes: 60,
      transcripts: 3,
      recognised: 3,
      no_speech: 0,
      failed: 0,
      avg_latency_ms: 4046,
      last_error: null,
      last_transcript_at: "2026-10-19T13:39:00+00:00",
    },
    checked_at: "2026-10-19T13:40:10+00:00",
    ...over,
  };
}

function session(): SpeechSession {
  return {
    session_id: "spch_abc",
    room: "speech-spch_abc",
    url: "ws://localhost:7880",
    token: "jwt-token",
    identity: "user_admin",
    data_topic: "hangyul.speech",
    expires_at: "2026-10-19T14:40:10+00:00",
    provider: {
      provider: "whisper_local",
      model: "large-v3-turbo",
      requested: "auto",
      reason: "auto_no_external_key",
      is_fallback: false,
      loaded: true,
      device: "cpu",
      compute_type: "int8",
    },
    agent_online: true,
    agents: [],
  };
}

function gradeResult(over: Partial<GradeResult> = {}): GradeResult {
  return {
    mode: "reading",
    correct: true,
    verdict: "correct",
    similarity: 0.97,
    pronunciation_score: null,
    normalized_transcript: ["안녕하세요"],
    normalized_expected: ["안녕하세요"],
    explanation: "기대 답안과 일치합니다.",
    ...over,
  };
}

/** What the agent would publish on the room's data topic. */
function agentMessage(msg: Record<string, unknown>, topic = "hangyul.speech") {
  act(() => {
    lk.handlers.dataReceived(new TextEncoder().encode(JSON.stringify(msg)), undefined, undefined, topic);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/speech-test"]}>
        <SpeechTestPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scopes = ["settings:read", "settings:write"];
  for (const fn of Object.values(api)) fn.mockReset();
  for (const fn of [lk.connect, lk.disconnect, lk.switchActiveDevice, lk.setMicrophoneEnabled, lk.getLocalDevices]) fn.mockReset();
  for (const key of Object.keys(lk.handlers)) delete lk.handlers[key];
  api.status.mockResolvedValue(status());
  api.sessionTranscripts.mockResolvedValue({ session_id: "spch_abc", transcripts: [], last_seq: 0 });
  api.endSession.mockResolvedValue(undefined);
  lk.getLocalDevices.mockResolvedValue([{ deviceId: "mic-1", label: "내장 마이크", kind: "audioinput", groupId: "g" }]);
  lk.connect.mockResolvedValue(undefined);
  lk.disconnect.mockResolvedValue(undefined);
  lk.setMicrophoneEnabled.mockResolvedValue(undefined);
  lk.switchActiveDevice.mockResolvedValue(true);
  // jsdom has no media devices; the page only needs to know capture exists.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
});

describe("파이프라인 상태", () => {
  it("shows the active recogniser, LiveKit, the agent and the last hour", async () => {
    renderPage();
    expect((await screen.findAllByText("로컬 Whisper")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("large-v3-turbo").length).toBeGreaterThan(0);
    expect(screen.getByText(/외부 서비스 키가 없어 로컬 Whisper를 사용합니다/)).toBeInTheDocument();
    expect(screen.getByText("cpu · int8")).toBeInTheDocument();
    expect(screen.getByText("ws://localhost:7880")).toBeInTheDocument();
    expect(screen.getByText("연결 가능")).toBeInTheDocument();
    expect(screen.getByText("11 ms")).toBeInTheDocument();
    expect(screen.getByText("온라인")).toBeInTheDocument();
    expect(screen.getByText("host")).toBeInTheDocument();
    expect(screen.getByText("모델 로드 완료")).toBeInTheDocument();
    // Internal identifiers stay off the page.
    expect(screen.queryByText("host-123")).not.toBeInTheDocument();
    expect(screen.queryByText("auto")).not.toBeInTheDocument();
    expect(screen.getByText("4,046 ms")).toBeInTheDocument();
    expect(screen.queryByText(/모의 인식기: 실제 음성을 인식하지 않습니다/)).not.toBeInTheDocument();
  });

  it("warns in red when the mock recogniser is active", async () => {
    api.status.mockResolvedValue(
      status({
        stt: { provider: "mock", requested: "mock", reason: "mock_allowed", is_fallback: false, model: null },
      }),
    );
    renderPage();
    const warning = await screen.findByText("모의 인식기: 실제 음성을 인식하지 않습니다");
    expect(warning.closest(".hgins-notice")).toHaveClass("hgins-notice--danger");
  });
});

describe("실시간 마이크 테스트", () => {
  it("opens a session, joins the room and logs a transcript with its grade", async () => {
    const user = userEvent.setup();
    api.openSession.mockResolvedValue(session());
    api.grade.mockResolvedValue(gradeResult());
    renderPage();
    await screen.findAllByText("로컬 Whisper");

    await user.type(screen.getByLabelText("기대 답안"), "안녕하세요");
    await user.click(screen.getByRole("button", { name: "시작" }));

    await waitFor(() => expect(api.openSession).toHaveBeenCalled());
    await waitFor(() => expect(lk.connect).toHaveBeenCalledWith("ws://localhost:7880", "jwt-token"));
    await waitFor(() => expect(lk.setMicrophoneEnabled).toHaveBeenCalledWith(true));
    expect(await screen.findByText("듣는 중")).toBeInTheDocument();
    // The session is summarised by what matters (recogniser, agent, expiry); its ids are not shown.
    const info = screen.getByRole("group", { name: "세션 정보" });
    expect(within(info).getByText("로컬 Whisper")).toBeInTheDocument();
    expect(within(info).getByText("large-v3-turbo")).toBeInTheDocument();
    expect(within(info).getByText("온라인")).toBeInTheDocument();
    expect(screen.queryByText("spch_abc")).not.toBeInTheDocument();
    expect(screen.queryByText("speech-spch_abc")).not.toBeInTheDocument();
    expect(screen.queryByText("hangyul.speech")).not.toBeInTheDocument();
    expect(lk.handlers.dataReceived).toBeTypeOf("function");

    agentMessage({ type: "vad", state: "speaking" });
    expect(screen.getByText("말하는 중")).toBeInTheDocument();
    agentMessage({ type: "vad_level", probability: 0.8, speaking: true });
    expect(screen.getByLabelText("음성 확률")).toHaveValue(0.8);
    agentMessage({ type: "vad", state: "silence", speech_ms: 928 });
    agentMessage({ type: "transcribing", utterance_id: "utt-1", audio_duration_ms: 1804 });
    expect(screen.getByText("인식 중")).toBeInTheDocument();
    agentMessage({
      type: "transcript",
      utterance_id: "utt-1",
      transcript_id: "trn_1",
      seq: 1,
      delivered: true,
      text: "안녕하세요.",
      status: "ok",
      error: null,
      provider: "whisper_local",
      model: "large-v3-turbo",
      confidence: 0.83,
      latency_ms: 4256,
      audio_duration_ms: 1804,
      speech_ms: 928,
    });

    const row = (await screen.findByText("안녕하세요.")).closest("tr")!;
    expect(within(row).getByText("4,256 ms")).toBeInTheDocument();
    expect(within(row).getByText("83%")).toBeInTheDocument();
    expect(within(row).queryByText("trn_1")).not.toBeInTheDocument();
    expect(within(row).getByText("저장됨")).toBeInTheDocument();
    expect(within(row).getByText("인식됨")).toBeInTheDocument();
    expect(await within(row).findByText("정답")).toBeInTheDocument();
    expect(api.grade).toHaveBeenCalledWith({ transcript: "안녕하세요.", expected: "안녕하세요", accepted: [], mode: "reading" });
    // The browser-measured end-to-end latency is a number of milliseconds, not a dash.
    expect(within(row).getByText(/^종단 [\d,]+ ms$/)).toBeInTheDocument();
    expect(screen.getByText("듣는 중")).toBeInTheDocument();

    // A message on another topic is not the agent's.
    agentMessage({ type: "transcript", utterance_id: "x", text: "무시" }, "other.topic");
    expect(screen.queryByText("무시")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "중지" }));
    // The agent is told the take is over before the microphone is muted, and
    // the room is left only once it confirms nothing is still being transcribed.
    await waitFor(() => expect(lk.publishData).toHaveBeenCalledTimes(1));
    expect(JSON.parse(new TextDecoder().decode(lk.publishData.mock.calls[0][0] as Uint8Array))).toEqual({ type: "stop" });
    expect(lk.publishData.mock.calls[0][1]).toEqual({ reliable: true, topic: "hangyul.speech" });
    await waitFor(() => expect(lk.setMicrophoneEnabled).toHaveBeenCalledWith(false));
    expect(lk.disconnect).not.toHaveBeenCalled();
    agentMessage({ type: "stopped", in_flight: 0 });
    await waitFor(() => expect(lk.disconnect).toHaveBeenCalled());
    await waitFor(() => expect(api.endSession).toHaveBeenCalledWith("spch_abc"));
    expect(await screen.findByText("대기")).toBeInTheDocument();
  });

  it("logs an undelivered or failed transcript as an error", async () => {
    const user = userEvent.setup();
    api.openSession.mockResolvedValue(session());
    renderPage();
    await screen.findAllByText("로컬 Whisper");
    await user.click(screen.getByRole("button", { name: "시작" }));
    await screen.findByText("듣는 중");
    expect(screen.queryByText(/^오류 \(\d+\)$/)).not.toBeInTheDocument();

    agentMessage({
      type: "transcript",
      utterance_id: "utt-9",
      transcript_id: null,
      seq: null,
      delivered: false,
      text: "",
      status: "failed",
      error: "model crashed",
      provider: "whisper_local",
      model: "large-v3-turbo",
      confidence: null,
      latency_ms: null,
      audio_duration_ms: 500,
      speech_ms: 300,
    });
    expect(screen.getByText("저장 실패")).toBeInTheDocument();
    expect(screen.getByText("오류 (2)")).toBeInTheDocument();
    expect(screen.getByText(/인식 결과를 API에 저장하지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByText("인식 실패: model crashed")).toBeInTheDocument();
    expect(screen.queryByText(/utt-9/)).not.toBeInTheDocument();
    expect(api.grade).not.toHaveBeenCalled();
  });

  it("offers the upload test when realtime speech is unavailable", async () => {
    const user = userEvent.setup();
    api.openSession.mockRejectedValue(new ApiError(503, "speech.realtime_unavailable", "LiveKit is not configured"));
    renderPage();
    await screen.findAllByText("로컬 Whisper");
    await user.click(screen.getByRole("button", { name: "시작" }));

    expect(await screen.findByText("실시간 음성 서버를 쓸 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText(/아래 녹음 업로드 테스트로 인식기만 따로 확인할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/LiveKit 실시간 음성 서버에 연결할 수 없어요/)).toBeInTheDocument();
    expect(lk.connect).not.toHaveBeenCalled();
    expect(screen.getByText("오류")).toBeInTheDocument();
  });
});

describe("녹음 업로드 테스트", () => {
  it("explains why it is off without settings:write", async () => {
    scopes = ["settings:read"];
    renderPage();
    await screen.findAllByText("로컬 Whisper");
    expect(screen.getByRole("button", { name: "녹음 시작" })).toBeDisabled();
    expect(screen.getByText(/settings:write 권한이 필요합니다/)).toBeInTheDocument();
  });
});

describe("채점 미리보기", () => {
  it("renders the verdict, similarity and normalized forms", async () => {
    const user = userEvent.setup();
    api.grade.mockResolvedValue(
      gradeResult({
        correct: false,
        verdict: "missed_words",
        similarity: 0.62,
        normalized_transcript: ["안녕하세요"],
        normalized_expected: ["안녕하세요", "반갑습니다"],
        explanation: "기대 답안의 일부 단어가 빠졌습니다.",
      }),
    );
    renderPage();
    await screen.findAllByText("로컬 Whisper");

    await user.type(screen.getByLabelText("인식된 문장"), "안녕하세요");
    await user.type(screen.getByLabelText("기대 답안 문장"), "안녕하세요 반갑습니다");
    await user.click(screen.getByRole("radio", { name: "정확히 (exact)" }));
    await user.click(screen.getByRole("button", { name: "채점" }));

    expect(await screen.findByText("단어 누락")).toBeInTheDocument();
    expect(api.grade).toHaveBeenCalledWith({
      transcript: "안녕하세요",
      expected: "안녕하세요 반갑습니다",
      accepted: [],
      mode: "exact",
    });
    expect(screen.getByText("기대 답안의 일부 단어가 빠졌습니다.")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("반갑습니다")).toBeInTheDocument();
    expect(screen.getByText("오답 처리")).toBeInTheDocument();
    // The result shows the mode it was graded in as a label, not the raw code.
    expect(screen.getByText("읽기 (reading)", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("missed_words")).not.toBeInTheDocument();
  });
});
