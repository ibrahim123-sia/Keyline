import { AlertTriangleIcon, FileTextIcon, ImageIcon, LoaderCircleIcon } from "lucide-react";
import { cn } from "cn";
import type { MediaItem } from "@/features/media/queries";

/** Thumbnail URL: resized on Workers, Next's optimizer in development. */
export function thumbUrl(url: string, width: number): string {
  return url.endsWith(".svg") ? url : `${url}?w=${width}&q=60`;
}

/**
 * Square-ish preview for grids and pickers: the placeholder colour while loading, an icon
 * for documents, a spinner while processing, a warning when processing failed.
 */
export function MediaThumb({
  item,
  width = 384,
  className,
  fit = "cover",
}: {
  item: Pick<MediaItem, "url" | "kind" | "status" | "dominantColor" | "alt" | "fileName" | "mime">;
  width?: number;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const box = cn(
    "relative flex items-center justify-center overflow-hidden bg-surface-muted",
    className,
  );
  if (item.status === "processing" || item.status === "uploading") {
    return (
      <div className={box}>
        <LoaderCircleIcon className="size-6 animate-spin text-text-muted" aria-hidden />
        <span className="sr-only">Processing</span>
      </div>
    );
  }
  if (item.status === "failed" || !item.url) {
    return (
      <div className={cn(box, "bg-danger/5")}>
        <AlertTriangleIcon className="size-6 text-danger" aria-hidden />
        <span className="sr-only">Failed</span>
      </div>
    );
  }
  if (item.kind !== "image") {
    return (
      <div className={box}>
        <FileTextIcon className="size-8 text-text-muted" aria-hidden />
        <span className="absolute bottom-1.5 rounded bg-surface px-1.5 text-[10.5px] font-semibold text-text-muted">
          {item.mime === "application/pdf" ? "PDF" : "FILE"}
        </span>
      </div>
    );
  }
  return (
    <div
      className={box}
      style={item.dominantColor ? { backgroundColor: item.dominantColor } : undefined}
    >
      <ImageIcon className="absolute size-6 text-white/40" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own (see app/media) */}
      <img
        src={thumbUrl(item.url, width)}
        alt={item.alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(
          "relative h-full w-full",
          fit === "cover" ? "object-cover" : "object-contain",
        )}
      />
    </div>
  );
}
