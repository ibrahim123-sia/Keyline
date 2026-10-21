import type { CardContext } from "@/components/site/listings/listing-card";
import { visitorCurrency } from "@/features/site/currency";

/**
 * What sections need from settings. The visitor's currency is read inside the sections that
 * show prices (a cookie), each behind Suspense, so the rest of the page stays prerendered.
 */
export type SectionContext = Omit<CardContext, "visitorCurrency" | "rates"> & {
  baseCurrency: { code: string; decimals: number };
  /** The page the sections belong to (forms say where they were sent from). */
  pageId?: string | null;
};

export async function withCurrency(ctx: SectionContext): Promise<CardContext> {
  const { code, rates } = await visitorCurrency();
  return {
    areaUnit: ctx.areaUnit,
    distanceUnit: ctx.distanceUnit,
    visitorCurrency: code,
    rates,
  };
}

export function GridSkeleton({ count = 3 }: { count?: number }) {
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

/** A plain block while a section's data loads (lists of text, forms, maps). */
export function BlockSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="container-site section-y" aria-hidden>
      <div className="mb-6 h-8 w-56 animate-pulse rounded-lg bg-surface-muted" />
      <div className={`${height} animate-pulse rounded-[20px] bg-surface-muted`} />
    </div>
  );
}

export function Buttons({ buttons }: { buttons: Array<{ label: string; href: string }> }) {
  const shown = buttons.filter((b) => b.label && b.href);
  if (shown.length === 0) return null;
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {shown.map((b, i) => (
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
