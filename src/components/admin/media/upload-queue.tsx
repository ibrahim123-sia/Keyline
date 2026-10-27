"use client";

import { CheckCircle2Icon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatBytes } from "./upload-utils";
import type { UploadEntry } from "./use-uploader";

const phaseText: Record<UploadEntry["phase"], string> = {
  queued: "Waiting",
  preparing: "Preparing",
  uploading: "Uploading",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

/** Progress for each file being uploaded; the summary line is announced to screen readers. */
export function UploadQueue({
  entries,
  onClear,
  className,
}: {
  entries: UploadEntry[];
  onClear: () => void;
  className?: string;
}) {
  if (entries.length === 0) return null;
  const done = entries.filter((e) => e.phase === "done").length;
  const failed = entries.filter((e) => e.phase === "failed").length;
  const active = entries.length - done - failed;
  return (
    <section
      aria-label="Uploads"
      className={cn("rounded-lg border border-border bg-surface", className)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p role="status" className="text-[13px] font-semibold text-ink">
          {active > 0
            ? `Uploading ${active} file${active === 1 ? "" : "s"}…`
            : `${done} uploaded${failed ? `, ${failed} failed` : ""}`}
        </p>
        {active === 0 && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto">
        {entries.map((e) => (
          <li key={e.key} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            {e.phase === "done" ? (
              <CheckCircle2Icon className="size-4 shrink-0 text-success" aria-hidden />
            ) : e.phase === "failed" ? (
              <CircleAlertIcon className="size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <LoaderCircleIcon
                className="size-4 shrink-0 animate-spin text-text-muted"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-ink">{e.name}</span>
                <span className="shrink-0 text-[12px] text-text-muted tabular">
                  {phaseText[e.phase]}
                  {e.phase === "uploading" ? ` ${Math.round(e.progress * 100)}%` : ""} ·{" "}
                  {formatBytes(e.size)}
                </span>
              </div>
              {e.phase === "uploading" && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${Math.round(e.progress * 100)}%` }}
                  />
                </div>
              )}
              {e.error && <p className="mt-0.5 text-[12px] text-danger">{e.error}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
