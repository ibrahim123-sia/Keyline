"use client";

import { PrinterIcon, Share2Icon } from "lucide-react";
import { notify } from "../site-toaster";
import { property as t } from "@/lib/i18n/dictionaries/property";

/** Share (the phone's share sheet, else copy the link) and Print (06 §5.2). */
export function SharePrint({ title, url }: { title: string; url: string }) {
  const button =
    "inline-flex h-10 items-center gap-2 rounded-full border border-ink/15 bg-surface px-4 text-[14px] font-semibold text-ink hover:border-ink/40";
  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        className={button}
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title, url });
              return;
            } catch (err) {
              if ((err as Error).name === "AbortError") return;
            }
          }
          try {
            await navigator.clipboard.writeText(url);
            notify.success(t.actions.copied);
          } catch {
            notify.error(t.actions.copyFailed);
          }
        }}
      >
        <Share2Icon className="size-4" aria-hidden /> {t.actions.share}
      </button>
      <button type="button" className={button} onClick={() => window.print()}>
        <PrinterIcon className="size-4" aria-hidden /> {t.actions.print}
      </button>
    </div>
  );
}
