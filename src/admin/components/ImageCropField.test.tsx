import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ImageCropField } from "./ImageCropField";
import type { ImageCrop } from "../../lib/imageCrop";

// jsdom never loads images: report a fixed natural size instead.
let naturalSize = { width: 1200, height: 800 };
class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    this.naturalWidth = naturalSize.width;
    this.naturalHeight = naturalSize.height;
    queueMicrotask(() => this.onload?.());
  }
}

// jsdom has no PointerEvent: give pointer events their coordinates.
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

const RealImage = globalThis.Image;
const RealPointerEvent = globalThis.PointerEvent;
beforeEach(() => {
  (globalThis as { Image: unknown }).Image = FakeImage;
  (globalThis as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
});
afterEach(() => {
  (globalThis as { Image: unknown }).Image = RealImage;
  (globalThis as { PointerEvent: unknown }).PointerEvent = RealPointerEvent;
});

const lastCrop = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0] as ImageCrop;

function Harness({ initial = null, onChange }: { initial?: ImageCrop | null; onChange: (c: ImageCrop | null) => void }) {
  const [value, setValue] = useState<ImageCrop | null>(initial);
  return (
    <ImageCropField
      imageUrl="https://cdn.example.com/photo.png"
      value={value}
      onChange={(c) => {
        setValue(c);
        onChange(c);
      }}
    />
  );
}

describe("ImageCropField", () => {
  it("warns when the upload's ratio differs from 15:8 and shows its size", async () => {
    naturalSize = { width: 1200, height: 800 };
    render(<Harness onChange={vi.fn()} />);
    expect(await screen.findByText(/올린 이미지 1200 × 800px/)).toBeInTheDocument();
    expect(screen.getByText(/비율이 15:8와 달라 일부만 보여요/)).toBeInTheDocument();
  });

  it("says an exact 15:8 upload fits as it is", async () => {
    naturalSize = { width: 1005, height: 536 };
    render(<Harness onChange={vi.fn()} />);
    expect(await screen.findByText("권장 비율과 같아 그대로 맞아요.")).toBeInTheDocument();
  });

  it("flags an upload too small to stay sharp", async () => {
    naturalSize = { width: 500, height: 267 };
    render(<Harness onChange={vi.fn()} />);
    expect(await screen.findByText(/흐리게 보일 수 있어요/)).toBeInTheDocument();
  });

  it("zooms with the slider, moves with the arrow keys, and resets to the centred default", async () => {
    naturalSize = { width: 1600, height: 900 };
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(await screen.findByRole("slider", { name: /확대/ }), { target: { value: "2" } });
    const zoomed = lastCrop(onChange);
    expect(zoomed.width).toBeLessThan(1);

    const area = screen.getByRole("group", { name: /노출 영역/ });
    fireEvent.keyDown(area, { key: "ArrowRight", shiftKey: true });
    const moved = lastCrop(onChange);
    expect(moved.x).toBeGreaterThan(zoomed.x);
    expect(moved.width).toBeCloseTo(zoomed.width, 5);
    fireEvent.keyDown(area, { key: "+" });
    expect(lastCrop(onChange).width).toBeLessThan(moved.width);

    fireEvent.click(screen.getByRole("button", { name: "가운데 기본값으로" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  describe("on the whole image, with the app card beside it", () => {
    // The image drawn 400 x 225 (1600 x 900 at a quarter).
    async function editor(initial: ImageCrop | null, onChange = vi.fn()) {
      naturalSize = { width: 1600, height: 900 };
      render(<Harness initial={initial} onChange={onChange} />);
      const area = await screen.findByRole("group", { name: /노출 영역/ });
      const canvas = area.parentElement as HTMLDivElement;
      canvas.getBoundingClientRect = () => ({ width: 400, height: 225, x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 225, toJSON: () => ({}) });
      return { area, canvas, onChange, preview: screen.getByAltText("앱 카드 미리보기") };
    }

    it("outlines the shown area on the image and draws the same area in the card preview", async () => {
      const { area, preview } = await editor({ x: 0.4, y: 0, width: 0.5, height: 0.5 * (16 / 9) / (15 / 8) });
      expect(area.style.left).toBe("40%");
      expect(area.style.width).toBe("50%");
      // The preview is the app's own crop style: 1/0.5 = 200% wide, shifted 80%.
      expect(preview.style.width).toBe("200%");
      expect(preview.style.left).toBe("-80%");
    });

    it("dragging the area moves it the same way, and the preview follows", async () => {
      const { area, canvas, onChange, preview } = await editor({ x: 0.2, y: 0, width: 0.5, height: 0.5 * (16 / 9) / (15 / 8) });
      fireEvent.pointerDown(area, { clientX: 150, clientY: 50, pointerId: 1, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 230, clientY: 50, pointerId: 1 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
      const moved = lastCrop(onChange);
      expect(moved.x).toBeCloseTo(0.4, 4); // 80px of 400 = 20% to the right
      expect(moved.width).toBeCloseTo(0.5, 4);
      expect(preview.style.left).toBe("-80%");
    });

    it("dragging a corner resizes the area at 15:8 around the opposite corner", async () => {
      const start = { x: 0.2, y: 0.1, width: 0.5, height: 0.5 * (16 / 9) / (15 / 8) };
      const { canvas, onChange } = await editor(start);
      const se = canvas.querySelector('[data-corner="se"]') as HTMLElement;
      fireEvent.pointerDown(se, { clientX: 280, clientY: 130, pointerId: 1, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 240, clientY: 130, pointerId: 1 });
      const resized = lastCrop(onChange);
      expect(resized.x).toBeCloseTo(0.2, 4);
      expect(resized.y).toBeCloseTo(0.1, 4);
      expect(resized.width).toBeCloseTo(0.4, 4);
      expect((resized.width * 1600) / (resized.height * 900)).toBeCloseTo(15 / 8, 3);
    });

    it("clicking elsewhere on the image brings the area there", async () => {
      const { canvas, onChange } = await editor({ x: 0, y: 0, width: 0.5, height: 0.5 * (16 / 9) / (15 / 8) });
      fireEvent.pointerDown(canvas, { clientX: 300, clientY: 112.5, pointerId: 1, button: 0 });
      const moved = lastCrop(onChange);
      expect(moved.x + moved.width / 2).toBeCloseTo(0.75, 4);
      expect(moved.y + moved.height / 2).toBeCloseTo(0.5, 4);
    });
  });
});
