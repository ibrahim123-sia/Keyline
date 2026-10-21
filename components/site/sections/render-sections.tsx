import { BadgeCheckIcon, MapPinIcon } from "lucide-react";
import { Fragment, Suspense, type ReactNode } from "react";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import { MediaImage } from "@/components/site/media-image";
import { ProjectCard } from "@/components/site/projects/project-card";
import { getPublicMedia } from "@/features/media/queries";
import { visitorCurrency } from "@/features/site/currency";
import { withHeadingIds } from "@/features/cms/headings";
import { areaCards, featuredListingCards, heroSearchOptions } from "@/features/cms/queries";
import { sectionCatalog } from "@/features/cms/section-catalog";
import { showcaseProjectCards } from "@/features/projects/public";
import type { Section } from "@/features/cms/sections";
import { Icon } from "@/lib/icons";
import { sectionsText as t } from "@/lib/i18n/dictionaries/home";
import { renderRichText } from "@/lib/rich-text";
import { HeroSearchCard } from "./hero-search-card";
import { SectionHeading, SectionShell } from "./section-shell";

/**
 * What sections need from settings. The visitor's currency is read inside the sections that
 * show prices (a cookie), each behind Suspense, so the rest of the page stays prerendered.
 */
export type SectionContext = Omit<CardContext, "visitorCurrency" | "rates"> & {
  baseCurrency: { code: string; decimals: number };
};

async function withCurrency(ctx: SectionContext): Promise<CardContext> {
  const { code, rates } = await visitorCurrency();
  return { ...ctx, visitorCurrency: code, rates };
}

function GridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="container-site section-y" aria-hidden>
      <div className="mb-8 h-10 w-64 animate-pulse rounded-lg bg-surface-muted" />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-[20px] bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}

function Buttons({ buttons }: { buttons: Array<{ label: string; href: string }> }) {
  if (buttons.length === 0) return null;
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {buttons.map((b, i) => (
        <a
          key={`${b.href}-${i}`}
          href={b.href}
          className={
            i === 0
              ? "rounded-[14px] bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent hover:bg-accent/90"
              : "rounded-[14px] border border-current px-6 py-3 text-[15px] font-semibold hover:opacity-80"
          }
        >
          {b.label}
        </a>
      ))}
    </div>
  );
}

async function HeroSearch({
  s,
  ctx,
  first,
}: {
  s: Extract<Section, { type: "hero_search" }>;
  ctx: SectionContext;
  first: boolean;
}) {
  const [image, options] = await Promise.all([
    getPublicMedia(s.props.imageId),
    heroSearchOptions(),
  ]);
  return (
    <SectionShell style={s.style} label={s.props.heading}>
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-6">
          {s.props.eyebrow && <p className="text-eyebrow text-accent">{s.props.eyebrow}</p>}
          {first ? (
            <h1 className="text-display text-ink">{s.props.heading}</h1>
          ) : (
            <h2 className="text-display text-ink">{s.props.heading}</h2>
          )}
          {s.props.subheading && (
            <p className="max-w-xl text-[17px] text-text">{s.props.subheading}</p>
          )}
          <HeroSearchCard
            tabs={s.props.tabs}
            defaultTab={s.props.defaultTab}
            types={options.types}
            budgets={options.budgets}
            currency={ctx.baseCurrency}
          />
        </div>
        {image && (
          <div className="relative">
            <MediaImage
              src={image.url}
              alt={image.alt ?? ""}
              sizes="(min-width: 1024px) 50vw, 100vw"
              aspect="4 / 5"
              color={image.dominantColor}
              priority={first}
              className="rounded-[28px]"
            />
            {s.props.floatingBadge && s.props.floatingBadgeText && (
              <p className="absolute start-4 bottom-4 flex items-center gap-2 rounded-[20px] bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-soft">
                <BadgeCheckIcon className="size-5 text-success" aria-hidden />
                {s.props.floatingBadgeText}
              </p>
            )}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

async function HeroSimple({
  s,
  first,
}: {
  s: Extract<Section, { type: "hero_simple" }>;
  first: boolean;
}) {
  const image = await getPublicMedia(s.props.imageId);
  const Heading = first ? "h1" : "h2";
  return (
    <SectionShell style={s.style} label={s.props.heading} backgroundUrl={image?.url}>
      <div className="max-w-3xl">
        <Heading className="text-display">{s.props.heading}</Heading>
        {s.props.subheading && <p className="mt-6 text-[17px]">{s.props.subheading}</p>}
        <Buttons buttons={s.props.buttons} />
      </div>
    </SectionShell>
  );
}

async function FeaturedListings({
  s,
  ctx,
}: {
  s: Extract<Section, { type: "featured_listings" }>;
  ctx: SectionContext;
}) {
  const [cards, cardCtx] = await Promise.all([featuredListingCards(s.props), withCurrency(ctx)]);
  if (cards.length === 0) return null;
  return (
    <SectionShell style={s.style} label={s.props.heading}>
      <SectionHeading
        eyebrow={s.props.eyebrow}
        heading={s.props.heading}
        action={
          s.props.viewAll?.href ? (
            <a
              href={s.props.viewAll.href}
              className="text-[15px] font-semibold text-ink underline-offset-4 hover:underline"
            >
              {s.props.viewAll.label || t.listings.viewAll}
            </a>
          ) : null
        }
      />
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.id}>
            <ListingCard listing={c} ctx={cardCtx} />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

async function ProjectsShowcase({
  s,
  ctx,
}: {
  s: Extract<Section, { type: "projects_showcase" }>;
  ctx: SectionContext;
}) {
  const [items, cardCtx] = await Promise.all([showcaseProjectCards(s.props), withCurrency(ctx)]);
  if (items.length === 0) return null;
  const style = s.props.dark ? { ...s.style, background: "ink" as const } : s.style;
  return (
    <SectionShell style={style} label={s.props.heading}>
      <SectionHeading
        eyebrow={s.props.eyebrow}
        heading={s.props.heading}
        action={
          s.props.viewAll?.href ? (
            <a
              href={s.props.viewAll.href}
              className="text-[15px] font-semibold underline-offset-4 hover:underline"
            >
              {s.props.viewAll.label || t.listings.viewAll}
            </a>
          ) : null
        }
      />
      <ul className="grid gap-6 md:grid-cols-2">
        {items.map((p) => (
          <li key={p.id} className="flex">
            <ProjectCard
              project={p}
              visitorCurrency={cardCtx.visitorCurrency}
              rates={cardCtx.rates}
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

async function AreasGrid({
  s,
  ctx,
}: {
  s: Extract<Section, { type: "areas_grid" }>;
  ctx: SectionContext;
}) {
  void ctx;
  const areas = await areaCards(s.props);
  if (areas.length === 0) return null;
  return (
    <SectionShell style={s.style} label={s.props.heading}>
      <SectionHeading eyebrow={s.props.eyebrow} heading={s.props.heading} />
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {areas.map((a) => (
          <li key={a.id}>
            <article className="group relative overflow-hidden rounded-[20px] bg-surface shadow-soft">
              {a.cover ? (
                <MediaImage
                  src={a.cover.url}
                  alt=""
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  aspect="4 / 5"
                  color={a.cover.color}
                />
              ) : (
                <div className="aspect-[4/5] bg-photo-placeholder" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-4 pt-16 text-surface">
                <h3 className="text-h3 text-surface">
                  <a
                    href={`/buy/${a.slug}`}
                    className="after:absolute after:inset-0 after:content-['']"
                  >
                    {a.name}
                  </a>
                </h3>
                <p className="mt-1 flex items-center gap-1 text-[13px] text-surface/85">
                  <MapPinIcon className="size-3.5" aria-hidden />
                  {a.forSale + a.forRent === 0
                    ? t.areas.noHomes
                    : [
                        a.forSale ? t.areas.forSale(a.forSale) : "",
                        a.forRent ? t.areas.toRent(a.forRent) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function PromiseStrip({ s }: { s: Extract<Section, { type: "promise_strip" }> }) {
  return (
    <SectionShell style={s.style}>
      <ul className="grid gap-6 md:grid-cols-3">
        {s.props.items.map((item, i) => (
          <li key={`${item.title}-${i}`} className="flex gap-4">
            {item.icon && (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon name={item.icon} className="size-5" />
              </span>
            )}
            <div>
              <h3 className="text-[17px] font-semibold text-ink">{item.title}</h3>
              <p className="mt-1 text-[14.5px] text-text">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function TextSection({
  s,
  headingIds,
}: {
  s: Extract<Section, { type: "text" }>;
  headingIds?: string[];
}) {
  return (
    <SectionShell style={s.style}>
      <div
        className={`rich-text text-[17px] text-text ${s.props.maxWidth === "narrow" ? "max-w-2xl" : "max-w-4xl"}`}
        // Rendered from the validated document by our own allowlist renderer (lib/rich-text).
        dangerouslySetInnerHTML={{
          __html: withHeadingIds(renderRichText(s.props.body), headingIds),
        }}
      />
    </SectionShell>
  );
}

function Stats({ s }: { s: Extract<Section, { type: "stats" }> }) {
  return (
    <SectionShell style={s.style} label={s.props.heading}>
      <SectionHeading heading={s.props.heading} />
      <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {s.props.items.map((item, i) => (
          <div key={`${item.label}-${i}`}>
            <dt className="text-[14px] text-text-muted">{item.label}</dt>
            <dd className="text-h2 text-ink tabular">{item.value}</dd>
            {item.source && <dd className="mt-1 text-[12px] text-text-muted">{item.source}</dd>}
          </div>
        ))}
      </dl>
    </SectionShell>
  );
}

function Cta({ s }: { s: Extract<Section, { type: "cta" }> }) {
  return (
    <SectionShell style={s.style} label={s.props.heading}>
      <div className="max-w-2xl">
        <h2 className="text-h2">{s.props.heading}</h2>
        {s.props.text && <p className="mt-4 text-[17px]">{s.props.text}</p>}
        <Buttons buttons={s.props.buttons} />
      </div>
    </SectionShell>
  );
}

export type RenderOptions = {
  /** Whether the first hero may render the page's h1 (false when the page shows its own). */
  h1?: boolean;
  /** The page builder's preview: each section marked so a click selects it in the editor. */
  editable?: boolean;
  /** h2 ids per text section (anchors, the legal template's contents). */
  headingIds?: Map<string, string[]>;
};

/** The market values sections need (units, base currency); the visitor's currency is read later. */
export function sectionContext(market: {
  areaUnit: SectionContext["areaUnit"];
  distanceUnit: SectionContext["distanceUnit"];
  baseCurrency: { code: string; decimals: number };
}): SectionContext {
  return {
    areaUnit: market.areaUnit,
    distanceUnit: market.distanceUnit,
    baseCurrency: { code: market.baseCurrency.code, decimals: market.baseCurrency.decimals },
  };
}

function renderSection(
  s: Section,
  ctx: SectionContext,
  opts: { first: boolean; headingIds?: string[]; faqSchema: boolean },
): ReactNode {
  const { first } = opts;
  switch (s.type) {
    case "hero_search":
      return <HeroSearch s={s} ctx={ctx} first={first} />;
    case "hero_simple":
      return <HeroSimple s={s} first={first} />;
    case "promise_strip":
      return <PromiseStrip s={s} />;
    case "featured_listings":
      return (
        <Suspense fallback={<GridSkeleton count={Math.min(s.props.count, 3)} />}>
          <FeaturedListings s={s} ctx={ctx} />
        </Suspense>
      );
    case "projects_showcase":
      return (
        <Suspense fallback={<GridSkeleton count={2} />}>
          <ProjectsShowcase s={s} ctx={ctx} />
        </Suspense>
      );
    case "areas_grid":
      return <AreasGrid s={s} ctx={ctx} />;
    case "text":
      return <TextSection s={s} headingIds={opts.headingIds} />;
    case "stats":
      return <Stats s={s} />;
    case "cta":
      return <Cta s={s} />;
    default:
      return null;
  }
}

/** Renders a page's sections in order; the first heading section owns the page's h1. */
export async function RenderSections({
  sections,
  ctx,
  h1 = true,
  editable = false,
  headingIds,
}: {
  sections: Section[];
  ctx: SectionContext;
} & RenderOptions) {
  const visible = sections.filter((s) => !s.hidden);
  // One FAQPage per page (08 §6): the first FAQ section that asks for it.
  const faqOwner = visible.find((s) => s.type === "faq" && s.props.schema)?.id ?? null;
  return (
    <>
      {visible.map((s, i) => {
        const node = renderSection(s, ctx, {
          first: h1 && i === 0,
          headingIds: headingIds?.get(s.id),
          faqSchema: s.id === faqOwner,
        });
        return editable ? (
          <div
            key={s.id}
            data-section-id={s.id}
            data-section-label={sectionCatalog[s.type].label}
            className="lintel-preview-section"
          >
            {node}
          </div>
        ) : (
          <Fragment key={s.id}>{node}</Fragment>
        );
      })}
    </>
  );
}
