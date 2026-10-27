"use client";

import { ImagePlusIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { filterExistingMedia, searchMedia } from "@/features/media/actions";
import type { MediaItem } from "@/features/media/queries";
import { acceptAttribute } from "@/features/media/schema";
import { MediaThumb } from "./media-thumb";
import { UploadQueue } from "./upload-queue";
import { useUploader } from "./use-uploader";

type Page = { rows: MediaItem[]; total: number; folders: Array<{ path: string; count: number }> };

/**
 * MediaPicker (02 §4): shows the chosen file and opens the library in a dialog to pick
 * another or upload a new one. The value is a media id.
 */
export function MediaPicker({
  label,
  description,
  value,
  onChange,
  type = "image",
  error,
  disabled,
}: {
  label: string;
  description?: string;
  value: string | null;
  onChange: (id: string | null, item: MediaItem | null) => void;
  type?: "image" | "document";
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The file behind `value`, once looked up (item null = it no longer exists).
  const [loaded, setLoaded] = useState<{ id: string; item: MediaItem | null } | null>(null);
  const labelId = useId();
  const descriptionId = useId();
  const known = value !== null && loaded?.id === value;
  const current = known ? loaded!.item : null;

  useEffect(() => {
    if (!value || loaded?.id === value) return;
    let cancelled = false;
    void filterExistingMedia({ ids: [value] }).then((res) => {
      if (!cancelled && res.ok) setLoaded({ id: value, item: res.data[0] ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [value, loaded?.id]);

  const noun = type === "image" ? "image" : "document";
  return (
    // A group, not a <label>: the buttons keep their own names ("Choose image", "Remove").
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      className="flex flex-col gap-1.5"
    >
      <span id={labelId} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      <div className="flex items-center gap-3">
        {value && current ? (
          <MediaThumb
            item={current}
            width={256}
            fit="contain"
            className="size-20 shrink-0 rounded-md border border-border"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-input text-text-muted">
            <ImagePlusIcon className="size-6" aria-hidden />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          {value && current && (
            <span className="truncate text-[13px] font-medium text-ink">{current.fileName}</span>
          )}
          {value && !known && <span className="text-[13px] text-text-muted">Loading…</span>}
          {value && known && !current && (
            <span className="text-[13px] text-danger">This file was deleted. Choose another.</span>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setOpen(true)}
            >
              {value ? `Change ${noun}` : `Choose ${noun}`}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(null, null)}
              >
                <XIcon /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <PickerDialog
          type={type}
          selectedId={value}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            setLoaded({ id: item.id, item });
            onChange(item.id, item);
            setOpen(false);
          }}
        />
      )}
      {description && (
        <p id={descriptionId} className="text-[12.5px] text-text-muted">
          {description}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The library dialog on its own (mounted = open), e.g. to insert images into a post. */
export function MediaPickerDialog(props: Parameters<typeof PickerDialog>[0]) {
  return <PickerDialog {...props} />;
}

function PickerDialog({
  type,
  selectedId,
  onClose,
  onPick,
}: {
  type: "image" | "document";
  selectedId: string | null;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
}) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(selectedId);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (opts: { q: string; folder: string | null; page: number; append: boolean }) => {
      setLoading(true);
      const res = await searchMedia({ q: opts.q, folder: opts.folder, type, page: opts.page });
      setLoading(false);
      if (!res.ok) return toast.error(res.error);
      setData((prev) =>
        opts.append && prev ? { ...res.data, rows: [...prev.rows, ...res.data.rows] } : res.data,
      );
    },
    [type],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void load({ q, folder, page: 1, append: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, folder, load]);

  const uploader = useUploader({
    folder: folder ?? "",
    onUploaded: (item) => {
      // The list may already hold it (loaded while it was processing): replace, never duplicate.
      setData((prev) => {
        if (!prev) return prev;
        const known = prev.rows.some((r) => r.id === item.id);
        return {
          ...prev,
          rows: [item, ...prev.rows.filter((r) => r.id !== item.id)],
          total: known ? prev.total : prev.total + 1,
        };
      });
      setChosen(item.id);
    },
  });

  const rows = (data?.rows ?? []).filter((r) => r.kind === type);
  const chosenItem = rows.find((r) => r.id === chosen) ?? null;
  const more = data ? data.rows.length < data.total : false;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose {type === "image" ? "an image" : "a document"}</DialogTitle>
          <DialogDescription>Pick from the media library or upload a new file.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <SearchIcon
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or alt text"
              aria-label="Search the library"
              className="ps-8"
            />
          </div>
          <select
            aria-label="Folder"
            value={folder ?? "__all"}
            onChange={(e) => setFolder(e.target.value === "__all" ? null : e.target.value)}
            className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
          >
            <option value="__all">All folders</option>
            <option value="">Top level</option>
            {(data?.folders ?? [])
              .filter((f) => f.path)
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
          </select>
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
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
              if (e.target.files?.length) uploader.add(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
        <UploadQueue entries={uploader.entries} onClear={uploader.clearFinished} />
        <div className="min-h-48 overflow-y-auto" aria-busy={loading}>
          {data && rows.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-text-muted">
              {q ? "No files match this search." : "No files yet. Upload one to get started."}
            </p>
          ) : (
            <ul aria-label="Files" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {rows.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={chosen === item.id}
                    aria-label={item.fileName}
                    onClick={() => setChosen(item.id)}
                    onDoubleClick={() => item.status === "ready" && onPick(item)}
                    disabled={item.status !== "ready"}
                    className={cn(
                      "block w-full overflow-hidden rounded-md border-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                      chosen === item.id ? "border-accent" : "border-transparent",
                    )}
                  >
                    <MediaThumb item={item} width={256} className="aspect-square" />
                    <span className="block truncate px-1 py-0.5 text-[11.5px] text-text-muted">
                      {item.fileName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {more && (
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  void load({ q, folder, page: next, append: true });
                }}
              >
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          {chosenItem && type === "image" && !chosenItem.alt && (
            <p className="me-auto self-center text-[12.5px] text-text-muted">
              This image has no alt text yet. Add it in Media.
            </p>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!chosenItem || chosenItem.status !== "ready"}
            onClick={() => chosenItem && onPick(chosenItem)}
          >
            Use this {type === "image" ? "image" : "document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
