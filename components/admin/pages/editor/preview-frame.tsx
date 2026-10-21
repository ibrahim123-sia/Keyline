"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { EditorMessage, PreviewMessage } from "@/components/site/preview-bridge";

export type Device = "desktop" | "tablet" | "phone";

export const deviceWidths: Record<Device, number> = { desktop: 1280, tablet: 834, phone: 390 };

export type PreviewHandle = {
  refresh: () => void;
  focus: (id: string | null, scroll: boolean) => void;
};

/**
 * The live preview (08 §1): the real page, rendered on the server from the saved draft, in a
 * frame at desktop, tablet or phone width (scaled down to fit). Clicking a section in it
 * selects that section here.
 */
export function PreviewFrame({
  ref,
  src,
  device,
  onSelect,
  selectedId,
}: {
  ref?: Ref<PreviewHandle>;
  src: string;
  device: Device;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    onSelectRef.current = onSelect;
    selectedRef.current = selectedId;
  });

  const post = (msg: EditorMessage) =>
    frame.current?.contentWindow?.postMessage(msg, window.location.origin);

  useImperativeHandle(ref, () => ({
    refresh: () => post({ source: "lintel-editor", type: "refresh" }),
    focus: (id, scroll) => post({ source: "lintel-editor", type: "focus", id, scroll }),
  }));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const msg = e.data as PreviewMessage | null;
      if (!msg || msg.source !== "lintel-preview") return;
      if (msg.type === "select") onSelectRef.current(msg.id);
      if (msg.type === "ready") {
        setLoading(false);
        post({ source: "lintel-editor", type: "focus", id: selectedRef.current, scroll: false });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const width = deviceWidths[device];
  const scale = size.width > 0 ? Math.min(1, (size.width - 24) / width) : 1;
  return (
    <div ref={box} className="relative h-full min-h-0 w-full overflow-hidden bg-surface-muted">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[13px] text-text-muted">
          Loading the preview…
        </div>
      )}
      <div
        className="absolute top-3 left-1/2 overflow-hidden rounded-md border border-border bg-white shadow-sm"
        style={{
          width: width * scale,
          height: Math.max(0, size.height - 24),
          transform: "translateX(-50%)",
        }}
      >
        <iframe
          ref={frame}
          src={src}
          title="Page preview"
          className="origin-top-left border-0"
          style={{
            width,
            height: scale > 0 ? Math.max(0, size.height - 24) / scale : 0,
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}
