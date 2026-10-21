"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Messages between the page builder (parent window) and its preview (this frame). */
export type PreviewMessage =
  | { source: "lintel-preview"; type: "ready" }
  | { source: "lintel-preview"; type: "select"; id: string }
  | { source: "lintel-preview"; type: "refreshed" };

export type EditorMessage =
  | { source: "lintel-editor"; type: "refresh" }
  | { source: "lintel-editor"; type: "focus"; id: string | null; scroll: boolean };

const SELECTED = "data-selected";

/**
 * The page builder's live preview (08 §1): clicking a section selects it in the editor, the
 * editor's choice is outlined here, and every autosave re-renders the draft on the server
 * (router.refresh keeps the scroll position). Links and forms do nothing inside the preview.
 * Only talks to a parent window on this same origin.
 */
export function PreviewBridge({ emptyLabel }: { emptyLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (window.parent === window) return;
    const origin = window.location.origin;
    const post = (msg: PreviewMessage) => window.parent.postMessage(msg, origin);

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const section = target?.closest?.("[data-section-id]");
      // Nothing in the preview navigates or submits: a click only selects.
      e.preventDefault();
      e.stopPropagation();
      if (section)
        post({
          source: "lintel-preview",
          type: "select",
          id: section.getAttribute("data-section-id")!,
        });
    };
    const onSubmit = (e: Event) => e.preventDefault();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== window.parent) return;
      const msg = e.data as EditorMessage | null;
      if (!msg || msg.source !== "lintel-editor") return;
      if (msg.type === "refresh") startTransition(() => router.refresh());
      if (msg.type === "focus") {
        setSelected(msg.id);
        if (msg.id && msg.scroll)
          document
            .querySelector(`[data-section-id="${CSS.escape(msg.id)}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("message", onMessage);
    post({ source: "lintel-preview", type: "ready" });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  // Outline the selected section again after each refresh (the server sends new markup).
  useEffect(() => {
    document.querySelectorAll(`[${SELECTED}]`).forEach((el) => el.removeAttribute(SELECTED));
    if (selected)
      document
        .querySelector(`[data-section-id="${CSS.escape(selected)}"]`)
        ?.setAttribute(SELECTED, "");
    if (wasPending.current && !pending && window.parent !== window)
      window.parent.postMessage(
        { source: "lintel-preview", type: "refreshed" } satisfies PreviewMessage,
        window.location.origin,
      );
    wasPending.current = pending;
  }, [selected, pending]);

  // Our own fixed rules; the label is a dictionary string with quotes and brackets removed.
  const label = emptyLabel.replace(/["\\<>]/g, "");
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.lintel-preview-section { position: relative; cursor: pointer; }
.lintel-preview-section:hover { outline: 2px dashed var(--color-accent); outline-offset: -2px; }
.lintel-preview-section[${SELECTED}] { outline: 3px solid var(--color-accent); outline-offset: -3px; }
.lintel-preview-section:empty { display: flex; min-height: 96px; margin: 8px; align-items: center; justify-content: center; border: 2px dashed var(--color-border); border-radius: 12px; }
.lintel-preview-section:empty::before { content: attr(data-section-label) " · ${label}"; color: var(--color-text-muted); font-size: 14px; }`,
      }}
    />
  );
}
