import { cn } from "cn";
import { mediaSrcSet, mediaVariant } from "@/lib/media-src";

/**
 * A library image on the site: responsive `srcset` from /media variants, fixed aspect ratio
 * (no layout shift), the photo placeholder colour while loading (02 §8), lazy by default.
 * Server-friendly (no client JS); `priority` for the first image above the fold (LCP).
 */
export function MediaImage({
  src,
  alt,
  sizes,
  className,
  aspect = "4 / 3",
  color,
  priority,
  maxWidth = 1920,
  fit = "cover",
}: {
  src: string;
  alt: string;
  /** e.g. "(min-width: 1024px) 33vw, 100vw" */
  sizes: string;
  className?: string;
  /** CSS aspect-ratio of the box. */
  aspect?: string;
  /** The image's own average colour, shown until it loads. */
  color?: string | null;
  priority?: boolean;
  maxWidth?: number;
  fit?: "cover" | "contain";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- /media makes the sizes itself
    <img
      src={mediaVariant(src, 640)}
      srcSet={mediaSrcSet(src, maxWidth)}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("w-full", fit === "cover" ? "object-cover" : "object-contain", className)}
      style={{ aspectRatio: aspect, backgroundColor: color ?? undefined }}
    />
  );
}
