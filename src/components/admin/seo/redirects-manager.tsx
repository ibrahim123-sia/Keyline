"use client";

import { ExternalLinkIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { deleteRedirects, fixRedirectChains } from "@/features/seo/redirect-actions";
import type { RedirectRow } from "@/features/seo/redirects-admin";
import { RedirectImport } from "./redirect-import";
import { RedirectPanel, type RedirectDraft } from "./redirect-panel";

const isExternal = (to: string) => /^https?:\/\//i.test(to);

/** Website -> SEO -> Redirects (08 §6): list, add, import, hits, chain and loop warnings. */
export function RedirectsManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  warnings,
  chains,
  timeZone,
  readOnly,
}: {
  rows: RedirectRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  warnings: number;
  chains: number;
  timeZone: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RedirectDraft | null>(null);
  const date = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }),
    [timeZone],
  );
  const done = () => {
    setDraft(null);
    router.refresh();
  };

  const columns = useMemo<ColumnDef<RedirectRow, unknown>[]>(
    () => [
      {
        id: "from",
        header: "Old address",
        meta: { sortKey: "from", label: "Old address" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-[12.5px] text-ink">{row.original.fromPath}</p>
            {row.original.loop && (
              <p className="text-[12px] font-medium text-danger">
                Loop: it leads back to itself and never lands
              </p>
            )}
            {row.original.chain && (
              <p className="text-[12px] text-[#8A6A12]">
                Chain: goes on to {row.original.finalTo} (an extra hop)
              </p>
            )}
          </div>
        ),
      },
      {
        id: "to",
        header: "New address",
        meta: { label: "New address" },
        cell: ({ row }) => (
          <span className="inline-flex max-w-72 items-center gap-1 truncate font-mono text-[12.5px]">
            {row.original.toPath}
            {isExternal(row.original.toPath) && (
              <ExternalLinkIcon
                className="size-3 shrink-0 text-text-muted"
                aria-label="Another site"
              />
            )}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        meta: { label: "Type" },
        cell: ({ row }) => row.original.type,
      },
      {
        id: "kind",
        header: "Added",
        meta: { label: "Added" },
        cell: ({ row }) =>
          row.original.isAuto ? (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] text-text-muted">
              Automatic
            </span>
          ) : (
            <span className="text-[12.5px] text-text-muted">
              {row.original.source === "import" ? "Imported" : "Manual"}
            </span>
          ),
      },
      {
        id: "hits",
        header: "Hits",
        meta: { sortKey: "hits", label: "Hits", className: "text-end" },
        cell: ({ row }) => <span className="tabular">{row.original.hits}</span>,
      },
      {
        id: "lastHit",
        header: "Last hit",
        meta: { sortKey: "lastHit", label: "Last hit" },
        cell: ({ row }) =>
          row.original.lastHitAt ? (
            date.format(new Date(row.original.lastHitAt))
          ) : (
            <span className="text-text-muted">Never</span>
          ),
      },
    ],
    [date],
  );

  return (
    <>
      <DataTable
        tableId="redirects"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        searchPlaceholder="Search addresses"
        views={[
          { label: "Manual", params: { kind: "manual" } },
          { label: "Automatic", params: { kind: "auto" } },
          { label: `Needs attention (${warnings})`, params: { warn: "1" } },
        ]}
        onRowClick={(r) =>
          setDraft({
            id: r.id,
            fromPath: r.fromPath,
            toPath: r.toPath,
            type: r.type,
            isAuto: r.isAuto,
          })
        }
        toolbar={
          !readOnly && (
            <div className="flex flex-wrap gap-2">
              {chains > 0 && (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline">
                      <WandSparklesIcon /> Fix {chains} chain{chains === 1 ? "" : "s"}
                    </Button>
                  }
                  title="Point chained redirects straight at the final address?"
                  description="Each old address in a chain is changed to go directly where the chain ends. Loops are left for you to fix."
                  confirmLabel="Fix chains"
                  onConfirm={async () => {
                    const res = await fixRedirectChains({});
                    if (!res.ok) return toast.error(res.error);
                    toast.success(
                      `${res.data.fixed} redirect${res.data.fixed === 1 ? "" : "s"} fixed`,
                    );
                    router.refresh();
                  }}
                />
              )}
              <RedirectImport onDone={() => router.refresh()} />
              <Button onClick={() => setDraft({ id: null, fromPath: "", toPath: "", type: 301 })}>
                <PlusIcon /> New redirect
              </Button>
            </div>
          )
        }
        bulkActions={
          readOnly
            ? undefined
            : (ids, clear) => (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline" className="text-danger">
                      <Trash2Icon /> Delete
                    </Button>
                  }
                  title={`Delete ${ids.length} redirect${ids.length === 1 ? "" : "s"}?`}
                  description="Their old addresses will show the 404 page again."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const res = await deleteRedirects({ ids });
                    if (!res.ok) return toast.error(res.error);
                    toast.success(`${res.data.deleted} deleted`);
                    clear();
                    router.refresh();
                  }}
                />
              )
        }
        empty="No redirects yet. Changing a slug adds one automatically."
      />
      <RedirectPanel
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={done}
        readOnly={readOnly}
      />
    </>
  );
}
