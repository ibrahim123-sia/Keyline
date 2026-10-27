import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { CompareShare } from "@/components/site/compare/compare-share";
import { RemoveFromCompare } from "@/components/site/compare/remove-from-compare";
import { MediaImage } from "@/components/site/media-image";
import { getDb } from "@/db/client";
import { compareIds } from "@/features/account/store";
import { currentVisitorKey } from "@/features/attribution/current";
import {
  compareHighlights,
  comparePath,
  parseCompareIds,
  type BestRow,
  type CompareNumbers,
} from "@/features/compare/best";
import { compareItems, type CompareItem, type NearestPlace } from "@/features/compare/load";
import { getSettings } from "@/features/settings/queries";
import { visitorCurrency } from "@/features/site/currency";
import { siteUrl } from "@/features/site/url";
import { getCurrentUser } from "@/lib/auth/guards";
import { displayPrice, toBaseMinor, type Rates } from "@/lib/currency-display";
import { format } from "@/lib/i18n";
import { compare as t } from "@/lib/i18n/dictionaries/compare";
import {
  areaUnitLabels,
  formatArea,
  formatDistance,
  formatDuration,
  perAreaFromSqm,
  type AreaUnit,
  type DistanceUnit,
} from "@/lib/units";

/** Per visitor: their own picks (cookie or account), or the ids of a shared link. */
export const instant = false;

export const metadata: Metadata = {
  title: t.title,
  description: t.metaDescription,
  // Personal and endlessly combinable: never indexed, and not in the sitemap.
  robots: { index: false, follow: true },
  alternates: { canonical: "/tools/compare" },
};

const longDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

function handoverText(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return m ? `Q${Math.ceil(Number(m[2]) / 3)} ${m[1]}` : value;
}

type Ctx = { code: string; rates: Rates; areaUnit: AreaUnit; distanceUnit: DistanceUnit };

const money = (amount: number, i: CompareItem, ctx: Ctx) =>
  displayPrice(amount, i.currency, ctx.code, ctx.rates).text;

function priceText(i: CompareItem, ctx: Ctx): string {
  if (i.price == null) return t.priceOnRequest;
  const amount = money(i.price, i, ctx);
  if (i.priceFrom) return format(t.from, { price: amount });
  if (i.purpose === "rent" && i.pricePeriod)
    return format(i.pricePeriod === "month" ? t.perMonth : t.perYear, { price: amount });
  return amount;
}

/** Money per m² of a sale price, in the base currency: the comparable number. */
function perSqmBase(i: CompareItem, rates: Rates): number | null {
  if (i.purpose !== "sale" || i.price == null || !i.sizeMin) return null;
  const base = toBaseMinor(i.price, i.currency, rates);
  return base == null ? null : base / i.sizeMin;
}

function numbers(i: CompareItem, rates: Rates): CompareNumbers {
  return {
    pricePerArea: perSqmBase(i, rates),
    serviceCharge:
      i.serviceChargePerArea == null
        ? null
        : toBaseMinor(i.serviceChargePerArea, i.currency, rates),
    yield: i.expectedYield,
    school: i.nearest.school?.distanceM ?? null,
    transport: i.nearest.transport?.distanceM ?? null,
    shopping: i.nearest.shopping?.distanceM ?? null,
  };
}

function sizeText(i: CompareItem, unit: AreaUnit): string {
  if (i.sizeMin == null) return "—";
  if (i.sizeMax != null && Math.round(i.sizeMax) !== Math.round(i.sizeMin))
    return `${formatArea(i.sizeMin, unit).split(" ")[0]}–${formatArea(i.sizeMax, unit)}`;
  return formatArea(i.sizeMin, unit);
}

function place(p: NearestPlace | null, unit: DistanceUnit): ReactNode {
  if (!p) return "—";
  const time =
    p.seconds != null
      ? format(p.mode === "walk" ? t.walkTime : t.driveTime, { time: formatDuration(p.seconds) })
      : null;
  return (
    <>
      <span className="block font-medium text-ink">{p.name}</span>
      <span className="block text-[13px] text-text-muted">
        {p.overrideText ?? [formatDistance(p.distanceM, unit), time].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

type Row = { key: string; label: string; best?: BestRow; cells: ReactNode[] };

async function ownIds(): Promise<{ ids: string[]; accountEmail: string | null }> {
  const user = await getCurrentUser();
  const db = await getDb();
  if (user?.role === "customer")
    return { ids: await compareIds(db, { userId: user.id }), accountEmail: user.email };
  const visitorKey = await currentVisitorKey();
  return { ids: visitorKey ? await compareIds(db, { visitorKey }) : [], accountEmail: null };
}

/**
 * Compare (11 §3): up to four homes or project unit types side by side, best value per row
 * highlighted. Without `ids` it shows the visitor's own picks (kept by the visitor cookie, or
 * the account for customers); a share link carries the ids and shows the same table to anyone.
 * On phones the table scrolls sideways with the row names kept in view.
 */
export default async function ComparePage(props: PageProps<"/tools/compare">) {
  const search = await props.searchParams;
  const shared = search.ids !== undefined;
  const own = shared ? null : await ownIds();
  const ids = shared ? parseCompareIds(search.ids) : own!.ids;
  let accountEmail: string | null = own ? own.accountEmail : null;
  if (shared) {
    const user = await getCurrentUser();
    accountEmail = user?.role === "customer" ? user.email : null;
  }

  const [items, { code, rates }, market] = await Promise.all([
    compareItems(ids),
    visitorCurrency(),
    getSettings("market"),
  ]);
  const ctx: Ctx = { code, rates, areaUnit: market.areaUnit, distanceUnit: market.distanceUnit };
  const unit = areaUnitLabels[ctx.areaUnit];
  const best = compareHighlights(items.map((i) => numbers(i, rates)));

  if (items.length === 0)
    return (
      <div className="container-site flex flex-col gap-4 py-10">
        <h1 className="text-h1">{t.title}</h1>
        {shared && ids.length > 0 && <p className="text-text-muted">{t.someGone}</p>}
        <p className="max-w-prose text-[16px] text-text">{t.empty}</p>
        <p>
          <Link
            href="/buy"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t.browse}
          </Link>
        </p>
      </div>
    );

  const facilityNames = [...new Set(items.flatMap((i) => i.facilities))].sort((a, b) =>
    a.localeCompare(b),
  );
  const tick = (yes: boolean) => (
    <>
      <span aria-hidden className={yes ? "font-bold text-success" : "text-text-muted"}>
        {yes ? "✓" : "–"}
      </span>
      <span className="sr-only">{yes ? t.yes : t.no}</span>
    </>
  );

  const rows: Row[] = [
    { key: "price", label: t.rows.price, cells: items.map((i) => priceText(i, ctx)) },
    {
      key: "pricePerArea",
      label: format(t.rows.pricePerArea, { unit }),
      best: "pricePerArea",
      cells: items.map((i) =>
        i.purpose === "sale" && i.price != null && i.sizeMin
          ? money(Math.round(perAreaFromSqm(i.price / i.sizeMin, ctx.areaUnit)), i, ctx)
          : "—",
      ),
    },
    {
      key: "purpose",
      label: t.rows.purpose,
      cells: items.map((i) => (i.purpose === "rent" ? t.rent : t.sale)),
    },
    {
      key: "completion",
      label: t.rows.completion,
      cells: items.map((i) => (i.completion === "off_plan" ? t.offPlan : t.ready)),
    },
    { key: "type", label: t.rows.type, cells: items.map((i) => i.typeName ?? "—") },
    {
      key: "beds",
      label: t.rows.beds,
      cells: items.map((i) => (i.beds == null ? "—" : i.beds === 0 ? t.studio : String(i.beds))),
    },
    {
      key: "baths",
      label: t.rows.baths,
      cells: items.map((i) => (i.baths == null ? "—" : String(i.baths))),
    },
    { key: "size", label: t.rows.size, cells: items.map((i) => sizeText(i, ctx.areaUnit)) },
    { key: "area", label: t.rows.area, cells: items.map((i) => i.areaName ?? "—") },
    {
      key: "handover",
      label: t.rows.handover,
      cells: items.map((i) => (i.handover ? handoverText(i.handover) : "—")),
    },
    { key: "plan", label: t.rows.plan, cells: items.map((i) => i.planLabel ?? "—") },
    {
      key: "serviceCharge",
      label: t.rows.serviceCharge,
      best: "serviceCharge",
      cells: items.map((i) =>
        i.serviceChargePerArea == null
          ? "—"
          : format(t.serviceChargeValue, {
              amount: money(
                Math.round(perAreaFromSqm(i.serviceChargePerArea, ctx.areaUnit)),
                i,
                ctx,
              ),
              unit,
            }),
      ),
    },
    {
      key: "yield",
      label: t.rows.yield,
      best: "yield",
      cells: items.map((i) =>
        i.expectedYield == null ? "—" : format(t.yieldValue, { n: i.expectedYield }),
      ),
    },
    {
      key: "school",
      label: t.rows.school,
      best: "school",
      cells: items.map((i) => place(i.nearest.school, ctx.distanceUnit)),
    },
    {
      key: "transport",
      label: t.rows.transport,
      best: "transport",
      cells: items.map((i) => place(i.nearest.transport, ctx.distanceUnit)),
    },
    {
      key: "shopping",
      label: t.rows.shopping,
      best: "shopping",
      cells: items.map((i) => place(i.nearest.shopping, ctx.distanceUnit)),
    },
    ...facilityNames.map((name) => ({
      key: `facility:${name}`,
      label: name,
      cells: items.map((i) => tick(i.facilities.includes(name))),
    })),
    {
      key: "verified",
      label: t.rows.verified,
      cells: items.map((i) => (i.verifiedAt ? longDate.format(new Date(i.verifiedAt)) : "—")),
    },
    {
      key: "agent",
      label: t.rows.agent,
      cells: items.map((i) =>
        i.agent ? (
          <Link
            key={i.id}
            href={`/agents/${i.agent.slug}`}
            className="text-ink underline-offset-4 hover:underline"
          >
            {i.agent.name}
          </Link>
        ) : (
          "—"
        ),
      ),
    },
  ];
  const facilitiesStart = rows.findIndex((r) => r.key.startsWith("facility:"));
  const shareUrl = siteUrl(comparePath(items.map((i) => i.id)));

  return (
    <div className="container-wide flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{t.title}</h1>
        <p className="text-[15px] text-text-muted">{shared ? t.shared : t.intro}</p>
        {shared && items.length < ids.length && (
          <p className="text-[14px] text-text-muted">{t.someGone}</p>
        )}
      </header>

      <p className="text-[13px] text-text-muted sm:hidden">{t.scrollHint}</p>
      <div
        className="overflow-x-auto rounded-[20px] bg-surface shadow-soft"
        tabIndex={0}
        aria-label={t.title}
        role="region"
      >
        <table className="w-full border-separate border-spacing-0 text-start text-[14.5px]">
          <caption className="sr-only">{t.bestNote}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-10 w-28 min-w-28 border-b border-border bg-surface p-3 text-start align-bottom text-[12.5px] font-semibold text-text-muted sm:w-40 sm:min-w-40"
              >
                <span className="sr-only">{t.home}</span>
              </th>
              {items.map((i, n) => (
                <th
                  key={i.id}
                  scope="col"
                  className="min-w-44 border-b border-border p-3 text-start align-top font-normal sm:min-w-52"
                >
                  <div className="relative">
                    {i.photo ? (
                      <MediaImage
                        src={i.photo.url}
                        alt={i.photo.alt}
                        sizes="(min-width: 640px) 220px, 180px"
                        color={i.photo.color}
                        priority={n === 0}
                        maxWidth={640}
                        className="rounded-[14px]"
                      />
                    ) : (
                      <div
                        className="aspect-[4/3] rounded-[14px] bg-photo-placeholder"
                        aria-hidden
                      />
                    )}
                    {!shared && (
                      <div className="absolute end-2 top-2">
                        <RemoveFromCompare id={i.id} label={i.title} />
                      </div>
                    )}
                  </div>
                  <Link
                    href={i.href}
                    className="mt-2 block font-display text-[17px] leading-snug text-ink hover:underline"
                  >
                    {i.title}
                  </Link>
                  {i.subtitle && (
                    <span className="block text-[13px] text-text-muted">{i.subtitle}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const winners = row.best ? best[row.best] : [];
              return (
                <tr key={row.key} data-row={row.key}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky start-0 z-10 border-b border-border bg-surface p-3 text-start align-top text-[13px] font-semibold text-text-muted",
                      r === facilitiesStart && "border-t-2 border-t-border",
                    )}
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, c) => {
                    const isBest = winners.includes(c);
                    return (
                      <td
                        key={items[c]!.id}
                        data-best={isBest || undefined}
                        className={cn(
                          "border-b border-border p-3 align-top text-ink tabular",
                          isBest && "bg-success-soft",
                        )}
                      >
                        {cell}
                        {isBest && (
                          <span className="mt-1 block w-fit rounded-full bg-success px-2 py-0.5 text-[11.5px] font-semibold text-surface">
                            {t.best}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-text-muted">{t.bestNote}</p>

      <CompareShare ids={items.map((i) => i.id)} url={shareUrl} accountEmail={accountEmail} />
    </div>
  );
}
