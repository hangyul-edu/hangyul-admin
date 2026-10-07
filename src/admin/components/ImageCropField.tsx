import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  CARD_ASPECT,
  CARD_ASPECT_LABEL,
  CARD_MIN_SHARP_PX,
  CARD_RECOMMENDED_PX,
  cropAt,
  croppedImageStyle,
  zoomAndCenterOf,
} from "../../lib/imageCrop";
import type { ImageCrop } from "../../lib/imageCrop";

const MAX_ZOOM = 4;
const PREVIEW_WIDTH = 402; // the 335pt card at 1.2x

/** The upload guidance shown before and after an image is chosen. */
export function CardImageSizeHint() {
  return (
    <span>
      권장 크기 <strong>{CARD_RECOMMENDED_PX.width} × {CARD_RECOMMENDED_PX.height}px</strong> (비율{" "}
      {CARD_ASPECT_LABEL}, 앱 카드 335 × 178.67의 3배). 이 비율이면 잘리는 부분 없이 그대로 보여요.
      JPEG/PNG/WebP, 최대 5MB.
    </span>
  );
}

/**
 * Choose which part of an uploaded image a Classes-tab carousel card shows.
 *
 * The preview is the card's exact 15:8 shape, drawn the way the app draws it
 * (the same `croppedImageStyle`). Drag the picture (or use the arrow keys) to
 * move it; the slider zooms in. Below, the whole image with the chosen area
 * outlined. `value` null means "not chosen": the app's centred cover crop,
 * which is also where the editor starts.
 */
export function ImageCropField({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string;
  value: ImageCrop | null;
  onChange: (crop: ImageCrop | null) => void;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; center: { x: number; y: number } } | null>(null);

  useEffect(() => {
    setNatural(null);
    setFailed(false);
    const img = new Image();
    img.onload = () => setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setFailed(true);
    img.src = imageUrl;
  }, [imageUrl]);

  if (failed) return <p className="hgadm-cell-sub">이미지를 불러오지 못해 노출 영역을 고를 수 없어요.</p>;
  if (!natural) return <p className="hgadm-cell-sub">이미지 불러오는 중…</p>;

  const { zoom, center } = value ? zoomAndCenterOf(natural, value) : { zoom: 1, center: { x: 0.5, y: 0.5 } };
  const crop = value ?? cropAt(natural, 1, center);
  const imageAspect = natural.width / natural.height;
  const fits = Math.abs(imageAspect - CARD_ASPECT) / CARD_ASPECT < 0.01;
  const shownPx = { width: Math.round(crop.width * natural.width), height: Math.round(crop.height * natural.height) };
  const soft = shownPx.width < CARD_MIN_SHARP_PX.width;

  const set = (nextZoom: number, nextCenter: { x: number; y: number }) =>
    onChange(cropAt(natural, nextZoom, nextCenter));

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, center };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const box = e.currentTarget.getBoundingClientRect();
    // Moving the picture right shows more of its left: the centre moves left
    // by the dragged share of what the frame shows.
    const dx = ((e.clientX - start.x) / box.width) * crop.width;
    const dy = ((e.clientY - start.y) / box.height) * crop.height;
    set(zoom, { x: start.center.x - dx, y: start.center.y - dy });
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step * crop.width, 0],
      ArrowRight: [step * crop.width, 0],
      ArrowUp: [0, -step * crop.height],
      ArrowDown: [0, step * crop.height],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    set(zoom, { x: center.x + move[0], y: center.y + move[1] });
  }

  return (
    <div className="hgadm-crop">
      <div className="hgadm-crop__meta">
        <span>
          올린 이미지 {natural.width} × {natural.height}px · 앱에 보이는 영역 {shownPx.width} × {shownPx.height}px
        </span>
        {fits ? (
          <span className="hgadm-crop__ok">권장 비율과 같아 그대로 맞아요.</span>
        ) : (
          <span className="hgadm-crop__warn">
            비율이 {CARD_ASPECT_LABEL}와 달라 일부만 보여요. 아래에서 보일 부분을 드래그해 고르세요.
          </span>
        )}
        {soft && (
          <span className="hgadm-crop__warn">
            보이는 영역이 {CARD_MIN_SHARP_PX.width}px보다 좁아 휴대폰에서 흐리게 보일 수 있어요.
          </span>
        )}
      </div>

      <div
        className="hgadm-crop__frame"
        style={{ width: PREVIEW_WIDTH, aspectRatio: "15 / 8" }}
        role="slider"
        tabIndex={0}
        aria-label="노출 영역 위치 (드래그하거나 방향키로 이동)"
        aria-valuetext={`가로 ${Math.round(crop.x * 100)}%, 세로 ${Math.round(crop.y * 100)}%에서 시작`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <img src={imageUrl} alt="앱 카드 미리보기" draggable={false} style={croppedImageStyle(crop)} />
      </div>

      <div className="hgadm-crop__controls">
        <label className="hgadm-crop__zoom">
          확대
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => set(Number(e.target.value), center)}
          />
          <span>{zoom.toFixed(1)}×</span>
        </label>
        <button type="button" className="hgadm-crop__reset" onClick={() => onChange(null)} disabled={!value}>
          가운데 기본값으로
        </button>
      </div>

      <div className="hgadm-crop__overview" aria-hidden="true">
        <img src={imageUrl} alt="" draggable={false} />
        <span
          className="hgadm-crop__area"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
