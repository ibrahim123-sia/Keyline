"use client";

import { StarIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "cn";
import { TextInputField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { UploadQueue } from "@/components/admin/media/upload-queue";
import { useUploader } from "@/components/admin/media/use-uploader";
import { FormSection } from "@/components/admin/page-header";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptAttribute } from "@/features/media/schema";
import type { MediaItem } from "@/features/media/queries";
import type { ListingMedia } from "@/features/properties/schema";
import type { SectionProps } from "./types";

type Kind = ListingMedia["kind"];

/** Replaces the items of one kind, keeping the others where they are. */
export function withKind(all: ListingMedia[], kind: Kind, items: ListingMedia[]): ListingMedia[] {
  return [...all.filter((m) => m.kind !== kind), ...items];
}

/** Ordered files of one kind with alt text, captions, cover (photos) and remove. */
export function MediaList({
  kind,
  label,
  items,
  media,
  onChange,
  readOnly,
}: {
  kind: Kind;
  label: string;
  items: ListingMedia[];
  media: Record<string, MediaItem>;
  onChange: (items: ListingMedia[]) => void;
  readOnly: boolean;
}) {
  const set = (mediaId: string, patch: Partial<ListingMedia>) =>
    onChange(items.map((m) => (m.mediaId === mediaId ? { ...m, ...patch } : m)));
  const rows = items.map((m) => ({ ...m, id: m.mediaId }));
  if (items.length === 0)
    return <p className="text-[13px] text-text-muted">No {label.toLowerCase()} yet.</p>;
  return (
    <SortableList
      items={rows}
      disabled={readOnly}
      label={(m) => `Move ${media[m.mediaId]?.fileName ?? "file"}`}
      onReorder={(next) => onChange(next.map(({ id: _id, ...m }) => m))}
      renderItem={(m) => {
        const file = media[m.mediaId];
        const name = file?.fileName ?? "File";
        return (
          <div className="flex flex-wrap items-start gap-3 py-1.5 sm:flex-nowrap">
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md">
              {file ? (
                <MediaThumb item={file} width={256} className="h-full w-full" />
              ) : (
                <div className="h-full w-full bg-photo-placeholder" />
              )}
            </div>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-ink" htmlFor={`alt-${m.mediaId}`}>
                  Alt text: {name}
                </label>
                <Input
                  id={`alt-${m.mediaId}`}
                  value={m.alt}
                  maxLength={200}
                  placeholder={file?.alt || "What the photo shows"}
                  onChange={(e) => set(m.mediaId, { alt: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[12px] font-semibold text-ink"
                  htmlFor={`caption-${m.mediaId}`}
                >
                  Caption: {name}
                </label>
                <Input
                  id={`caption-${m.mediaId}`}
                  value={m.caption}
                  maxLength={200}
                  onChange={(e) => set(m.mediaId, { caption: e.target.value })}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-5">
              {kind === "photo" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={m.isCover}
                  aria-label={`Cover photo: ${name}`}
                  title={m.isCover ? "Cover photo" : "Make this the cover"}
                  disabled={readOnly}
                  className={cn(m.isCover && "text-accent")}
                  onClick={() =>
                    onChange(items.map((x) => ({ ...x, isCover: x.mediaId === m.mediaId })))
                  }
                >
                  <StarIcon className={cn(m.isCover && "fill-current")} />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${name}`}
                disabled={readOnly}
                className="text-text-muted hover:text-danger"
                onClick={() => onChange(items.filter((x) => x.mediaId !== m.mediaId))}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}

/** Drop zone and upload button; finished uploads are passed to `onAdd`. */
export function Uploads({
  kind,
  label,
  onAdd,
  readOnly,
  folder,
}: {
  kind: Kind;
  label: string;
  onAdd: (items: MediaItem[]) => void;
  readOnly: boolean;
  /** Media library folder for the uploads (listings by default). */
  folder?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const uploader = useUploader({
    folder: folder ?? (kind === "photo" ? "listings" : "listings/plans"),
    onUploaded: (item) => onAdd([item]),
  });
  if (readOnly) return null;
  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          uploader.add([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 text-[13px] text-text-muted",
          over ? "border-accent bg-accent-soft" : "border-border",
        )}
      >
        <span>Drop {label.toLowerCase()} here, or</span>
        <input
          id={inputId}
          ref={input}
          type="file"
          multiple
          accept={acceptAttribute}
          className="sr-only"
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={(e) => {
            if (e.target.files) uploader.add([...e.target.files]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <UploadIcon /> Upload {label.toLowerCase()}
        </Button>
      </div>
      <UploadQueue entries={uploader.entries} onClear={uploader.clearFinished} />
    </div>
  );
}

/** 07 §3.8 Media: photos (order, cover, alt text, captions), floor plans, video, tour, brochure. */
export function MediaSection({
  data,
  set,
  errorFor,
  media,
  rememberMedia,
  readOnly,
}: SectionProps) {
  const of = (kind: Kind) => data.media.filter((m) => m.kind === kind);
  const add = (kind: Kind) => (items: MediaItem[]) => {
    rememberMedia(items);
    const current = of(kind);
    const fresh = items
      .filter((i) => !current.some((m) => m.mediaId === i.id))
      .map((i) => ({
        mediaId: i.id,
        kind,
        isCover: kind === "photo" && current.length === 0,
        caption: "",
        alt: "",
      }));
    if (fresh.length) set({ media: withKind(data.media, kind, [...current, ...fresh]) });
  };
  const brochure = of("brochure")[0] ?? null;
  const photos = of("photo");

  return (
    <FormSection
      id="media"
      title="Media"
      description={`${photos.length} ${photos.length === 1 ? "photo" : "photos"}. Drag to reorder; the star marks the cover. Alt text describes a photo for screen readers and search.`}
    >
      {errorFor("media") && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {errorFor("media")}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Photos</h3>
        <Uploads kind="photo" label="Photos" onAdd={add("photo")} readOnly={readOnly} />
        <MediaList
          kind="photo"
          label="Photos"
          items={photos}
          media={media}
          readOnly={readOnly}
          onChange={(items) => set({ media: withKind(data.media, "photo", items) })}
        />
        {!readOnly && (
          <MediaPicker
            label="Add a photo from the library"
            value={null}
            onChange={(_id, item) => item && add("photo")([item])}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-[13px] font-semibold text-ink">Floor plans</h3>
        <Uploads
          kind="floor_plan"
          label="Floor plans"
          onAdd={add("floor_plan")}
          readOnly={readOnly}
        />
        <MediaList
          kind="floor_plan"
          label="Floor plans"
          items={of("floor_plan")}
          media={media}
          readOnly={readOnly}
          onChange={(items) => set({ media: withKind(data.media, "floor_plan", items) })}
        />
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <TextInputField
          label="Video link"
          type="url"
          placeholder="https://"
          value={data.videoUrl ?? ""}
          onChange={(v) => set({ videoUrl: v || null })}
          error={errorFor("videoUrl")}
        />
        <TextInputField
          label="360° tour link"
          type="url"
          placeholder="https://"
          value={data.tourUrl ?? ""}
          onChange={(v) => set({ tourUrl: v || null })}
          error={errorFor("tourUrl")}
        />
      </div>
      <MediaPicker
        label="Brochure"
        description="A PDF visitors can download. A brochure is generated from the listing when you leave this empty."
        type="document"
        value={brochure?.mediaId ?? null}
        disabled={readOnly}
        onChange={(id, item) => {
          if (item) rememberMedia([item]);
          set({
            media: withKind(
              data.media,
              "brochure",
              id ? [{ mediaId: id, kind: "brochure", isCover: false, caption: "", alt: "" }] : [],
            ),
          });
        }}
      />
    </FormSection>
  );
}
