"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { CropPreset, CropRect } from "@/db/schema/media";
import { presetLabel, presetRatio } from "@/features/media/schema";

const MIN_WIDTH = 0.08;

/**
 * Picks the visible part of a photo for one crop preset (07 §8). The rectangle keeps the
 * preset's shape; it is stored as fractions of the image so it survives any resize.
 */
export function CropEditor({
  src,
  image,
  preset,
  value,
  onChange,
}: {
  src: string;
  image: { width: number; height: number };
  preset: CropPreset;
  value: CropRect;
  onChange: (rect: CropRect) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    start: CropRect;
  } | null>(null);

  // Height (as a fraction of the image) for a given width, keeping the preset's shape.
  const heightFor = (w: number) => (w * image.width) / (presetRatio[preset] * image.height);
  const maxWidth = Math.min(1, (presetRatio[preset] * image.height) / image.width);

  function clampRect(r: CropRect): CropRect {
    const w = Math.min(Math.max(r.w, MIN_WIDTH), maxWidth);
    const h = heightFor(w);
    return {
      x: Math.min(Math.max(r.x, 0), 1 - w),
      y: Math.min(Math.max(r.y, 0), 1 - h),
      w,
      h,
    };
  }

  function onPointerDown(e: PointerEvent<HTMLElement>, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: value };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    const box = frame.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.startX) / box.width;
    const dy = (e.clientY - d.startY) / box.height;
    if (d.mode === "move") {
      onChange(clampRect({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }));
    } else {
      // Resize from the top-left corner, which stays put.
      const w = Math.min(d.start.w + dx, 1 - d.start.x);
      const fitted = Math.min(w, maxWidth);
      const h = heightFor(fitted);
      const limited = d.start.y + h > 1 ? (1 - d.start.y) * (fitted / h) : fitted;
      onChange(clampRect({ ...d.start, w: limited }));
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key]!;
      onChange(clampRect({ ...value, x: value.x + mx, y: value.y + my }));
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      const grow = e.key === "-" ? -0.02 : 0.02;
      // Grow or shrink around the centre.
      const w = Math.min(Math.max(value.w + grow, MIN_WIDTH), maxWidth);
      const h = heightFor(w);
      onChange(
        clampRect({
          x: value.x + (value.w - w) / 2,
          y: value.y + (value.h - h) / 2,
          w,
          h,
        }),
      );
    }
  }

  // Physical left/top on purpose: image pixels do not mirror in right-to-left layouts.
  const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
  return (
    <div
      ref={frame}
      className="relative mx-auto max-h-[22rem] w-full touch-none overflow-hidden rounded-md bg-surface-muted select-none"
      style={{
        aspectRatio: `${image.width} / ${image.height}`,
        maxWidth: `calc(22rem * ${image.width / image.height})`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview of an uploaded file */}
      <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
      <div
        role="group"
        tabIndex={0}
        aria-label={`${presetLabel[preset]} crop. Drag to move, drag the corner to resize, or use the arrow keys and + / -.`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => onPointerDown(e, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute cursor-move outline-2 outline-offset-2 outline-white focus-visible:outline"
        style={{
          left: pct(value.x),
          top: pct(value.y),
          width: pct(value.w),
          height: pct(value.h),
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5), inset 0 0 0 2px #fff",
        }}
      >
        <span
          aria-hidden
          onPointerDown={(e) => onPointerDown(e, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-ink"
        />
      </div>
    </div>
  );
}
