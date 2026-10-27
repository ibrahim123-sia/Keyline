"use client";

import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { mediaSrcSet, mediaVariant } from "@/lib/media-src";
import { videoEmbedUrl } from "@/lib/video";

export type LightboxTab = "photos" | "plans" | "video" | "tour";

export type LightboxMedia = {
  photos: Array<{ url: string; alt: string; caption: string | null }>;
  plans: Array<{ url: string; alt: string; caption: string | null; mime: string }>;
  videoUrl: string | null;
  tourUrl: string | null;
};

function Slides({
  items,
  index,
  onIndex,
}: {
  items: Array<{ url: string; alt: string; caption: string | null; mime?: string }>;
  index: number;
  onIndex: (i: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  // Scroll the chosen slide into view (keyboard, buttons, opening at a photo).
  useEffect(() => {
    const el = track.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "instant", inline: "start", block: "nearest" });
  }, [index]);
  // Swiping updates the index from the scroll position.
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index && i >= 0 && i < items.length) onIndex(i);
  };
  const item = items[index];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {items.map((p, i) => (
          <figure
            key={p.url}
            className="flex w-full shrink-0 snap-start items-center justify-center p-2 sm:p-6"
            aria-hidden={i !== index}
          >
            {p.mime === "application/pdf" ? (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-ink"
              >
                {p.caption || p.alt || t.gallery.floorPlan} <ExternalLinkIcon className="size-4" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- /media makes the sizes itself
              <img
                src={mediaVariant(p.url, 1920)}
                srcSet={mediaSrcSet(p.url, 2048, 640)}
                sizes="100vw"
                alt={p.alt}
                loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                decoding="async"
                className="max-h-full max-w-full object-contain"
              />
            )}
          </figure>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t.gallery.previous}
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
            className="absolute start-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-pin disabled:opacity-30 sm:flex"
          >
            <ChevronLeftIcon className="size-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            aria-label={t.gallery.next}
            disabled={index === items.length - 1}
            onClick={() => onIndex(index + 1)}
            className="absolute end-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-pin disabled:opacity-30 sm:flex"
          >
            <ChevronRightIcon className="size-5 rtl:rotate-180" />
          </button>
        </>
      )}
      <p className="px-4 pb-3 text-center text-[13px] text-surface/80" aria-live="polite">
        {format(t.gallery.counter, { n: index + 1, total: items.length })}
        {item?.caption ? ` · ${item.caption}` : ""}
      </p>
    </div>
  );
}

/**
 * Full-screen viewer (06 §5.3): tabs for photos, floor plans, video and the 360 tour; arrows,
 * swipe and the keyboard (left/right, Esc). Embeds load only when their tab opens. Mounted
 * fresh for each opening (see LightboxProvider), so it starts at the requested photo.
 */
export function Lightbox({
  media,
  title,
  tab: initialTab,
  index: initialIndex,
  onClose,
}: {
  media: LightboxMedia;
  title: string;
  tab: LightboxTab;
  index: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LightboxTab>(initialTab);
  const [photo, setPhoto] = useState(initialTab === "photos" ? initialIndex : 0);
  const [plan, setPlan] = useState(initialTab === "plans" ? initialIndex : 0);

  const embed = media.videoUrl ? videoEmbedUrl(media.videoUrl) : null;
  const tabs: Array<{ key: LightboxTab; label: string }> = [
    ...(media.photos.length ? [{ key: "photos" as const, label: t.gallery.photos }] : []),
    ...(media.plans.length ? [{ key: "plans" as const, label: t.gallery.floorPlans }] : []),
    ...(media.videoUrl ? [{ key: "video" as const, label: t.gallery.video }] : []),
    ...(media.tourUrl ? [{ key: "tour" as const, label: t.gallery.tour }] : []),
  ];

  const onKey = (e: React.KeyboardEvent) => {
    const list = tab === "photos" ? media.photos : tab === "plans" ? media.plans : null;
    if (!list) return;
    const [i, set] = tab === "photos" ? [photo, setPhoto] : [plan, setPlan];
    if (e.key === "ArrowRight") set(Math.min(list.length - 1, i + 1));
    if (e.key === "ArrowLeft") set(Math.max(0, i - 1));
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/95" />
        <DialogPrimitive.Content
          onKeyDown={onKey}
          className="fixed inset-0 z-50 flex flex-col text-surface outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5">
            <DialogPrimitive.Title className="truncate text-[14px] font-semibold">
              {format(t.gallery.dialogTitle, { title })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t.gallery.close}
              className="flex size-10 items-center justify-center rounded-full hover:bg-surface/10"
            >
              <XIcon className="size-5" />
            </DialogPrimitive.Close>
          </div>
          {tabs.length > 1 && (
            <div role="tablist" aria-label={title} className="flex justify-center gap-1 px-3 pb-2">
              {tabs.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === x.key}
                  onClick={() => setTab(x.key)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[13.5px] font-semibold",
                    tab === x.key ? "bg-surface text-ink" : "text-surface/80 hover:bg-surface/10",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
            {tab === "photos" && media.photos.length > 0 && (
              <Slides items={media.photos} index={photo} onIndex={setPhoto} />
            )}
            {tab === "plans" && media.plans.length > 0 && (
              <Slides items={media.plans} index={plan} onIndex={setPlan} />
            )}
            {tab === "video" && media.videoUrl && (
              <div className="flex flex-1 items-center justify-center p-3 sm:p-8">
                {embed ? (
                  <iframe
                    src={embed}
                    title={t.gallery.video}
                    className="aspect-video w-full max-w-5xl rounded-lg bg-black"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <a
                    href={media.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-3 text-[15px] font-semibold text-ink"
                  >
                    {t.gallery.openVideo} <ExternalLinkIcon className="size-4" />
                  </a>
                )}
              </div>
            )}
            {tab === "tour" && media.tourUrl && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3 sm:p-8">
                <iframe
                  src={media.tourUrl}
                  title={t.gallery.tour}
                  className="min-h-0 w-full max-w-6xl flex-1 rounded-lg bg-black"
                  allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                <a
                  href={media.tourUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13.5px] text-surface/80 underline-offset-2 hover:underline"
                >
                  {t.gallery.openTour} <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
