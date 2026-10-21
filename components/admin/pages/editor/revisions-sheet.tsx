"use client";

import { ArrowLeftIcon, HistoryIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getPageRevision } from "@/features/cms/page-actions";
import type { PageRevisionItem } from "@/features/cms/page-admin";
import { sectionCatalog } from "@/features/cms/section-catalog";
import { stableJson, type EditorSection } from "@/features/cms/section-rules";
import { isSectionType } from "@/features/cms/sections";
import { sectionSummary } from "./section-meta";

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

type Revision = {
  id: string;
  createdAt: string;
  sections: EditorSection[];
  seo: Record<string, unknown>;
};

type Change = {
  id: string;
  label: string;
  summary: string;
  kind: "added" | "removed" | "changed" | "same";
};

/** Section by section: what this version has compared with the page now. */
export function compareSections(version: EditorSection[], now: EditorSection[]): Change[] {
  const label = (s: EditorSection) =>
    isSectionType(s.type) ? sectionCatalog[s.type].label : s.type;
  const nowById = new Map(now.map((s) => [s.id, s]));
  const versionIds = new Set(version.map((s) => s.id));
  const out: Change[] = version.map((s) => {
    const current = nowById.get(s.id);
    return {
      id: s.id,
      label: label(s),
      summary: sectionSummary(s),
      kind: !current ? "removed" : stableJson(current) === stableJson(s) ? "same" : "changed",
    };
  });
  for (const s of now)
    if (!versionIds.has(s.id))
      out.push({ id: s.id, label: label(s), summary: sectionSummary(s), kind: "added" });
  return out;
}

const kindText: Record<Change["kind"], string> = {
  added: "Added since",
  removed: "Not on the page now",
  changed: "Changed since",
  same: "Same",
};

/** Revisions (08 §1): the last 20 published versions, compare with now, restore into the draft. */
export function RevisionsSheet({
  open,
  onOpenChange,
  revisions,
  current,
  currentTitle,
  onRestore,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisions: PageRevisionItem[];
  current: EditorSection[];
  currentTitle: string;
  onRestore: (revisionId: string) => Promise<boolean>;
  readOnly: boolean;
}) {
  const [viewing, setViewing] = useState<Revision | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function compare(id: string) {
    setLoading(id);
    const res = await getPageRevision({ id });
    setLoading(null);
    if (!res.ok) return toast.error(res.error);
    setViewing(res.data);
  }

  const changes = viewing ? compareSections(viewing.sections, current) : [];
  const seoTitle = viewing && typeof viewing.seo.title === "string" ? viewing.seo.title : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setViewing(null);
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Revisions</SheetTitle>
          <SheetDescription>
            Each time the page is published, that version is kept (the last 20). Restoring puts it
            in the draft: publish to make it live.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {viewing ? (
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => setViewing(null)}
              >
                <ArrowLeftIcon /> All versions
              </Button>
              <div>
                <p className="text-[13px] text-text-muted">Published</p>
                <p className="font-semibold text-ink">{when.format(new Date(viewing.createdAt))}</p>
                {seoTitle && seoTitle !== currentTitle && (
                  <p className="mt-1 text-[13px] text-text-muted">
                    Title then: <span className="text-ink">{seoTitle}</span>
                  </p>
                )}
              </div>
              <ol className="flex flex-col gap-2">
                {changes.map((c) => (
                  <li
                    key={`${c.kind}-${c.id}`}
                    className={cn(
                      "rounded-lg border p-2.5",
                      c.kind === "same" && "border-border",
                      c.kind === "changed" && "border-[#C9A227]/50 bg-[#C9A227]/5",
                      c.kind === "removed" && "border-danger/40 bg-danger/5",
                      c.kind === "added" && "border-success/40 bg-success-soft",
                    )}
                  >
                    <p className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="font-semibold text-ink">{c.label}</span>
                      <span className="text-[12px] text-text-muted">{kindText[c.kind]}</span>
                    </p>
                    {c.summary && (
                      <p className="truncate text-[12.5px] text-text-muted">{c.summary}</p>
                    )}
                  </li>
                ))}
              </ol>
              {!readOnly && (
                <Button type="button" className="w-fit" onClick={() => setConfirm(viewing.id)}>
                  <RotateCcwIcon /> Restore this version
                </Button>
              )}
            </div>
          ) : revisions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] text-text-muted">
              <HistoryIcon className="size-6" aria-hidden />
              Nothing published yet. Versions appear here once you publish.
            </div>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {revisions.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">
                      {when.format(new Date(r.createdAt))}
                      {i === 0 && (
                        <span className="ms-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          Live
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-text-muted">
                      {r.byName ?? "Scheduled"} · {r.sections}{" "}
                      {r.sections === 1 ? "section" : "sections"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading === r.id}
                    onClick={() => void compare(r.id)}
                  >
                    {loading === r.id ? "Opening…" : "Compare"}
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        title="Restore this version?"
        description="Its sections replace the draft. The site keeps showing the live version until you publish."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!confirm) return;
          if (await onRestore(confirm)) {
            setViewing(null);
            onOpenChange(false);
          }
        }}
      />
    </Sheet>
  );
}
