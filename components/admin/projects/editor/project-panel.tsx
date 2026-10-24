"use client";

import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { SaveState } from "@/components/admin/properties/editor/editor-panel";
import { Button } from "@/components/ui/button";
import type { ProjectProblem } from "@/features/projects/schema";
import { brochure as tb } from "@/lib/i18n/dictionaries/brochure";
import { PublishedPill } from "../projects-manager";

const timeFormat = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });

/** The project editor's sticky panel: publishing, what blocks it, save state, delete. */
export function ProjectPanel({
  published,
  dirty,
  saveState,
  problems,
  busy,
  readOnly,
  publicPath,
  brochurePath,
  canDelete,
  onSave,
  onPublish,
  onDelete,
}: {
  published: boolean;
  dirty: boolean;
  saveState: SaveState;
  problems: ProjectProblem[];
  busy: boolean;
  readOnly: boolean;
  publicPath: string;
  /** The generated brochure (11 §4), for published projects. */
  brochurePath?: string;
  canDelete: boolean;
  onSave: () => void;
  onPublish: (published: boolean) => void;
  onDelete: () => Promise<unknown>;
}) {
  const saveText =
    saveState.kind === "saving"
      ? "Saving…"
      : saveState.kind === "conflict" || saveState.kind === "error"
        ? saveState.message
        : saveState.kind === "blocked"
          ? "Not saved: this project is published, so fix the items below first."
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
          <PublishedPill published={published} />
        </div>
        {!readOnly &&
          (published ? (
            <Button variant="outline" disabled={busy} onClick={() => onPublish(false)}>
              Unpublish
            </Button>
          ) : (
            <Button disabled={busy || problems.length > 0} onClick={() => onPublish(true)}>
              {busy ? "Working…" : "Publish"}
            </Button>
          ))}
        {published && (
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
        {published && brochurePath && (
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
        {!published && problems.length > 0 && (
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

      {!readOnly && canDelete && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-danger">
              Delete project
            </Button>
          }
          title="Delete this project?"
          description="Its unit types, gallery links and payment plan go too. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={onDelete}
        />
      )}
    </aside>
  );
}
