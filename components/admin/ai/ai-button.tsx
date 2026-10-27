"use client";

import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * A writing helper's button (10 §5): runs the helper, shows "Writing…" meanwhile, and a toast
 * when it cannot (AI off, over budget, no usable answer). The result goes to `onResult`; the
 * editor decides what to do with it, and nothing is saved until the admin saves.
 */
export function AiButton<T>({
  label,
  run,
  onResult,
  disabled,
}: {
  label: string;
  run: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>;
  onResult: (data: T) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        const res = await run().catch(() => null);
        setBusy(false);
        if (!res) return toast.error("The AI did not answer. Please try again.");
        if (!res.ok) return toast.error(res.error);
        onResult(res.data);
      }}
    >
      <SparklesIcon aria-hidden /> {busy ? "Writing…" : label}
    </Button>
  );
}

/** Plain paragraphs (blank-line separated) as the rich text the editors store. */
export function paragraphsToDoc(text: string) {
  return {
    type: "doc" as const,
    content: text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((p) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: p }] })),
  };
}
