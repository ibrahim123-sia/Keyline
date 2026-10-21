import { ArrowRightIcon, BadgeCheckIcon, Building2Icon, InfoIcon } from "lucide-react";
import { cn } from "cn";
import { handoverLabel } from "@/components/site/listings/listing-card";
import { PriceTag } from "@/components/site/price-tag";
import { yields, type RoiDefaults } from "@/features/listings/finance";
import type { PublicListing } from "@/features/listings/public";
import { displayPrice, type Rates } from "@/lib/currency-display";
import { Icon } from "@/lib/icons";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { formatArea, perAreaFromSqm, areaUnitLabels, type AreaUnit } from "@/lib/units";
import { ReadMore } from "./read-more";

export type PageContext = {
  visitorCurrency: string;
  rates: Rates;
  areaUnit: AreaUnit;
  permitLabel: string;
  permitsEnabled: boolean;
};

const longDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });

export const verifiedDate = (iso: string) => longDate.format(new Date(iso));

const money = (amount: number, l: PublicListing, ctx: PageContext) =>
  displayPrice(amount, l.currency, ctx.visitorCurrency, ctx.rates).text;

export function Section({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("flex flex-col gap-4", className)}>
      <h2 id={`${id}-title`} className="text-h3 text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* 2. Status ------------------------------------------------------------------ */

export function StatusBanner({ listing }: { listing: PublicListing }) {
  if (listing.status === "available") return null;
  if (listing.status === "sold" || listing.status === "rented")
    return (
      <div role="status" className="rounded-[20px] border border-border bg-surface-muted px-5 py-4">
        <p className="font-display text-[22px] text-ink">{t.status.gone}</p>
        <p className="mt-1 text-[14px] text-text">
          {listing.status === "sold" ? t.status.goneSold : t.status.goneRented}
        </p>
      </div>
    );
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-[16px] border border-accent/30 bg-accent-soft px-4 py-3 text-[14px] text-ink"
    >
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      {listing.status === "reserved" ? t.status.reserved : t.status.under_offer}
    </div>
  );
}

/* 4. Facts bar --------------------------------------------------------------- */

export function FactsBar({ listing: l, ctx }: { listing: PublicListing; ctx: PageContext }) {
  const hidden = new Set<string>(l.type?.hidden ?? []);
  const facts: Array<{ label: string; value: string }> = [];
  if (l.beds != null && !hidden.has("beds"))
    facts.push({ label: t.facts.beds, value: l.beds === 0 ? t.facts.studio : String(l.beds) });
  if (l.baths != null && !hidden.has("baths"))
    facts.push({ label: t.facts.baths, value: String(l.baths) });
  if (l.size != null && !hidden.has("size"))
    facts.push({ label: t.facts.size, value: formatArea(l.size, ctx.areaUnit) });
  if (l.plotSize != null && !hidden.has("plotSize"))
    facts.push({ label: t.facts.plot, value: formatArea(l.plotSize, ctx.areaUnit) });
  if (l.purpose === "rent" && l.rentPaymentOptions.length)
    facts.push({
      label: t.facts.payments,
      value: format(t.facts.paymentsValue, { list: l.rentPaymentOptions.join(", ") }),
    });
  if (l.furnishing && !hidden.has("furnishing"))
    facts.push({ label: t.facts.furnishing, value: l.furnishing });
  if (l.ownership && l.purpose === "sale")
    facts.push({ label: t.facts.ownership, value: l.ownership });
  const priceLabel =
    l.purpose === "rent"
      ? l.pricePeriod === "month"
        ? t.facts.rentMonth
        : t.facts.rentYear
      : t.facts.price;

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-[20px] bg-surface p-5 shadow-soft">
      <div>
        <p className="text-meta text-text-muted">{priceLabel}</p>
        <PriceTag
          price={l.price}
          currency={l.currency}
          visitorCurrency={ctx.visitorCurrency}
          rates={ctx.rates}
          onRequestText={t.facts.onRequest}
          className="text-[26px] md:text-[32px]"
        />
        {l.purpose === "rent" && l.monthlyPaymentAvailable && (
          <p className="text-[12.5px] text-success">{t.facts.monthly}</p>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-meta text-text-muted">{f.label}</dt>
            <dd className="text-[17px] font-semibold text-ink tabular">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* 5. About ------------------------------------------------------------------- */

export function About({ listing }: { listing: PublicListing }) {
  if (!listing.descriptionHtml && listing.highlights.length === 0) return null;
  return (
    <Section id="about" title={t.about.title}>
      {listing.descriptionHtml && (
        <ReadMore more={t.about.readMore} less={t.about.readLess}>
          <div
            className="rich-text text-[16px] leading-relaxed text-text"
            // Rendered on the server from the editor's allowlisted document (lib/rich-text.ts).
            dangerouslySetInnerHTML={{ __html: listing.descriptionHtml }}
          />
        </ReadMore>
      )}
      {listing.highlights.length > 0 && (
        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-ink">{t.about.highlights}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {listing.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-[15px] text-text">
                <BadgeCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/* 6. Details ----------------------------------------------------------------- */

export function DetailsTable({ listing: l, ctx }: { listing: PublicListing; ctx: PageContext }) {
  const hidden = new Set<string>(l.type?.hidden ?? []);
  const unit = areaUnitLabels[ctx.areaUnit];
  const rows: Array<[string, string]> = [];
  if (l.type) rows.push([t.details.type, l.type.name]);
  rows.push([t.details.reference, l.reference]);
  rows.push([
    t.details.completion,
    l.completion === "off_plan" ? t.details.offPlan : t.details.ready,
  ]);
  if (l.handover) rows.push([t.details.handover, handoverLabel(l.handover)]);
  if (l.completion === "off_plan" && l.constructionProgress != null)
    rows.push([t.details.progress, format(t.details.progressValue, { n: l.constructionProgress })]);
  if (l.yearBuilt) rows.push([t.details.yearBuilt, String(l.yearBuilt)]);
  if (l.floor && !hidden.has("floor")) rows.push([t.details.floor, l.floor]);
  if (l.floorCount) rows.push([t.details.floors, String(l.floorCount)]);
  if (l.view.length) rows.push([t.details.view, l.view.join(", ")]);
  if (l.parkingSpaces != null && !hidden.has("parking"))
    rows.push([
      t.details.parking,
      l.parkingSpaces === 1
        ? t.details.parkingOne
        : format(t.details.parkingValue, { n: l.parkingSpaces }),
    ]);
  const extras = [l.maidRoom && t.details.maidRoom, l.study && t.details.study].filter(Boolean);
  if (extras.length) rows.push([t.details.extras, extras.join(", ")]);
  if (l.serviceChargePerArea != null)
    rows.push([
      t.details.serviceCharge,
      format(t.details.serviceChargeValue, {
        amount: money(Math.round(perAreaFromSqm(l.serviceChargePerArea, ctx.areaUnit)), l, ctx),
        unit,
      }),
    ]);
  if (l.purpose === "rent" && l.depositAmount != null)
    rows.push([t.details.deposit, money(l.depositAmount, l, ctx)]);
  if (l.agencyFeeText) rows.push([t.details.agencyFee, l.agencyFeeText]);
  if (l.isTenanted) rows.push([t.details.tenanted, t.details.tenantedValue]);
  if (ctx.permitsEnabled && l.permitNumber) rows.push([ctx.permitLabel, l.permitNumber]);
  if (l.verifiedAt) rows.push([t.details.lastVerified, verifiedDate(l.verifiedAt)]);

  return (
    <Section id="details" title={t.details.title}>
      <dl className="grid overflow-hidden rounded-[20px] border border-border sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between gap-4 border-b border-border px-4 py-3 text-[14.5px] sm:odd:border-e"
          >
            <dt className="text-text-muted">{k}</dt>
            <dd className="text-end font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* 7. Facilities -------------------------------------------------------------- */

export function Facilities({ listing }: { listing: PublicListing }) {
  if (listing.facilities.length === 0) return null;
  return (
    <Section id="facilities" title={t.facilities.title}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {listing.facilities.map((f) => (
          <li key={f.name} className="flex items-center gap-2.5 text-[15px] text-text">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name={f.icon} className="size-4" />
            </span>
            {f.name}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* 9. Rent payments ----------------------------------------------------------- */

export function RentPayments({ listing: l, ctx }: { listing: PublicListing; ctx: PageContext }) {
  if (l.purpose !== "rent" || l.price == null || l.rentPaymentOptions.length === 0) return null;
  const yearly = l.pricePeriod === "month" ? l.price * 12 : l.price;
  return (
    <Section id="rent-payments" title={t.rentPayments.title}>
      <p className="text-[14.5px] text-text-muted">{t.rentPayments.intro}</p>
      <table className="w-full overflow-hidden rounded-[16px] border border-border text-[14.5px]">
        <thead className="bg-surface-soft text-start text-[13px] text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              {t.rentPayments.payments}
            </th>
            <th scope="col" className="px-4 py-2 text-end font-semibold">
              {t.rentPayments.each}
            </th>
          </tr>
        </thead>
        <tbody>
          {l.rentPaymentOptions.map((n) => (
            <tr key={n} className="border-t border-border">
              <td className="px-4 py-2.5">
                {n === 1 ? t.rentPayments.one : format(t.rentPayments.many, { n })}
              </td>
              <td className="px-4 py-2.5 text-end font-semibold text-ink tabular">
                {money(Math.round(yearly / n), l, ctx)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/* 12. Investment ------------------------------------------------------------- */

export function Investment({
  listing: l,
  ctx,
  roi,
}: {
  listing: PublicListing;
  ctx: PageContext;
  roi: RoiDefaults;
}) {
  if (l.purpose !== "sale" || !l.price || !l.expectedRentYearly) return null;
  const y = yields(
    {
      price: l.price,
      rentYearly: l.expectedRentYearly,
      serviceChargePerArea: l.serviceChargePerArea,
      size: l.size,
    },
    roi,
  );
  return (
    <Section id="investment" title={t.investment.title}>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          [t.investment.expectedRent, money(l.expectedRentYearly, l, ctx)],
          [t.investment.gross, `${y.gross}%`],
          [t.investment.net, `${y.net}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-surface p-4 shadow-soft">
            <dt className="text-meta text-text-muted">{k}</dt>
            <dd className="mt-1 text-[22px] font-bold text-ink tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-text-muted">{t.investment.netNote}</p>
      <a
        href="/tools/rental-returns"
        className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-accent hover:underline"
      >
        {t.investment.simulator} <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
      </a>
    </Section>
  );
}

/* 13. Price history ---------------------------------------------------------- */

export function PriceHistory({ listing: l, ctx }: { listing: PublicListing; ctx: PageContext }) {
  const changes = l.priceHistory.filter((h) => h.newPrice != null);
  if (changes.length === 0) return null;
  const points = [
    ...(l.publishedAt && changes[0]!.oldPrice != null
      ? [{ at: l.publishedAt, price: changes[0]!.oldPrice }]
      : []),
    ...changes.map((h) => ({ at: h.at, price: h.newPrice! })),
  ];
  const W = 600;
  const H = 160;
  const times = points.map((p) => Date.parse(p.at));
  const prices = points.map((p) => p.price);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [p0, p1] = [Math.min(...prices), Math.max(...prices)];
  const x = (v: number) => (t1 === t0 ? W / 2 : 16 + ((v - t0) / (t1 - t0)) * (W - 32));
  const y = (v: number) => (p1 === p0 ? H / 2 : 16 + (1 - (v - p0) / (p1 - p0)) * (H - 32));
  // A step line: the price holds until it changes.
  let d = "";
  points.forEach((p, i) => {
    const px = x(times[i]!);
    const py = y(p.price);
    d += i === 0 ? `M${px},${py}` : ` H${px} V${py}`;
  });
  return (
    <Section id="price-history" title={t.history.title}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t.history.chart}
        className="w-full rounded-[16px] bg-surface shadow-soft"
      >
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        {points.map((p, i) => (
          <circle key={p.at} cx={x(times[i]!)} cy={y(p.price)} r="5" fill="var(--color-ink)" />
        ))}
      </svg>
      <ol className="flex flex-col divide-y divide-border rounded-[16px] border border-border text-[14.5px]">
        {points.map((p, i) => {
          const prev = i > 0 ? points[i - 1]!.price : null;
          const pct = prev ? Math.round(((p.price - prev) / prev) * 1000) / 10 : null;
          return (
            <li
              key={p.at}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <span className="text-text-muted">
                {shortDate.format(new Date(p.at))} ·{" "}
                {i === 0 ? t.history.listed : t.history.changed}
              </span>
              <span className="font-semibold text-ink tabular">
                {money(p.price, l, ctx)}
                {pct != null && pct !== 0 && (
                  <span
                    className={cn("ms-2 text-[13px]", pct < 0 ? "text-success" : "text-danger")}
                  >
                    {format(pct < 0 ? t.history.reduced : t.history.raised, { pct: Math.abs(pct) })}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/* 14. Project ---------------------------------------------------------------- */

export function ProjectBlock({ listing: l }: { listing: PublicListing }) {
  const p = l.project;
  if (!p) return null;
  const href = p.published ? `/projects/${p.slug}` : null;
  return (
    <section
      aria-labelledby="project-title"
      className="flex flex-col gap-3 rounded-[20px] bg-ink p-6 text-surface"
    >
      <div className="flex items-center gap-2 text-eyebrow text-surface/70">
        <Building2Icon className="size-4" aria-hidden /> {t.details.offPlan}
      </div>
      <h2 id="project-title" className="text-h3">
        {format(t.project.title, { name: p.name })}
      </h2>
      <p className="text-[14.5px] text-surface/80">
        {[
          p.developerName && format(t.project.developer, { name: p.developerName }),
          p.progress != null && format(t.project.progress, { n: p.progress }),
          p.handover && format(t.project.handover, { when: handoverLabel(p.handover) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {p.progress != null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-surface/20"
          role="progressbar"
          aria-valuenow={p.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={format(t.project.progress, { n: p.progress })}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${p.progress}%` }} />
        </div>
      )}
      {href && (
        <a
          href={href}
          className="inline-flex w-fit items-center gap-1 text-[14.5px] font-semibold text-surface underline-offset-4 hover:underline"
        >
          {t.project.all} <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
        </a>
      )}
    </section>
  );
}
