"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMedia, moveMedia } from "@/features/media/actions";
import type { MediaItem, MediaSort } from "@/features/media/queries";
import { acceptAttribute } from "@/features/media/schema";
import { MediaDetails } from "./media-details";
import { MediaThumb } from "./media-thumb";
import { UploadQueue } from "./upload-queue";
import { formatBytes } from "./upload-utils";
import { useUploader } from "./use-uploader";

type Folder = { path: string; count: number };

const showOptions = [
  { value: "", label: "All files" },
  { value: "usage:unused", label: "Not used anywhere" },
  { value: "usage:used", label: "In use" },
  { value: "alt:missing", label: "Missing alt text" },
  { value: "status:failed", label: "Failed uploads" },
] as const;

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "-newest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "-size", label: "Largest first" },
] as const;

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/**
 * Admin -> Media (07 §8): folders, search, filters, grid and list views, drag-and-drop
 * upload, bulk move and delete (unused files only), and the details panel.
 */
export function MediaLibrary(props: {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: MediaSort; desc: boolean };
  folders: Folder[];
  /** null = every folder. */
  folder: string | null;
  view: "grid" | "list";
  maxUploadMb: number;
  readOnly: boolean;
}) {
  const { total, page, pageSize, folders, folder, view, readOnly } = props;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Local copy so edits show at once; replaced whenever the server sends a new page.
  const [items, setItems] = useState(props.items);
  const [itemsFrom, setItemsFrom] = useState(props.items);
  if (itemsFrom !== props.items) {
    setItemsFrom(props.items);
    setItems(props.items);
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [moveTo, setMoveTo] = useState("");
  const [dragDepth, setDragDepth] = useState(0);

  const uploader = useUploader({
    folder: folder ?? "",
    onUploaded: (item) => {
      setItems((list) => list.map((i) => (i.id === item.id ? item : i)));
      router.refresh();
    },
  });

  function setParams(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    setSelected(new Set());
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }),
    );
  }

  // Debounced search box.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => setParams({ q: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Files still processing on the server: refresh until they are done.
  const processing = items.some((i) => i.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [processing, router]);

  const openItem = items.find((i) => i.id === openId) ?? null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const show =
    showOptions.find((o) => {
      if (!o.value) return false;
      const [k, v] = o.value.split(":");
      return params.get(k!) === v;
    })?.value ?? "";
  const sortValue = `${props.sort.desc ? "-" : ""}${props.sort.id}`;
  const filtered = Boolean(params.get("q") || params.get("type") || show);

  function upload(files: FileList | File[] | null) {
    if (!files || readOnly) return;
    const list = Array.from(files);
    if (list.length) uploader.add(list);
  }

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const dropHandlers = readOnly
    ? {}
    : {
        onDragEnter: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragDepth((d) => d + 1);
        },
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        },
        onDragLeave: () => setDragDepth((d) => Math.max(0, d - 1)),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragDepth(0);
          upload(e.dataTransfer.files);
        },
      };

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <FolderNav
        folders={folders}
        current={folder}
        onChoose={(path) => setParams({ folder: path })}
        readOnly={readOnly}
      />

      <div className="relative flex min-w-0 flex-col gap-3" {...dropHandlers}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <SearchIcon
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or alt text"
              aria-label="Search by name or alt text"
              className="ps-8"
            />
          </div>
          <Select
            label="Type"
            value={params.get("type") ?? ""}
            onChange={(v) => setParams({ type: v || null })}
            options={[
              { value: "", label: "All types" },
              { value: "image", label: "Images" },
              { value: "document", label: "Documents" },
            ]}
          />
          <Select
            label="Show"
            value={show}
            onChange={(v) => {
              const [k, val] = v.split(":");
              setParams({ usage: null, alt: null, status: null, ...(k ? { [k]: val! } : {}) });
            }}
            options={[...showOptions]}
          />
          <Select
            label="Sort"
            value={sortValue}
            onChange={(v) => setParams({ sort: v === "newest" ? null : v })}
            options={[...sortOptions]}
          />
          <div className="ms-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-input" role="group" aria-label="View">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={cn(view === "grid" && "bg-muted")}
                onClick={() => setParams({ view: null }, true)}
              >
                <LayoutGridIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="List view"
                aria-pressed={view === "list"}
                className={cn(view === "list" && "bg-muted")}
                onClick={() => setParams({ view: "list" }, true)}
              >
                <ListIcon />
              </Button>
            </div>
            {!readOnly && (
              <>
                <Button onClick={() => fileInput.current?.click()}>
                  <UploadIcon /> Upload
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={acceptAttribute}
                  className="hidden"
                  aria-label="Choose files to upload"
                  onChange={(e) => {
                    upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
        </div>
        {!readOnly && (
          <p className="text-[12px] text-text-muted">
            Drop files anywhere here. JPEG, PNG, WebP, GIF, AVIF, HEIC (converted to JPEG), SVG and
            PDF, up to {props.maxUploadMb} MB each. Location data is removed from photos.
            {folder ? ` Uploads go to “${folder}”.` : ""}
          </p>
        )}

        <UploadQueue entries={uploader.entries} onClear={uploader.clearFinished} />

        {selected.size > 0 && !readOnly && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[13px]"
          >
            <span className="font-semibold text-ink">{selected.size} selected</span>
            <form
              className="flex items-center gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await moveMedia({ ids: [...selected], folder: moveTo });
                if (!res.ok) return toast.error(res.error);
                toast.success(`${res.data.count} moved to ${moveTo || "the top level"}`);
                setSelected(new Set());
                setMoveTo("");
                router.refresh();
              }}
            >
              <Input
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                placeholder="Folder (empty = top level)"
                aria-label="Move to folder"
                list="media-move-folders"
                className="h-8 w-52"
              />
              <datalist id="media-move-folders">
                {folders.map((f) => (
                  <option key={f.path} value={f.path} />
                ))}
              </datalist>
              <Button type="submit" size="sm" variant="outline">
                Move
              </Button>
            </form>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="destructive">
                  Delete
                </Button>
              }
              title={`Delete ${selected.size} file${selected.size === 1 ? "" : "s"}?`}
              description="Only files that are not used anywhere are deleted. Files in use are kept and listed."
              confirmLabel="Delete unused"
              destructive
              onConfirm={async () => {
                const res = await deleteMedia({ ids: [...selected] });
                if (!res.ok) return toast.error(res.error);
                const { deleted, skipped } = res.data;
                if (deleted) toast.success(`${deleted} file${deleted === 1 ? "" : "s"} deleted`);
                if (skipped.length) {
                  toast.warning(
                    `${skipped.length} kept because they are in use: ${skipped
                      .slice(0, 3)
                      .map((s) => `${s.fileName} (${s.usedIn[0]})`)
                      .join(", ")}${skipped.length > 3 ? "…" : ""}`,
                  );
                }
                setSelected(new Set(skipped.map((s) => s.id)));
                router.refresh();
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        <div aria-busy={pending} className={cn(pending && "opacity-70")}>
          {items.length === 0 ? (
            <EmptyState
              icon={<FolderOpenIcon className="size-6" />}
              title={filtered ? "Nothing matches these filters" : "No files here yet"}
              description={
                filtered
                  ? "Try another search or filter."
                  : readOnly
                    ? undefined
                    : "Upload photos, logos or PDFs, or drop them here."
              }
              action={
                !filtered && !readOnly ? (
                  <Button onClick={() => fileInput.current?.click()}>
                    <UploadIcon /> Upload files
                  </Button>
                ) : undefined
              }
            />
          ) : view === "grid" ? (
            <ul
              aria-label="Files"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6"
            >
              {items.map((item) => (
                <li key={item.id} className="group relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className={cn(
                      "block w-full overflow-hidden rounded-lg border bg-surface text-start outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected.has(item.id)
                        ? "border-accent ring-2 ring-accent/40"
                        : "border-border",
                    )}
                    aria-label={`Open ${item.fileName}`}
                  >
                    <MediaThumb item={item} className="aspect-square" />
                  </button>
                  {!readOnly && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.fileName}`}
                      checked={selected.has(item.id)}
                      onChange={(e) => toggle(item.id, e.target.checked)}
                      className={cn(
                        "absolute start-2 top-2 size-4 accent-[var(--color-accent)] transition-opacity",
                        selected.size === 0 &&
                          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                      )}
                    />
                  )}
                  <div className="pointer-events-none absolute end-2 top-2 flex flex-col items-end gap-1">
                    <StatusBadges item={item} />
                  </div>
                  <p
                    className="mt-1.5 truncate text-[12.5px] font-medium text-ink"
                    title={item.fileName}
                  >
                    {item.fileName}
                  </p>
                  <p className="truncate text-[11.5px] text-text-muted tabular">
                    {[
                      item.width && item.height ? `${item.width}×${item.height}` : null,
                      formatBytes(item.sizeBytes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-start text-[13px]">
                <thead className="border-b border-border bg-surface-soft text-[12px] text-text-muted">
                  <tr>
                    {!readOnly && (
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          className="size-4 accent-[var(--color-accent)]"
                          checked={items.length > 0 && items.every((i) => selected.has(i.id))}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? new Set(items.map((i) => i.id)) : new Set(),
                            )
                          }
                        />
                      </th>
                    )}
                    <th className="px-3 py-2 text-start font-semibold" scope="col">
                      File
                    </th>
                    <th className="px-3 py-2 text-start font-semibold" scope="col">
                      Folder
                    </th>
                    <th className="px-3 py-2 text-start font-semibold" scope="col">
                      Size
                    </th>
                    <th className="px-3 py-2 text-start font-semibold" scope="col">
                      Used
                    </th>
                    <th className="px-3 py-2 text-start font-semibold" scope="col">
                      Uploaded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-0 hover:bg-surface-soft",
                        selected.has(item.id) && "bg-accent-soft/50",
                      )}
                      onClick={() => setOpenId(item.id)}
                    >
                      {!readOnly && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.fileName}`}
                            className="size-4 accent-[var(--color-accent)]"
                            checked={selected.has(item.id)}
                            onChange={(e) => toggle(item.id, e.target.checked)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <MediaThumb
                            item={item}
                            width={128}
                            className="size-10 shrink-0 rounded"
                          />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block max-w-[22rem] truncate font-medium text-ink hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(item.id);
                              }}
                            >
                              {item.fileName}
                            </button>
                            <div className="flex gap-1">
                              <StatusBadges item={item} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{item.folder || "—"}</td>
                      <td className="px-3 py-2 tabular">
                        {formatBytes(item.sizeBytes)}
                        {item.width && item.height ? (
                          <span className="block text-[11.5px] text-text-muted">
                            {item.width}×{item.height}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular">{item.usedCount}</td>
                      <td className="px-3 py-2 text-text-muted">
                        {dateFormat.format(new Date(item.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-text-muted">
            <span className="tabular">
              {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) }, true)}
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
                onClick={() => setParams({ page: String(page + 1) }, true)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        )}

        {dragDepth > 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80">
            <p className="text-[15px] font-semibold text-ink">
              Drop to upload{folder ? ` to “${folder}”` : ""}
            </p>
          </div>
        )}
      </div>

      <SidePanel
        wide
        open={openItem !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={openItem?.fileName ?? "File"}
      >
        {openItem && (
          <MediaDetails
            item={openItem}
            folders={folders.map((f) => f.path).filter(Boolean)}
            readOnly={readOnly}
            onChanged={(updated) => {
              setItems((list) => list.map((i) => (i.id === updated.id ? updated : i)));
              router.refresh();
            }}
            onDeleted={(id) => {
              setOpenId(null);
              setItems((list) => list.filter((i) => i.id !== id));
              router.refresh();
            }}
            onReplace={(file, item) => uploader.add([file], item)}
          />
        )}
      </SidePanel>
    </div>
  );
}

function StatusBadges({ item }: { item: MediaItem }): ReactNode {
  const badge = "rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-none";
  return (
    <>
      {item.status === "failed" && (
        <span className={cn(badge, "bg-danger text-white")}>Failed</span>
      )}
      {item.status === "processing" && (
        <span className={cn(badge, "bg-surface text-text-muted")}>Processing</span>
      )}
      {item.status === "ready" && item.kind === "image" && !item.alt && (
        <span className={cn(badge, "bg-surface text-ink ring-1 ring-border")}>No alt text</span>
      )}
      {item.status === "ready" && item.usedCount === 0 && (
        <span className={cn(badge, "bg-surface text-text-muted ring-1 ring-border")}>Unused</span>
      )}
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FolderNav({
  folders,
  current,
  onChoose,
  readOnly,
}: {
  folders: Folder[];
  current: string | null;
  onChoose: (path: string | null) => void;
  readOnly: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const all =
    current && !folders.some((f) => f.path === current)
      ? [...folders, { path: current, count: 0 }].sort((a, b) => a.path.localeCompare(b.path))
      : folders;
  const item = (label: string, path: string | null, depth = 0, count?: number) => {
    const active = current === path;
    return (
      <li key={path ?? "__all"}>
        <button
          type="button"
          aria-current={active ? "page" : undefined}
          onClick={() => onChoose(path)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px]",
            active
              ? "bg-accent-soft font-semibold text-ink"
              : "text-text-muted hover:bg-muted hover:text-ink",
          )}
          style={{ paddingInlineStart: `${0.5 + depth * 0.85}rem` }}
        >
          {active ? (
            <FolderOpenIcon className="size-4 shrink-0" />
          ) : (
            <FolderIcon className="size-4 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          {count !== undefined && <span className="ms-auto text-[11.5px] tabular">{count}</span>}
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Folders" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-0.5">
        {item("All files", null)}
        {item("Top level", "", 0, folders.find((f) => f.path === "")?.count ?? 0)}
        {all
          .filter((f) => f.path !== "")
          .map((f) => {
            const parts = f.path.split("/");
            return item(parts.at(-1)!, f.path, parts.length - 1, f.count);
          })}
      </ul>
      {!readOnly &&
        (adding ? (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const path = name
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean)
                .join("/");
              if (!path) return;
              setAdding(false);
              setName("");
              onChoose(path);
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              aria-label="New folder name"
              className="h-8"
              maxLength={100}
            />
            <Button type="submit" size="sm" variant="outline">
              Add
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setAdding(true)}
          >
            <FolderPlusIcon /> New folder
          </Button>
        ))}
    </nav>
  );
}
