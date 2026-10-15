import { useRef, useState } from "react";
import { adminApi } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";

/**
 * Click or drop an image to upload it through /admin/media (JPEG/PNG/WebP).
 *
 * The one upload control for course covers, series and lecture thumbnails and
 * banners: each used to carry its own copy of this state and error handling.
 * `onUploaded` receives the stored image's URL; a failure is shown as a toast.
 */
export function ImageDropzone({
  onUploaded,
  replacing = false,
  inputLabel,
  className = "",
  successMessage,
}: {
  onUploaded: (url: string) => void;
  /** An image is already set, so this replaces it (and says so). */
  replacing?: boolean;
  /** The file input's accessible name. */
  inputLabel?: string;
  className?: string;
  /** A toast after a successful upload, where the result is not otherwise visible. */
  successMessage?: string;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await adminApi.uploadMedia(file);
      onUploaded(result.url);
      if (successMessage) toast.success(successMessage);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={`hgadm-dropzone ${className}`.trim()}
      onClick={() => fileRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(e.dataTransfer.files?.[0]);
      }}
    >
      {uploading ? "업로드 중…" : `클릭하거나 끌어다 놓아 ${replacing ? "교체" : "업로드"}`}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={inputLabel}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </div>
  );
}
