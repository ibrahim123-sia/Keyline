"use client";

import { CopyIcon, DownloadIcon, ExternalLinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { TextInputField, TextareaField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cropPresets, type CropPreset, type CropRect } from "@/db/schema/media";
import {
  deleteMedia,
  getMediaDetail,
  saveMediaCrops,
  updateMediaDetails,
} from "@/features/media/actions";
import type { MediaItem } from "@/features/media/queries";
import { acceptAttribute, defaultCrop, presetLabel } from "@/features/media/schema";
import type { MediaUse } from "@/features/media/usage";
import { useAction } from "@/lib/use-action";
import { CropEditor } from "./crop-editor";
import { MediaThumb, thumbUrl } from "./media-thumb";
import { formatBytes } from "./upload-utils";

type Detail = { item: MediaItem; uses: MediaUse[]; formatLabel: string };

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** Everything about one file (07 §8), shown in the library's side panel. */
export function MediaDetails({
  item,
  folders,
  readOnly,
  onChanged,
  onDeleted,
  onReplace,
}: {
  item: MediaItem;
  folders: string[];
  readOnly?: boolean;
  onChanged: (item: MediaItem) => void;
  onDeleted: (id: string) => void;
  onReplace: (file: File, item: MediaItem) => void;
}) {
  const formId = useId();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState({ alt: item.alt, caption: item.caption, folder: item.folder });

  // Reload when another file is opened or this one changes (replace, processing).
  useEffect(() => {
    let cancelled = false;
    void getMediaDetail({ id: item.id }).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(res.data);
      else toast.error(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.updatedAt]);

  const [formFor, setFormFor] = useState(item.id);
  if (formFor !== item.id) {
    setFormFor(item.id);
    setForm({ alt: item.alt, caption: item.caption, folder: item.folder });
  }

  const save = useAction(updateMediaDetails, {
    success: "File details saved",
    onSuccess: (updated) => onChanged(updated),
  });

  const uses = detail?.uses ?? [];
  const absoluteUrl = item.url ? new URL(item.url, window.location.origin).href : null;
  const isPhoto =
    item.kind === "image" && item.mime !== "image/svg+xml" && !!item.width && !!item.height;

  return (
    <div className="flex flex-col gap-6">
      {item.processingError && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger"
        >
          {item.processingError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <MediaThumb
          item={item}
          width={640}
          fit="contain"
          className="aspect-[4/3] w-full shrink-0 rounded-md sm:w-56"
        />
        <dl className="grid grow grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-text-muted">File</dt>
          <dd className="truncate font-medium text-ink" title={item.fileName}>
            {item.fileName}
          </dd>
          <dt className="text-text-muted">Type</dt>
          <dd>{detail?.formatLabel ?? item.mime}</dd>
          <dt className="text-text-muted">Size</dt>
          <dd className="tabular">{formatBytes(item.sizeBytes)}</dd>
          {item.width && item.height && (
            <>
              <dt className="text-text-muted">Dimensions</dt>
              <dd className="tabular">
                {item.width} × {item.height}
              </dd>
            </>
          )}
          <dt className="text-text-muted">Uploaded</dt>
          <dd>{dateFormat.format(new Date(item.createdAt))}</dd>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        {absoluteUrl && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(absoluteUrl)
                  .then(() => toast.success("Link copied"))
                  .catch(() => toast.error("Could not copy the link"))
              }
            >
              <CopyIcon /> Copy link
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={item.url!} download={item.fileName}>
                <DownloadIcon /> Download
              </a>
            </Button>
          </>
        )}
        {!readOnly && item.status === "ready" && (
          <>
            <Button variant="outline" size="sm" onClick={() => replaceInput.current?.click()}>
              <RefreshCwIcon /> Replace file
            </Button>
            <input
              ref={replaceInput}
              type="file"
              accept={acceptAttribute}
              className="hidden"
              aria-label="Choose a replacement file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onReplace(file, item);
              }}
            />
          </>
        )}
      </div>

      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run({ id: item.id, data: form });
        }}
      >
        {item.kind === "image" && (
          <TextareaField
            label="Alt text"
            description="Describe what the image shows, for screen readers and search engines. Leave empty only for decorative images."
            rows={2}
            maxLength={250}
            value={form.alt}
            onChange={(alt) => setForm((f) => ({ ...f, alt }))}
            error={save.errorFor("alt")}
          />
        )}
        <TextInputField
          label="Caption"
          maxLength={500}
          value={form.caption}
          onChange={(caption) => setForm((f) => ({ ...f, caption }))}
          error={save.errorFor("caption")}
        />
        <TextInputField
          label="Folder"
          description='Use "/" for sub-folders, e.g. Listings/Marina Gate. Leave empty for the top level.'
          value={form.folder}
          suggestions={folders}
          onChange={(folder) => setForm((f) => ({ ...f, folder }))}
          error={save.errorFor("folder")}
        />
        {!readOnly && (
          <div>
            <Button type="submit" disabled={save.pending}>
              {save.pending ? "Saving…" : "Save details"}
            </Button>
          </div>
        )}
      </form>

      {isPhoto && item.url && (
        <CropsSection item={item} readOnly={readOnly} onChanged={onChanged} />
      )}

      <section aria-labelledby={`${formId}-uses`} className="flex flex-col gap-2">
        <h3 id={`${formId}-uses`} className="text-[13px] font-semibold text-ink">
          Used in
        </h3>
        {!detail ? (
          <p className="text-[13px] text-text-muted">Checking…</p>
        ) : uses.length === 0 ? (
          <p className="text-[13px] text-text-muted">Not used anywhere yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[13px]">
            {uses.map((u) => (
              <li key={`${u.label}-${u.href}`}>
                {u.href ? (
                  <Link
                    href={u.href}
                    className="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
                  >
                    {u.label}
                    <ExternalLinkIcon className="size-3" aria-hidden />
                  </Link>
                ) : (
                  u.label
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <div className="border-t border-border pt-4">
          {uses.length > 0 ? (
            <p className="text-[13px] text-text-muted">
              This file is in use, so it cannot be deleted. Remove it from the places above first,
              or replace it with another file.
            </p>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" disabled={!detail}>
                  <Trash2Icon /> Delete file
                </Button>
              }
              title={`Delete ${item.fileName}?`}
              description="The file is removed for good. Pages do not use it, so nothing breaks."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                const res = await deleteMedia({ ids: [item.id] });
                if (!res.ok) return toast.error(res.error);
                if (res.data.deleted === 0) {
                  return toast.error("This file started being used, so it was kept.");
                }
                toast.success("File deleted");
                onDeleted(item.id);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CropsSection({
  item,
  readOnly,
  onChanged,
}: {
  item: MediaItem;
  readOnly?: boolean;
  onChanged: (item: MediaItem) => void;
}) {
  const image = { width: item.width!, height: item.height! };
  const initial = () =>
    Object.fromEntries(
      cropPresets.map((p) => [p, item.crops[p] ?? defaultCrop(p, image)]),
    ) as Record<CropPreset, CropRect>;
  const [crops, setCrops] = useState(initial);
  const [cropsFor, setCropsFor] = useState(`${item.id}:${item.updatedAt}`);
  if (cropsFor !== `${item.id}:${item.updatedAt}`) {
    setCropsFor(`${item.id}:${item.updatedAt}`);
    setCrops(initial());
  }
  const save = useAction(saveMediaCrops, {
    success: "Crops saved",
    onSuccess: (updated) => onChanged(updated),
  });
  const src = thumbUrl(item.url!, 828);

  return (
    <section className="flex flex-col gap-3" aria-label="Crops">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Crops</h3>
        <p className="text-[12.5px] text-text-muted">
          Choose the part of the photo each layout shows. Unchanged crops use the centre.
        </p>
      </div>
      <Tabs defaultValue="16:10">
        <TabsList>
          {cropPresets.map((p) => (
            <TabsTrigger key={p} value={p}>
              {p === "og" ? "Share" : p}
            </TabsTrigger>
          ))}
        </TabsList>
        {cropPresets.map((p) => (
          <TabsContent key={p} value={p} className="flex flex-col gap-2 pt-2">
            <CropEditor
              src={src}
              image={image}
              preset={p}
              value={crops[p]}
              onChange={(rect) => setCrops((c) => ({ ...c, [p]: rect }))}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-text-muted">{presetLabel[p]}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCrops((c) => ({ ...c, [p]: defaultCrop(p, image) }))}
              >
                Centre
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {!readOnly && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={save.pending}
            onClick={() => void save.run({ id: item.id, crops })}
          >
            {save.pending ? "Saving…" : "Save crops"}
          </Button>
        </div>
      )}
    </section>
  );
}
