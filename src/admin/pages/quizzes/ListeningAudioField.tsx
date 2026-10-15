import { useMutation } from "@tanstack/react-query";
import { adminApi } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { Field, Input } from "../../components/kit";

/**
 * The listening passage's MP3. A question gets its audio once it exists, so a
 * new question is saved first. The server validates the file (a real,
 * complete MP3) and measures it; its answer fills in the audio length, and a
 * rejected file's reason is shown as is.
 */
export function ListeningAudioField({
  quizId,
  canWrite,
  onUploaded,
}: {
  quizId: string | null;
  canWrite: boolean;
  onUploaded: (durationMs: number) => void;
}) {
  const toast = useToast();
  const toastError = useToastError();
  const upload = useMutation({
    mutationFn: (file: File) => adminApi.uploadQuizAudio(quizId as string, file),
    onSuccess: (quiz) => {
      onUploaded(quiz.audio_duration_ms);
      toast.success("듣기 음원을 올렸어요.");
    },
    onError: toastError,
  });

  if (!quizId) {
    return (
      <Field label="듣기 음원 (MP3)" hint="저장한 뒤 MP3를 올릴 수 있어요.">
        <Input type="file" accept="audio/mpeg,.mp3" disabled />
      </Field>
    );
  }
  return (
    <Field
      label="듣기 음원 (MP3)"
      hint={
        upload.isPending
          ? "파일을 확인하고 올리는 중…"
          : "새 파일을 올리면 기존 음원을 바꿔요. MP3만, 최대 20MB·30분. 서버가 파일을 검사해 길이를 채워요."
      }
    >
      <Input
        type="file"
        accept="audio/mpeg,.mp3"
        aria-label="듣기 음원 (MP3)"
        disabled={!canWrite || upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate(file);
        }}
      />
    </Field>
  );
}
