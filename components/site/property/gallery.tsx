import { Grid2x2Icon, PlayCircleIcon, RotateCcwIcon, SquareDashedIcon } from "lucide-react";
import { MediaImage } from "@/components/site/media-image";
import type { PublicListing } from "@/features/listings/public";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { LightboxProvider, LightboxTrigger } from "./lightbox-provider";

/**
 * Gallery (06 §5.3): one large 16:10 photo and four small ones; buttons open the full-screen
 * viewer on photos, floor plans, video or the 360 tour. The first photo is the page's LCP
 * image, so it loads eagerly with high priority.
 */
export function Gallery({ listing }: { listing: PublicListing }) {
  const { photos, floorPlans } = listing;
  const media = {
    photos: photos.map((p) => ({ url: p.url, alt: p.alt, caption: p.caption })),
    plans: floorPlans,
    videoUrl: listing.videoUrl,
    tourUrl: listing.tourUrl,
  };
  const [first, ...rest] = photos;
  const small = rest.slice(0, 4);
  const chip =
    "inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-pin hover:bg-surface";

  return (
    <LightboxProvider media={media} title={listing.title}>
      <div className="relative">
        {first ? (
          <div className="grid gap-2 md:grid-cols-4 md:grid-rows-2">
            <LightboxTrigger
              index={0}
              label={`${t.gallery.open}: ${first.alt || listing.title}`}
              className="block overflow-hidden rounded-[24px] md:col-span-2 md:row-span-2 md:rounded-e-none"
            >
              <MediaImage
                src={first.url}
                alt={first.alt}
                color={first.color}
                aspect="16 / 10"
                sizes="(min-width: 1200px) 600px, (min-width: 768px) 50vw, 100vw"
                maxWidth={1920}
                priority
                className="h-full transition-transform duration-300 hover:scale-[1.02]"
              />
            </LightboxTrigger>
            {small.map((p, i) => (
              <LightboxTrigger
                key={p.url}
                index={i + 1}
                label={`${t.gallery.open}: ${p.alt || listing.title}`}
                className={
                  "hidden overflow-hidden md:block " +
                  (i === 1 ? "md:rounded-se-[24px] " : "") +
                  (i === 3 ? "md:rounded-ee-[24px]" : "")
                }
              >
                <MediaImage
                  src={p.url}
                  alt={p.alt}
                  color={p.color}
                  aspect="16 / 10"
                  sizes="(min-width: 1200px) 300px, 25vw"
                  maxWidth={828}
                  className="h-full transition-transform duration-300 hover:scale-[1.03]"
                />
              </LightboxTrigger>
            ))}
          </div>
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center rounded-[24px] bg-photo-placeholder text-[14px] text-text-muted md:aspect-[16/6]">
            {t.gallery.noPhotos}
          </div>
        )}

        <div className="absolute end-3 bottom-3 flex flex-wrap justify-end gap-2">
          {photos.length > 0 && (
            <LightboxTrigger className={chip}>
              <Grid2x2Icon className="size-4" aria-hidden />
              {t.gallery.open} ({photos.length})
            </LightboxTrigger>
          )}
          {floorPlans.length > 0 && (
            <LightboxTrigger tab="plans" className={chip}>
              <SquareDashedIcon className="size-4" aria-hidden />
              {t.gallery.floorPlan}
            </LightboxTrigger>
          )}
          {listing.videoUrl && (
            <LightboxTrigger tab="video" className={chip}>
              <PlayCircleIcon className="size-4" aria-hidden />
              {t.gallery.video}
            </LightboxTrigger>
          )}
          {listing.tourUrl && (
            <LightboxTrigger tab="tour" className={chip}>
              <RotateCcwIcon className="size-4" aria-hidden />
              {t.gallery.tour}
            </LightboxTrigger>
          )}
        </div>
      </div>
    </LightboxProvider>
  );
}
