"use client";

import { ArrowRightIcon, EyeOffIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import type { NotFoundRow } from "@/features/seo/not-found-log";
import { setNotFoundStatus } from "@/features/seo/redirect-actions";
import { RedirectPanel, type RedirectDraft } from "./redirect-panel";

/** Website -> SEO -> 404 monitor (08 §6): missing addresses by hits, one click to redirect. */
export function NotFoundManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  resolvedView,
  timeZone,
  readOnly,
}: {
  rows: NotFoundRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  resolvedView: boolean;
  timeZone: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RedirectDraft | null>(null);
  const date = useMemo(
    () => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }),
    [timeZone],
  );
  const setStatus = async (ids: string[], resolved: boolean, clear?: () => void) => {
    const res = await setNotFoundStatus({ ids, resolved });
    if (!res.ok) return toast.error(res.error);
    toast.success(resolved ? "Dismissed" : "Reopened");
    clear?.();
    router.refresh();
  };

  const columns = useMemo<ColumnDef<NotFoundRow, unknown>[]>(
    () => [
      {
        id: "path",
        header: "Address",
        meta: { sortKey: "path", label: "Address" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-mono text-[12.5px] text-ink">{row.original.path}</p>
            {row.original.lastReferrer && (
              <p className="truncate text-[12px] text-text-muted">
                Linked from {row.original.lastReferrer}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "hits",
        header: "Hits",
        meta: { sortKey: "hits", label: "Hits", className: "text-end" },
        cell: ({ row }) => <span className="tabular">{row.original.hits}</span>,
      },
      {
        id: "lastSeen",
        header: "Last seen",
        meta: { sortKey: "lastSeen", label: "Last seen" },
        cell: ({ row }) => date.format(new Date(row.original.lastSeenAt)),
      },
      {
        id: "firstSeen",
        header: "First seen",
        meta: { sortKey: "firstSeen", label: "First seen" },
        cell: ({ row }) => date.format(new Date(row.original.firstSeenAt)),
      },
      {
        id: "actions",
        header: "",
        meta: { label: "Actions" },
        cell: ({ row }) =>
          readOnly ? null : (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {resolvedView ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void setStatus([row.original.id], false)}
                >
                  <RotateCcwIcon /> Reopen
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({ id: null, fromPath: row.original.path, toPath: "", type: 301 })
                    }
                  >
                    <ArrowRightIcon /> Create redirect
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void setStatus([row.original.id], true)}
                  >
                    <EyeOffIcon /> Dismiss
                  </Button>
                </>
              )}
            </div>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setStatus only uses the router
    [date, readOnly, resolvedView],
  );

  return (
    <>
      <DataTable
        tableId="not-found"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        searchPlaceholder="Search addresses"
        views={[{ label: "Dismissed or redirected", params: { status: "resolved" } }]}
        bulkActions={
          readOnly
            ? undefined
            : (ids, clear) =>
                resolvedView ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(ids, false, clear)}
                  >
                    <RotateCcwIcon /> Reopen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(ids, true, clear)}
                  >
                    <EyeOffIcon /> Dismiss
                  </Button>
                )
        }
        empty={
          resolvedView
            ? "Nothing dismissed or redirected yet."
            : "No missing pages recorded. Addresses visitors ask for that do not exist show up here."
        }
      />
      <RedirectPanel
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          router.refresh();
        }}
        readOnly={readOnly}
      />
    </>
  );
}
