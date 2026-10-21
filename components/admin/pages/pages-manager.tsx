"use client";

import {
  ArchiveRestoreIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  HomeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pageStatuses, pageTemplates } from "@/db/schema/cms";
import {
  createPagePreviewLink,
  deletePage,
  duplicatePage,
  restorePage,
  setHomePage,
  trashPage,
} from "@/features/cms/page-actions";
import type { PageListRow } from "@/features/cms/page-admin";
import { pageStatusLabels, pageTemplateLabels } from "@/features/cms/page-schema";
import { NewPageDialog } from "./new-page-dialog";

const updatedFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const publicPath = (p: { slug: string; isHome: boolean }) => (p.isHome ? "/" : `/${p.slug}`);

/** Draft / Published / Scheduled, with "changes not published" for a live page with a draft. */
export function PageStatusPill({
  status,
  hasDraft,
  publishAt,
}: {
  status: PageListRow["status"];
  hasDraft: boolean;
  publishAt: string | null;
}) {
  const at = publishAt ? updatedFormat.format(new Date(publishAt)) : null;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap",
          status === "published" && "bg-success-soft text-success",
          status === "scheduled" && "bg-accent-soft text-accent",
          status === "draft" && "bg-surface-muted text-text-muted",
        )}
      >
        {pageStatusLabels[status]}
      </span>
      {status === "scheduled" && at && (
        <span className="text-[12px] whitespace-nowrap text-text-muted">{at}</span>
      )}
      {status === "published" && hasDraft && (
        <span className="text-[12px] whitespace-nowrap text-text-muted">
          {at ? `Changes go live ${at}` : "Changes not published"}
        </span>
      )}
    </div>
  );
}

async function openPreview(id: string) {
  // Opened first, filled in after the action: browsers block pop-ups opened later.
  const win = window.open("about:blank", "_blank");
  const res = await createPagePreviewLink({ id });
  if (!res.ok) {
    win?.close();
    toast.error(res.error);
    return;
  }
  if (win) win.location.href = res.data.url;
  else window.location.href = res.data.url;
}

/** Admin -> Website -> Pages (08 §1 "Page list"). */
export function PagesManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  trash,
  trashCount,
  readOnly,
}: {
  rows: PageListRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  trash: boolean;
  trashCount: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [confirm, setConfirm] = useState<{ row: PageListRow; kind: "trash" | "delete" } | null>(
    null,
  );

  const run = async (
    promise: Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    success: string,
  ) => {
    const res = await promise;
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(success);
    router.refresh();
    return true;
  };

  const columns = useMemo<ColumnDef<PageListRow, unknown>[]>(
    () => [
      {
        id: "title",
        header: "Page",
        meta: { sortKey: "title", label: "Page" },
        cell: ({ row: { original: p } }) => (
          <div className="flex min-w-56 flex-col">
            <span className="flex items-center gap-2">
              {p.inTrash ? (
                <span className="font-semibold text-ink">{p.title}</span>
              ) : (
                <Link
                  href={`/admin/website/pages/${p.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-ink hover:underline"
                >
                  {p.title}
                </Link>
              )}
              {p.isHome && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-surface">
                  <HomeIcon className="size-3" aria-hidden /> Home
                </span>
              )}
            </span>
            <span className="text-[12px] text-text-muted">{publicPath(p)}</span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: p } }) => (
          <PageStatusPill status={p.status} hasDraft={p.hasDraft} publishAt={p.publishAt} />
        ),
      },
      {
        id: "template",
        header: "Template",
        meta: { label: "Template" },
        cell: ({ row: { original: p } }) => pageTemplateLabels[p.template],
      },
      {
        id: "editedBy",
        header: "Last edited by",
        meta: { label: "Last edited by" },
        cell: ({ row: { original: p } }) =>
          p.updatedByName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "updated",
        header: "Updated",
        meta: { sortKey: "updated", label: "Updated" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap text-text-muted">
            {updatedFormat.format(new Date(p.updatedAt))}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        cell: ({ row: { original: p } }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.title}`}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{p.title}</DropdownMenuLabel>
                {p.inTrash ? (
                  !readOnly && (
                    <>
                      <DropdownMenuItem
                        onSelect={() => void run(restorePage({ id: p.id }), "Restored as a draft")}
                      >
                        <ArchiveRestoreIcon /> Restore
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setConfirm({ row: p, kind: "delete" })}
                      >
                        <Trash2Icon /> Delete for good
                      </DropdownMenuItem>
                    </>
                  )
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/website/pages/${p.id}`}>
                        <PencilIcon /> Edit
                      </Link>
                    </DropdownMenuItem>
                    {!readOnly && (
                      <DropdownMenuItem
                        onSelect={async () => {
                          const res = await duplicatePage({ id: p.id });
                          if (!res.ok) return toast.error(res.error);
                          toast.success("Copy created");
                          router.push(`/admin/website/pages/${res.data.id}`);
                        }}
                      >
                        <CopyIcon /> Duplicate
                      </DropdownMenuItem>
                    )}
                    {!readOnly && (
                      <DropdownMenuItem onSelect={() => void openPreview(p.id)}>
                        <EyeIcon /> Preview
                      </DropdownMenuItem>
                    )}
                    {p.status === "published" && (
                      <DropdownMenuItem asChild>
                        <a href={publicPath(p)} target="_blank" rel="noopener noreferrer">
                          <ExternalLinkIcon /> View on site
                        </a>
                      </DropdownMenuItem>
                    )}
                    {!readOnly && p.status === "published" && !p.isHome && (
                      <DropdownMenuItem
                        onSelect={() =>
                          void run(setHomePage({ id: p.id }), `${p.title} is now the home page`)
                        }
                      >
                        <HomeIcon /> Set as home
                      </DropdownMenuItem>
                    )}
                    {!readOnly && !p.isHome && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setConfirm({ row: p, kind: "trash" })}
                        >
                          <Trash2Icon /> Move to trash
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly, router],
  );

  const toggleTrash = () => {
    const next = new URLSearchParams(params.toString());
    if (trash) next.delete("trash");
    else next.set("trash", "1");
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  return (
    <>
      <DataTable
        tableId="pages"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        onRowClick={trash ? undefined : (r) => router.push(`/admin/website/pages/${r.id}`)}
        searchPlaceholder="Search title or address"
        toolbar={
          <>
            {!trash && (
              <>
                <UrlFilterSelect
                  param="status"
                  label="Status"
                  options={pageStatuses.map((s) => ({ value: s, label: pageStatusLabels[s] }))}
                />
                <UrlFilterSelect
                  param="template"
                  label="Template"
                  options={pageTemplates.map((t) => ({ value: t, label: pageTemplateLabels[t] }))}
                />
              </>
            )}
            <Button variant="outline" aria-pressed={trash} onClick={toggleTrash}>
              <Trash2Icon /> {trash ? "Back to pages" : `Trash (${trashCount})`}
            </Button>
            {!readOnly && !trash && <NewPageDialog />}
          </>
        }
        empty={trash ? "The trash is empty." : "No pages match these filters."}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "delete"
            ? `Delete "${confirm.row.title}" for good?`
            : `Move "${confirm?.row.title}" to the trash?`
        }
        description={
          confirm?.kind === "delete"
            ? "The page and its saved versions are deleted. This cannot be undone."
            : "It leaves the site at once. You can restore it from the trash as a draft."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete for good" : "Move to trash"}
        destructive
        onConfirm={async () => {
          if (!confirm) return;
          const ok =
            confirm.kind === "delete"
              ? await run(deletePage({ id: confirm.row.id }), "Page deleted")
              : await run(trashPage({ id: confirm.row.id }), "Moved to the trash");
          if (ok) setConfirm(null);
        }}
      />
    </>
  );
}
