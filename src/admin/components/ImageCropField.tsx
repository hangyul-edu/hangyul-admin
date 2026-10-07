import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  CARD_ASPECT_LABEL,
  CARD_ASPECT,
  CARD_MIN_SHARP_PX,
  CARD_RECOMMENDED_PX,
  cropAt,
  croppedImageStyle,
  resizeCropFromCorner,
  zoomAndCenterOf,
} from "../../lib/imageCrop";
import type { CropCorner, ImageCrop } from "../../lib/imageCrop";

const MAX_ZOOM = 4;
const CORNERS: CropCorner[] = ["nw", "ne", "sw", "se"];

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

type Drag =
  | { mode: "move"; from: { x: number; y: number }; center: { x: number; y: number } }
  | { mode: "resize"; corner: CropCorner; crop: ImageCrop };

/**
 * Choose which part of an uploaded image a Classes-tab carousel card shows.
 *
 * Left: the whole upload with the card-shaped (15:8) area over it; what lies
 * outside is dimmed. Drag the area to move it, drag a corner to resize it,
 * or click elsewhere on the image to move it there (arrow keys and +/− work
 * too). Right, updating as you go: the card as the app draws it, with the
 * same `croppedImageStyle`. `value` null means "not chosen": the app's
 * centred cover crop, which is also where the editor starts.
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const whereId = useId();

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
  const area = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };

  const set = (nextZoom: number, nextCenter: { x: number; y: number }) =>
    onChange(cropAt(natural, nextZoom, nextCenter));

  /** The pointer as fractions of the image (it may run past its edges). */
  function at(e: PointerEvent<HTMLDivElement>) {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = at(e);
    const corner = (e.target as HTMLElement).dataset.corner as CropCorner | undefined;
    if (corner) {
      drag.current = { mode: "resize", corner, crop };
      return;
    }
    const inside = p.x >= crop.x && p.x <= crop.x + crop.width && p.y >= crop.y && p.y <= crop.y + crop.height;
    // A click outside the area brings the area there, then drags on from it.
    const from = inside ? center : p;
    if (!inside) set(zoom, p);
    drag.current = { mode: "move", from: p, center: from };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    if (d.mode === "resize") onChange(resizeCropFromCorner(natural!, d.crop, d.corner, p, MAX_ZOOM));
    else set(zoom, { x: d.center.x + p.x - d.from.x, y: d.center.y + p.y - d.from.y });
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
    const zooms: Record<string, number> = { "+": 0.1, "=": 0.1, "-": -0.1, _: -0.1 };
    if (moves[e.key]) {
      e.preventDefault();
      set(zoom, { x: center.x + moves[e.key][0], y: center.y + moves[e.key][1] });
    } else if (zooms[e.key]) {
      e.preventDefault();
      set(Math.min(MAX_ZOOM, Math.max(1, zoom + zooms[e.key])), center);
    }
  }

  return (
    <div className="hgadm-crop">
      <div className="hgadm-crop__editor">
        <div className="hgadm-crop__label">보일 영역 고르기</div>
        <div className="hgadm-crop__stage">
          <div
            ref={canvasRef}
            className="hgadm-crop__canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={imageUrl} alt="올린 이미지 전체" draggable={false} />
            <div className="hgadm-crop__shade" aria-hidden="true">
              <span style={area} />
            </div>
            <div
              className="hgadm-crop__box"
              role="group"
              tabIndex={0}
              aria-label="노출 영역 (드래그해 옮기고, 모서리를 끌어 크기 조절 · 방향키로 이동, +/−로 확대·축소)"
              aria-describedby={whereId}
              style={area}
              onKeyDown={onKeyDown}
            >
              <span id={whereId} className="hgadm-crop__where">
                가로 {Math.round(crop.x * 100)}%, 세로 {Math.round(crop.y * 100)}%에서 시작, {zoom.toFixed(1)}배
              </span>
              <span className="hgadm-crop__thirds" aria-hidden="true" />
              {CORNERS.map((c) => (
                <span key={c} className={`hgadm-crop__handle is-${c}`} data-corner={c} aria-hidden="true" />
              ))}
            </div>
          </div>
        </div>
        <p className="hgadm-crop__help">
          밝은 영역이 앱에 보여요. 영역을 끌어 옮기고, 모서리를 끌어 크기를 바꾸거나, 이미지의 다른 곳을 눌러 그리로
          옮기세요.
        </p>
      </div>

      <div className="hgadm-crop__side">
        <div className="hgadm-crop__label">앱에서 보이는 모습</div>
        {/* The Classes-tab band and card, scaled down: same shape, corner and
            shadow, drawn with the app's own crop style. */}
        <div className="hgadm-crop__band">
          <div className="hgadm-crop__card">
            <img src={imageUrl} alt="앱 카드 미리보기" draggable={false} style={croppedImageStyle(crop)} />
          </div>
        </div>

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

        <div className="hgadm-crop__meta">
          <span>올린 이미지 {natural.width} × {natural.height}px</span>
          <span>앱에 보이는 영역 {shownPx.width} × {shownPx.height}px</span>
          {fits ? (
            <span className="hgadm-crop__ok">권장 비율과 같아 그대로 맞아요.</span>
          ) : (
            <span className="hgadm-crop__warn">
              비율이 {CARD_ASPECT_LABEL}와 달라 일부만 보여요. 왼쪽에서 보일 영역을 고르세요.
            </span>
          )}
          {soft && (
            <span className="hgadm-crop__warn">
              보이는 영역이 {CARD_MIN_SHARP_PX.width}px보다 좁아 휴대폰에서 흐리게 보일 수 있어요.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
