"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { SaveState } from "@/components/admin/properties/editor/editor-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentStatus } from "@/db/schema/content";
import { contentStatusLabels, type ContentProblem } from "@/features/content/schema";
import { useHydrated } from "@/lib/use-hydrated";

const timeFormat = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ContentStatusPill({ status }: { status: ContentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap",
        status === "published" && "bg-success-soft text-success",
        status === "scheduled" && "bg-accent-soft text-accent",
        status === "draft" && "bg-surface-muted text-text-muted",
      )}
    >
      {contentStatusLabels[status]}
    </span>
  );
}

/** "2026-10-21T09:30" in the browser's time, for a datetime-local input. */
function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The sticky panel of the post and area guide editors: publish now, schedule (the cron
 * publishes it at that time), unpublish; what blocks publishing; save state; delete.
 */
export function PublishPanel({
  noun,
  status,
  publishAt,
  publishedAt,
  dirty,
  saveState,
  problems,
  sectionFor,
  busy,
  readOnly,
  publicPath,
  canDelete,
  deleteDescription,
  onSave,
  onPublish,
  onSchedule,
  onUnpublish,
  onDelete,
  children,
}: {
  /** "post" or "area guide". */
  noun: string;
  status: ContentStatus;
  publishAt: string | null;
  publishedAt: string | null;
  dirty: boolean;
  saveState: SaveState;
  problems: ContentProblem[];
  sectionFor: (field: string) => string;
  busy: boolean;
  readOnly: boolean;
  publicPath: string;
  canDelete: boolean;
  deleteDescription: string;
  onSave: () => void;
  onPublish: () => void;
  onSchedule: (at: Date) => void;
  onUnpublish: () => void;
  onDelete: () => Promise<unknown>;
  /** More cards under the publishing one (e.g. reading time). */
  children?: React.ReactNode;
}) {
  const scheduleId = useId();
  // Dates show in the browser's time zone, so they render after hydration only.
  const hydrated = useHydrated();
  const [when, setWhen] = useState("");
  const [whenProblem, setWhenProblem] = useState<string | null>(null);
  const blocked = problems.length > 0;
  const saveText =
    saveState.kind === "saving"
      ? "Saving…"
      : saveState.kind === "conflict" || saveState.kind === "error"
        ? saveState.message
        : saveState.kind === "blocked"
          ? `Not saved: this ${noun} is ${status}, so fix the items below first.`
          : dirty
            ? "Unsaved changes"
            : saveState.kind === "saved"
              ? `All changes saved at ${timeFormat.format(new Date(saveState.at))}`
              : "All changes saved";

  return (
    <aside aria-label="Publishing" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">On the site</span>
          <ContentStatusPill status={status} />
        </div>
        {hydrated && status === "published" && publishedAt && (
          <p className="text-[12.5px] text-text-muted">
            Published {dateFormat.format(new Date(publishedAt))}
          </p>
        )}
        {hydrated && status === "scheduled" && publishAt && (
          <p className="text-[12.5px] text-text-muted">
            Goes on the site {dateTimeFormat.format(new Date(publishAt))}
          </p>
        )}
        {!readOnly && (
          <div className="flex flex-col gap-2">
            {status === "published" ? (
              <Button variant="outline" disabled={busy} onClick={onUnpublish}>
                Unpublish
              </Button>
            ) : (
              <>
                <Button disabled={busy || blocked} onClick={onPublish}>
                  {busy ? "Working…" : "Publish now"}
                </Button>
                {status === "scheduled" && (
                  <Button variant="outline" disabled={busy} onClick={onUnpublish}>
                    Unschedule
                  </Button>
                )}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <label htmlFor={scheduleId} className="text-[12.5px] font-semibold text-ink">
                    {status === "scheduled" ? "Move to another time" : "Or schedule it"}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id={scheduleId}
                      type="datetime-local"
                      value={when}
                      min={hydrated ? localInputValue(new Date()) : undefined}
                      onChange={(e) => {
                        setWhen(e.target.value);
                        setWhenProblem(null);
                      }}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="outline"
                      disabled={busy || blocked || !when}
                      onClick={() => {
                        const at = new Date(when);
                        if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() + 60_000) {
                          setWhenProblem("Choose a time in the future.");
                          return;
                        }
                        onSchedule(at);
                      }}
                    >
                      Schedule
                    </Button>
                  </div>
                  {whenProblem && (
                    <p role="alert" className="text-[12.5px] text-danger">
                      {whenProblem}
                    </p>
                  )}
                  <p className="text-[11.5px] text-text-muted">In your computer&apos;s time.</p>
                </div>
              </>
            )}
          </div>
        )}
        {status === "published" && (
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] text-ink underline-offset-2 hover:underline"
          >
            View on site <ExternalLinkIcon className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {status !== "published" && blocked && (
          <div className="flex flex-col gap-1.5" role="region" aria-label="Before publishing">
            <p className="text-[12.5px] font-semibold text-ink">Before publishing</p>
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {problems.map((p) => (
                <li key={`${p.field}-${p.message}`}>
                  <a
                    href={`#${sectionFor(p.field)}`}
                    className="text-danger underline-offset-2 hover:underline"
                  >
                    {p.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p
          role="status"
          className={cn(
            "text-[12.5px]",
            saveState.kind === "error" ||
              saveState.kind === "conflict" ||
              saveState.kind === "blocked"
              ? "font-medium text-danger"
              : "text-text-muted",
          )}
        >
          {saveText}
        </p>
        {!readOnly && (
          <Button
            variant="outline"
            disabled={!dirty || saveState.kind === "saving"}
            onClick={onSave}
          >
            Save now
          </Button>
        )}
        <p className="text-[11.5px] text-text-muted">Changes save on their own every 10 seconds.</p>
      </div>

      {children}

      {!readOnly && canDelete && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-danger">
              Delete {noun}
            </Button>
          }
          title={`Delete this ${noun}?`}
          description={deleteDescription}
          confirmLabel="Delete"
          destructive
          onConfirm={onDelete}
        />
      )}
    </aside>
  );
}
