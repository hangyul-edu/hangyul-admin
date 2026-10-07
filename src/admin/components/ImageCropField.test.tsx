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

    const frame = screen.getByRole("slider", { name: /노출 영역 위치/ });
    fireEvent.keyDown(frame, { key: "ArrowRight", shiftKey: true });
    const moved = lastCrop(onChange);
    expect(moved.x).toBeGreaterThan(zoomed.x);
    expect(moved.width).toBeCloseTo(zoomed.width, 5);

    fireEvent.click(screen.getByRole("button", { name: "가운데 기본값으로" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("drags the picture: moving it right shows more of its left", async () => {
    naturalSize = { width: 1600, height: 900 };
    const onChange = vi.fn();
    render(<Harness initial={{ x: 0.4, y: 0, width: 0.5, height: 1 }} onChange={onChange} />);
    const frame = await screen.findByRole("slider", { name: /노출 영역 위치/ });
    frame.getBoundingClientRect = () => ({ width: 402, height: 214.4, x: 0, y: 0, top: 0, left: 0, right: 402, bottom: 214.4, toJSON: () => ({}) });
    frame.setPointerCapture = vi.fn();
    fireEvent.pointerDown(frame, { clientX: 200, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    const dragged = lastCrop(onChange);
    expect(dragged.x).toBeLessThan(0.4);
  });
});
