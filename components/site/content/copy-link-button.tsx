"use client";

import { toast } from "sonner";
import { content } from "@/lib/i18n/dictionaries/content";

export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const t = content.insights;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success(t.copied);
        } catch {
          toast.error(t.copyFailed);
        }
      }}
    >
      {t.copyLink}
    </button>
  );
}
