"use client";

import { CheckIcon, LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/components/site/visitor-tracker";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";

/**
 * Keeps the address bar in step with the inputs (so a reload or a copied address shows the
 * same numbers) without a navigation, and records one `tool_use` journey event (09 §2) the
 * first time the visitor changes something.
 */
export function useCalculatorUrl(path: string, search: string, tool: string): void {
  const first = useRef(search);
  const tracked = useRef(false);
  useEffect(() => {
    if (search === first.current) return;
    if (!tracked.current) {
      tracked.current = true;
      track({ type: "tool_use", meta: { tool } });
    }
    const timer = setTimeout(() => {
      window.history.replaceState(window.history.state, "", `${path}?${search}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [path, search, tool]);
}

/** "Copy share link" (11 §1): the calculator's address with every input in it. */
export function ShareLink({ path, search }: { path: string; search: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline-site"
        size="md"
        className="w-fit"
        data-share-url={`${path}?${search}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}${path}?${search}`);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? <CheckIcon aria-hidden /> : <LinkIcon aria-hidden />}
        {t.common.share}
      </Button>
      <p role="status" className="text-[13px] text-text-muted">
        {state === "copied" ? t.common.copied : state === "failed" ? t.common.copyFailed : ""}
      </p>
    </div>
  );
}
