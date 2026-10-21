import { MediaImage } from "@/components/site/media-image";
import type { GuideCardData } from "@/features/area-guides/public";
import { format } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

/** An area guide on /areas: cover, name, intro and the homes on the site there now. */
export function GuideCard({ guide: g, priority }: { guide: GuideCardData; priority?: boolean }) {
  const t = content.areas;
  const counts = [
    g.counts.sale
      ? g.counts.sale === 1
        ? t.forSaleOne
        : format(t.forSale, { count: g.counts.sale })
      : null,
    g.counts.rent
      ? g.counts.rent === 1
        ? t.toRentOne
        : format(t.toRent, { count: g.counts.rent })
      : null,
  ].filter(Boolean);
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-soft transition-shadow hover:shadow-md">
      {g.cover ? (
        <MediaImage
          src={g.cover.url}
          alt=""
          aspect="16 / 10"
          sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
          color={g.cover.dominantColor}
          priority={priority}
          maxWidth={1080}
        />
      ) : (
        <div className="aspect-[16/10] w-full bg-photo-placeholder" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <h2 className="font-display text-[21px] leading-snug font-medium text-ink">
          <a
            href={`/areas/${g.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {g.title}
          </a>
        </h2>
        {g.intro && <p className="line-clamp-3 text-[15px] text-text">{g.intro}</p>}
        {counts.length > 0 && (
          <p className="mt-auto pt-1 text-[13px] font-semibold text-ink">{counts.join(" · ")}</p>
        )}
      </div>
    </article>
  );
}
