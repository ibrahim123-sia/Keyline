"use client";

import { CheckCircle2Icon, CircleIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { propertyStatuses, type PropertyStatus } from "@/db/schema/properties";
import type { CompletenessItem, Problem } from "@/features/properties/schema";
import { isLiveStatus, statusLabels } from "@/features/properties/status";
import { brochure as tb } from "@/lib/i18n/dictionaries/brochure";
import { StatusPill } from "../status-pill";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "blocked" }
  | { kind: "error" | "conflict"; message: string };

const timeFormat = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });

/** The sticky right panel (07 §3): status, publish, completeness score, save state. */
export function EditorPanel({
  status,
  dirty,
  saveState,
  problems,
  score,
  items,
  busy,
  readOnly,
  publicPath,
  brochurePath,
  onSave,
  onStatus,
}: {
  status: PropertyStatus;
  dirty: boolean;
  saveState: SaveState;
  problems: Problem[];
  score: number;
  items: CompletenessItem[];
  busy: boolean;
  readOnly: boolean;
  publicPath: string;
  /** The generated brochure (11 §4), for live listings. */
  brochurePath?: string;
  onSave: () => void;
  onStatus: (next: PropertyStatus) => void;
}) {
  const live = isLiveStatus(status);
  const saveText =
    saveState.kind === "saving"
      ? "Saving…"
      : saveState.kind === "conflict" || saveState.kind === "error"
        ? saveState.message
        : saveState.kind === "blocked"
          ? "Not saved: this listing is live, so fix the items below first."
          : dirty
            ? "Unsaved changes"
            : saveState.kind === "saved"
              ? `All changes saved at ${timeFormat.format(new Date(saveState.at))}`
              : "All changes saved";

  return (
    <aside aria-label="Publishing" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">Status</span>
          <StatusPill status={status} />
        </div>
        {!readOnly && (
          <>
            {live ? (
              <Button variant="outline" disabled={busy} onClick={() => onStatus("draft")}>
                Unpublish
              </Button>
            ) : (
              <Button disabled={busy || problems.length > 0} onClick={() => onStatus("available")}>
                {busy ? "Working…" : "Publish"}
              </Button>
            )}
            <label className="flex flex-col gap-1 text-[12.5px] text-text-muted">
              Change status
              <select
                className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
                value={status}
                disabled={busy}
                onChange={(e) => onStatus(e.target.value as PropertyStatus)}
              >
                {propertyStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {live && (
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
        {live && brochurePath && (
          <a
            href={brochurePath}
            target="_blank"
            rel="noopener noreferrer"
            title={tb.admin.hint}
            className="inline-flex items-center gap-1 text-[13px] text-ink underline-offset-2 hover:underline"
          >
            <FileTextIcon className="size-3.5" aria-hidden /> {tb.admin.action}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {!live && problems.length > 0 && (
          <div className="flex flex-col gap-1.5" role="region" aria-label="Before publishing">
            <p className="text-[12.5px] font-semibold text-ink">Before publishing</p>
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {problems.map((p) => (
                <li key={`${p.field}-${p.message}`}>
                  <a
                    href={`#${p.section}`}
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

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-ink">Completeness</span>
          <span className="text-[18px] font-semibold text-ink tabular">{score}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label="Completeness"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", score === 100 ? "bg-success" : "bg-accent")}
            style={{ width: `${score}%` }}
          />
        </div>
        <ul className="flex flex-col gap-1 text-[12.5px]">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-1.5">
              {i.done ? (
                <CheckCircle2Icon className="size-3.5 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleIcon className="size-3.5 shrink-0 text-text-muted" aria-hidden />
              )}
              {i.done ? (
                <span className="text-text-muted">
                  {i.label}
                  <span className="sr-only"> (done)</span>
                </span>
              ) : (
                <a href={`#${i.section}`} className="text-ink underline-offset-2 hover:underline">
                  {i.label}
                </a>
              )}
            </li>
          ))}
        </ul>
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
        <p className="text-[11.5px] text-text-muted">Drafts save on their own every 10 seconds.</p>
      </div>
    </aside>
  );
}
