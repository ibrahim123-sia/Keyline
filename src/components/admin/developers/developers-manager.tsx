"use client";

import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { NumberField, SelectField, TextInputField, TextareaField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { SeoFields } from "@/components/admin/seo-fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { deleteDeveloper, mergeDeveloper, saveDeveloper } from "@/features/developers/actions";
import type { DeveloperRow } from "@/features/developers/queries";
import { emptyDeveloper, type DeveloperInput } from "@/features/developers/schema";
import { useAction } from "@/lib/use-action";

type Editing = { id: string | null; data: DeveloperInput; usage: DeveloperRow["usage"] | null };

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Setup -> Developers (07 §1): logo, description, website, year and SEO, with safe delete. */
export function DevelopersManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  options,
  siteName,
  readOnly,
}: {
  rows: DeveloperRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  options: Array<{ id: string; name: string }>;
  siteName: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [mergeInto, setMergeInto] = useState("");

  const close = () => {
    setEditing(null);
    setMergeInto("");
  };
  const save = useAction(saveDeveloper, {
    success: "Developer saved",
    onSuccess: () => {
      close();
      router.refresh();
    },
  });
  const set = (patch: Partial<DeveloperInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  const columns = useMemo<ColumnDef<DeveloperRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Developer",
        meta: { sortKey: "name", label: "Developer" },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {/* Neutral tile: the placeholder colour suits photos, not logos. */}
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
              {row.original.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                <img
                  src={
                    row.original.logoUrl.endsWith(".svg")
                      ? row.original.logoUrl
                      : `${row.original.logoUrl}?w=128&q=75`
                  }
                  alt=""
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span className="text-[13px] font-semibold text-text-muted" aria-hidden>
                  {row.original.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{row.original.name}</p>
              <p className="truncate text-[12px] text-text-muted">
                /developers/{row.original.slug}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "website",
        header: "Website",
        meta: { label: "Website" },
        cell: ({ row }) =>
          row.original.website ? (
            <a
              href={row.original.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
            >
              {host(row.original.website)}
              <ExternalLinkIcon className="size-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        id: "year",
        header: "Founded",
        meta: { sortKey: "year", label: "Founded" },
        cell: ({ row }) =>
          row.original.establishedYear ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "usage",
        header: "Used by",
        meta: { label: "Used by" },
        cell: ({ row }) =>
          row.original.usage.total === 0 ? (
            <span className="text-text-muted">Not used yet</span>
          ) : (
            row.original.usage.parts.map((p) => `${p.count} ${p.label}`).join(", ")
          ),
      },
    ],
    [],
  );

  const usage = editing?.usage;
  const others = options.filter((o) => o.id !== editing?.id);

  return (
    <>
      <DataTable
        tableId="developers"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        searchPlaceholder="Search developers"
        onRowClick={(r) => setEditing({ id: r.id, data: r.data, usage: r.usage })}
        toolbar={
          !readOnly && (
            <Button onClick={() => setEditing({ id: null, data: emptyDeveloper(), usage: null })}>
              <PlusIcon /> New developer
            </Button>
          )
        }
        empty="No developers yet."
      />

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && close()}
        title={editing?.id ? `Edit ${editing.data.name || "developer"}` : "New developer"}
        footer={
          !readOnly && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {editing?.id && (
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        className="text-danger"
                        disabled={(usage?.total ?? 0) > 0}
                      >
                        Delete
                      </Button>
                    }
                    title={`Delete ${editing.data.name}?`}
                    description="Its page on the site goes away. This cannot be undone."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteDeveloper({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Developer deleted");
                      close();
                      router.refresh();
                    }}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {editing && (
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ id: editing.id, data: editing.data });
            }}
          >
            <TextInputField
              label="Name"
              required
              value={editing.data.name}
              onChange={(name) => set({ name })}
              error={save.errorFor("name")}
            />
            <MediaPicker
              label="Logo"
              description="A transparent PNG or SVG works best."
              value={editing.data.logoId}
              onChange={(logoId) => set({ logoId })}
              error={save.errorFor("logoId")}
            />
            <TextareaField
              label="Description"
              rows={6}
              maxLength={5000}
              value={editing.data.description ?? ""}
              onChange={(v) => set({ description: v || null })}
              error={save.errorFor("description")}
            />
            <TextInputField
              label="Website"
              type="url"
              placeholder="https://"
              value={editing.data.website ?? ""}
              onChange={(v) => set({ website: v || null })}
              error={save.errorFor("website")}
            />
            <NumberField
              label="Founded"
              placeholder="e.g. 1997"
              min={1800}
              max={new Date().getFullYear()}
              step={1}
              value={editing.data.establishedYear}
              onChange={(establishedYear) => set({ establishedYear })}
              error={save.errorFor("establishedYear")}
            />

            <section aria-label="SEO" className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-[13px] font-semibold text-ink">SEO</h3>
              <SeoFields
                values={{
                  slug: editing.data.slug,
                  seoTitle: editing.data.seoTitle,
                  seoDescription: editing.data.seoDescription,
                  canonicalUrl: editing.data.canonicalUrl,
                  noindex: editing.data.noindex,
                  ogImageId: editing.data.ogImageId,
                }}
                onChange={(patch) => set(patch)}
                urlPrefix="/developers/"
                fallbackTitle={`${editing.data.name || "Developer"} | ${siteName}`}
                fallbackDescription={editing.data.description ?? undefined}
                siteName={siteName}
                errorFor={save.errorFor}
              />
            </section>

            {editing.id && !readOnly && (
              <section
                aria-label="Merge"
                className="flex flex-col gap-2 border-t border-border pt-4"
              >
                <h3 className="text-[13px] font-semibold text-ink">Merge into another developer</h3>
                <p className="text-[12.5px] text-text-muted">
                  For duplicates: everything that uses this developer moves to the one you pick,
                  this one is deleted, and its page redirects there.
                  {usage && usage.total > 0
                    ? ` It is used by ${usage.parts.map((p) => `${p.count} ${p.label}`).join(" and ")}.`
                    : ""}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label="Merge into"
                    value={mergeInto}
                    onChange={setMergeInto}
                    options={others.map((o) => ({ value: o.id, label: o.name }))}
                    placeholder="Choose a developer"
                    className="min-w-60 flex-1"
                  />
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="outline" disabled={!mergeInto}>
                        Merge
                      </Button>
                    }
                    title={`Merge ${editing.data.name} into ${others.find((o) => o.id === mergeInto)?.name ?? "…"}?`}
                    description="This cannot be undone."
                    confirmLabel="Merge"
                    destructive
                    onConfirm={async () => {
                      const res = await mergeDeveloper({ fromId: editing.id!, intoId: mergeInto });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Developers merged");
                      close();
                      router.refresh();
                    }}
                  />
                </div>
              </section>
            )}
          </form>
        )}
      </SidePanel>
    </>
  );
}
