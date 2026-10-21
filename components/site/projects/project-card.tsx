import { CalendarClockIcon, MapPinIcon } from "lucide-react";
import { handoverLabel } from "@/components/site/listings/listing-card";
import { MediaImage } from "@/components/site/media-image";
import { PriceTag } from "@/components/site/price-tag";
import type { ProjectCardData } from "@/features/projects/public";
import type { Rates } from "@/lib/currency-display";
import { format, pages } from "@/lib/i18n";

/** ProjectCard (02 §4): cover, status, name, developer and area, price from, handover, plan. */
export function ProjectCard({
  project: p,
  visitorCurrency,
  rates,
  priority,
  headingLevel = 3,
}: {
  project: ProjectCardData;
  visitorCurrency: string;
  rates: Rates;
  priority?: boolean;
  headingLevel?: 2 | 3;
}) {
  const t = pages.projects;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const href = `/projects/${p.slug}`;
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-soft transition-shadow hover:shadow-md">
      <div className="relative">
        {p.cover ? (
          <MediaImage
            src={p.cover.url}
            alt=""
            sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
            color={p.cover.color}
            priority={priority}
            maxWidth={1080}
          />
        ) : (
          <div className="aspect-[4/3] w-full bg-photo-placeholder" />
        )}
        <span className="absolute start-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-[12px] font-semibold text-ink">
          {t.statuses[p.status]}
        </span>
        {p.planLabel && (
          <span className="absolute end-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-surface">
            {p.planLabel}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <Heading className="font-display text-[19px] leading-snug font-medium text-ink md:text-[21px]">
          <a
            href={href}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {p.name}
          </a>
        </Heading>
        {(p.developerName || p.locationName) && (
          <p className="flex items-center gap-1 text-[13.5px] text-text-muted">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            {[p.developerName, p.locationName].filter(Boolean).join(" · ")}
          </p>
        )}
        <PriceTag
          price={p.startingPrice}
          currency={p.currency}
          visitorCurrency={visitorCurrency}
          rates={rates}
          from
          onRequestText={t.priceOnRequest}
          className="text-[19px]"
        />
        <div className="mt-auto flex flex-col gap-1 text-[13px] text-text-muted">
          {p.handover && (
            <p className="flex items-center gap-1">
              <CalendarClockIcon className="size-3.5" aria-hidden />
              {format(t.handoverLabel, { when: handoverLabel(p.handover) })}
            </p>
          )}
          {p.unitTypes && <p>{p.unitTypes}</p>}
          {p.progress != null && (
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <span className="tabular">{format(t.progress, { value: p.progress })}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
