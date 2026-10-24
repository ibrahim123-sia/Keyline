"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookmarkPlusIcon,
  Columns3Icon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteView, saveView } from "@/features/saved-views/actions";
import { viewQuery, type SavedView, type SavedViewTable } from "@/features/saved-views/schema";

export type { ColumnDef };

/** Column meta: which URL sort key a column maps to, and its label in the column picker. */
export type ColumnMeta = { sortKey?: string; label?: string; className?: string };

/**
 * Admin data table (02 §4): server-side paging and sorting through the URL, search box,
 * column picker (remembered per table), row selection with bulk actions, saved views.
 */
export function DataTable<T>({
  tableId,
  columns,
  rows,
  total,
  page,
  pageSize,
  sort,
  getRowId,
  onRowClick,
  searchPlaceholder = "Search",
  toolbar,
  bulkActions,
  views,
  savedViews,
  empty,
}: {
  tableId: string;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  views?: Array<{ label: string; params: Record<string, string> }>;
  /** Views the agency saved for this table (stored in the database). */
  savedViews?: { tableId: SavedViewTable; items: SavedView[]; canEdit: boolean };
  empty?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`keyline.table.${tableId}.columns`);
      if (saved) setVisibility(JSON.parse(saved) as VisibilityState);
    } catch {
      /* private mode: use defaults */
    }
  }, [tableId]);

  function setParams(patch: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }),
    );
    setSelection({});
  }

  // Debounced search.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParams({ q: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // TanStack Table v8 is not React Compiler friendly; this app does not enable the compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: Boolean(bulkActions),
    state: { rowSelection: selection, columnVisibility: visibility },
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: (updater) => {
      setVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        try {
          localStorage.setItem(`keyline.table.${tableId}.columns`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
  });

  const selectedIds = useMemo(
    () => Object.keys(selection).filter((k) => selection[k]),
    [selection],
  );
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const sortParam = (key: string) => (sort.id === key ? (sort.desc ? key : `-${key}`) : key);

  return (
    <div className="flex flex-col gap-3">
      {((views && views.length > 0) || savedViews) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Saved views">
          {(views ?? []).map((v) => {
            const active = Object.entries(v.params).every(([k, val]) => params.get(k) === val);
            return (
              <button
                key={v.label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setParams(
                    active
                      ? Object.fromEntries(Object.keys(v.params).map((k) => [k, null]))
                      : v.params,
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-border bg-surface text-text-muted hover:text-ink",
                )}
              >
                {v.label}
              </button>
            );
          })}
          {savedViews && (
            <SavedViewChips
              {...savedViews}
              current={viewQuery(params)}
              onApply={(query) => {
                const next = new URLSearchParams(query);
                const q = params.get("q");
                if (q) next.set("q", q);
                startTransition(() =>
                  router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }),
                );
                setSelection({});
              }}
              onClear={() => {
                const q = params.get("q");
                startTransition(() =>
                  router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, {
                    scroll: false,
                  }),
                );
                setSelection({});
              }}
            />
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="ps-8"
          />
        </div>
        {toolbar}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ms-auto" aria-label="Choose columns">
              <Columns3Icon /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide() && c.id !== "select")
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {(c.columnDef.meta as ColumnMeta | undefined)?.label ?? c.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {bulkActions && selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[13px]"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="font-semibold text-ink">{selectedIds.length} selected</span>
          {bulkActions(selectedIds, () => setSelection({}))}
        </div>
      )}

      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-surface",
          pending && "opacity-70",
        )}
        aria-busy={pending}
      >
        <table className="w-full text-start text-[13px]">
          <thead className="border-b border-border bg-surface-soft">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {bulkActions && (
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      className="size-4 accent-[var(--color-accent)]"
                      checked={table.getIsAllPageRowsSelected()}
                      onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
                    />
                  </th>
                )}
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as ColumnMeta | undefined;
                  const sortKey = meta?.sortKey;
                  const active = sortKey && sort.id === sortKey;
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                      className={cn(
                        "px-3 py-2 text-start text-[12px] font-semibold whitespace-nowrap text-text-muted",
                        meta?.className,
                      )}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-ink"
                          onClick={() => setParams({ sort: sortParam(sortKey) })}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {active ? (
                            sort.desc ? (
                              <ArrowDownIcon className="size-3" />
                            ) : (
                              <ArrowUpIcon className="size-3" />
                            )
                          ) : (
                            <ArrowUpDownIcon className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (bulkActions ? 1 : 0)}
                  className="px-3 py-10 text-center text-text-muted"
                >
                  {empty ?? "Nothing matches these filters."}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    onRowClick && "cursor-pointer hover:bg-surface-soft",
                    row.getIsSelected() && "bg-accent-soft/50",
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {bulkActions && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={row.getIsSelected()}
                        onChange={(e) => row.toggleSelected(e.target.checked)}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 py-2 align-middle",
                        (cell.column.columnDef.meta as ColumnMeta | undefined)?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-muted">
        <span className="tabular">
          {total === 0
            ? "0 results"
            : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setParams({ page: String(page - 1) }, false)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="px-2 tabular">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => setParams({ page: String(page + 1) }, false)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small select that writes one URL filter (used in table toolbars). */
export function UrlFilterSelect({
  param,
  label,
  options,
}: {
  param: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(param) ?? "";
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        next.delete("page");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }}
      className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
    >
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SavedViewChips({
  tableId,
  items,
  canEdit,
  current,
  onApply,
  onClear,
}: {
  tableId: SavedViewTable;
  items: SavedView[];
  canEdit: boolean;
  current: string;
  onApply: (query: string) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const match = items.find((v) => v.query === current);

  async function save() {
    setBusy(true);
    const res = await saveView({ tableId, name, query: current });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`View “${res.data.name}” saved`);
    setOpen(false);
    setName("");
    router.refresh();
  }

  return (
    <>
      {items.map((v) => {
        const active = v.id === match?.id;
        return (
          <span
            key={v.id}
            className={cn(
              "inline-flex items-center rounded-full border text-[12.5px] font-medium transition-colors",
              active
                ? "border-accent bg-accent-soft text-ink"
                : "border-border bg-surface text-text-muted hover:text-ink",
            )}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => (active ? onClear() : onApply(v.query))}
              className={cn("py-1 ps-3", canEdit ? "pe-1.5" : "pe-3")}
            >
              {v.name}
            </button>
            {canEdit && (
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                className="me-1 rounded-full p-0.5 hover:bg-surface-muted"
                onClick={async () => {
                  const res = await deleteView({ id: v.id });
                  if (!res.ok) return toast.error(res.error);
                  toast.success(`View “${v.name}” deleted`);
                  router.refresh();
                }}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        );
      })}
      {canEdit && current && !match && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 rounded-full text-[12.5px]">
              <BookmarkPlusIcon /> Save view
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-72 flex-col gap-2">
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
                View name
              </label>
              <Input
                id={inputId}
                value={name}
                maxLength={40}
                placeholder="e.g. Marina drafts"
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-[12px] text-text-muted">
                Saves the current filters for everyone on the team.
              </p>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy || !name.trim()}>
                  {busy ? "Saving…" : "Save view"}
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
