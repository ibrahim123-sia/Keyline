import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiCategories, pois, type PoiCategory } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { properties, propertyPois } from "@/db/schema/properties";
import { getPublicListing, type PublicListing } from "@/features/listings/public";
import { getPublicMedia } from "@/features/media/queries";
import {
  stageLabels,
  stepAmounts,
  suggestSummaryLabel,
  formatPercent,
  toBasisPoints,
  type PlanStep,
} from "@/features/payment-plans/schema";
import { currencyFormats, formatFor } from "@/features/properties/format";
import { liveStatuses, statusLabels } from "@/features/properties/status";
import { getPublicProject, type PublicProject } from "@/features/projects/public";
import { loadSettings } from "@/features/settings/queries";
import { siteOrigin, siteUrl } from "@/features/site/url";
import { sha256Hex } from "@/lib/crypto";
import type { LngLat } from "@/lib/geo";
import { format, pages } from "@/lib/i18n";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { property as tp } from "@/lib/i18n/dictionaries/property";
import { formatMoney, type CurrencyFormat } from "@/lib/money";
import {
  areaUnitLabels,
  formatArea,
  formatDistance,
  formatDuration,
  perAreaFromSqm,
  type AreaUnit,
  type DistanceUnit,
} from "@/lib/units";
import { BROCHURE_TEMPLATE_VERSION } from "./template";
import type {
  BrochureData,
  BrochureFact,
  BrochureImage,
  BrochureKind,
  BrochurePlanRow,
  BrochurePoi,
} from "./types";

/**
 * Builds what the brochure prints from the public page data (only what the site shows: never
 * the unit number, and the approximate area when the pin is private), and works out its
 * version. Only live listings and published projects have a brochure.
 */

export type LoadedBrochure = {
  data: BrochureData;
  /** An uploaded PDF (07 §8 "brochure upload (or auto-generated)") wins on the site. */
  uploaded: { key: string; fileName: string } | null;
};

type Settings = {
  general: Awaited<ReturnType<typeof loadSettings<"general">>>;
  branding: Awaited<ReturnType<typeof loadSettings<"branding">>>;
  market: Awaited<ReturnType<typeof loadSettings<"market">>>;
  contact: Awaited<ReturnType<typeof loadSettings<"contact">>>;
};

async function settingsFor(db: DbOrTx): Promise<Settings> {
  return {
    general: await loadSettings("general", db),
    branding: await loadSettings("branding", db),
    market: await loadSettings("market", db),
    contact: await loadSettings("contact", db),
  };
}

/** /media/<key> back to the storage key. */
export function keyFromMediaUrl(url: string): string | null {
  if (!url.startsWith("/media/")) return null;
  try {
    return url
      .slice("/media/".length)
      .split("/")
      .map((s) => decodeURIComponent(s))
      .join("/");
  } catch {
    return null;
  }
}

const isImage = (url: string) => !/\.pdf($|\?)/i.test(url);

const dueFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2027-12-01" -> "Q4 2027" (as on the site's cards). */
function handoverText(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return m ? `Q${Math.ceil(Number(m[2]) / 3)} ${m[1]}` : value;
}

const bedsText = (beds: number | null) =>
  beds == null ? "—" : beds === 0 ? t.pdf.studio : String(beds);

function planRows(
  steps: PlanStep[],
  price: number | null,
  currency: CurrencyFormat | null,
): BrochurePlanRow[] {
  const amounts = price != null && currency ? stepAmounts(price, steps) : null;
  return steps.map((s, i) => ({
    label: s.label,
    when: [
      s.timingText ||
        (s.dueDate ? dueFormat.format(new Date(`${s.dueDate}T00:00:00Z`)) : stageLabels[s.stage]),
      s.instalmentsCount ? format(t.pdf.instalments, { n: s.instalmentsCount }) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    percent: `${formatPercent(toBasisPoints(s.percent))}%`,
    amount: amounts && currency ? formatMoney(amounts[i]!, currency) : null,
  }));
}

function distanceText(
  p: {
    distanceM: number;
    seconds: number | null;
    mode: "drive" | "walk";
    overrideText: string | null;
  },
  unit: DistanceUnit,
): string {
  if (p.overrideText) return p.overrideText;
  const distance = formatDistance(p.distanceM, unit);
  if (p.seconds == null) return distance;
  const time = formatDuration(p.seconds);
  return `${distance} · ${format(p.mode === "walk" ? t.pdf.walkTime : t.pdf.driveTime, { time })}`;
}

type PoiIn = {
  name: string;
  typeName: string;
  category: PoiCategory;
  distanceM: number;
  seconds: number | null;
  mode: "drive" | "walk";
  overrideText: string | null;
  point: LngLat | null;
};

/**
 * Up to ten places for page 4: the two nearest of each kind first (schools, shops, transport…),
 * then the nearest of the rest, listed by kind and numbered for the plot.
 */
export function pickPois(all: PoiIn[], unit: DistanceUnit, max = 10): BrochurePoi[] {
  const order = (c: PoiCategory) => poiCategories.indexOf(c);
  const nearest = [...all].sort((a, b) => a.distanceM - b.distanceM);
  const chosen = new Set<PoiIn>();
  for (const c of poiCategories)
    for (const p of nearest.filter((x) => x.category === c).slice(0, 2))
      if (chosen.size < max) chosen.add(p);
  for (const p of nearest) if (chosen.size < max) chosen.add(p);
  return [...chosen]
    .sort((a, b) => order(a.category) - order(b.category) || a.distanceM - b.distanceM)
    .map((p, i) => ({
      n: i + 1,
      name: p.name,
      typeName: p.typeName,
      category: p.category,
      distanceText: distanceText(p, unit),
      distanceM: p.distanceM,
      point: p.point,
    }));
}

function agencyBlock(s: Settings, logo: BrochureImage | null): BrochureData["agency"] {
  return {
    name: s.general.agencyName,
    logo,
    phone: s.contact.phone || null,
    email: s.contact.email || null,
    address: s.contact.address || null,
    licenceNumber: s.general.licenceNumber || null,
    website: new URL(siteOrigin()).host,
  };
}

function whatsappLink(number: string | null | undefined, ref: string, url: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(format(tp.contact.whatsappText, { ref, url }))}`;
}

async function agencyLogo(s: Settings): Promise<BrochureImage | null> {
  const logo = await getPublicMedia(s.general.logoLightId);
  return logo ? { url: logo.url, alt: s.general.agencyName } : null;
}

const branding = (s: Settings): BrochureData["branding"] => ({
  colors: s.branding.colors,
  fontDisplay: s.branding.fontDisplay,
  fontBody: s.branding.fontBody,
  cornerStyle: s.branding.cornerStyle,
});

function perAreaText(price: number, size: number, unit: AreaUnit, currency: CurrencyFormat) {
  return format(t.pdf.perArea, {
    amount: formatMoney(Math.round(perAreaFromSqm(price / size, unit)), currency),
    unit: areaUnitLabels[unit],
  });
}

/* Listings ----------------------------------------------------------------------------- */

function listingFacts(l: PublicListing, unit: AreaUnit): BrochureFact[] {
  const hidden = new Set<string>(l.type?.hidden ?? []);
  const facts: BrochureFact[] = [];
  if (l.beds != null && !hidden.has("beds"))
    facts.push({ label: t.pdf.beds, value: bedsText(l.beds) });
  if (l.baths != null && !hidden.has("baths"))
    facts.push({ label: t.pdf.baths, value: String(l.baths) });
  if (l.size != null && !hidden.has("size"))
    facts.push({ label: t.pdf.size, value: formatArea(l.size, unit) });
  if (l.plotSize != null && !hidden.has("plotSize"))
    facts.push({ label: t.pdf.plot, value: formatArea(l.plotSize, unit) });
  if (l.type) facts.push({ label: t.pdf.type, value: l.type.name });
  facts.push(
    l.completion === "off_plan"
      ? { label: t.pdf.handover, value: l.handover ? handoverText(l.handover) : t.pdf.offPlan }
      : { label: t.pdf.completion, value: t.pdf.ready },
  );
  if (l.furnishing && !hidden.has("furnishing"))
    facts.push({ label: t.pdf.furnishing, value: l.furnishing });
  if (l.parkingSpaces != null && !hidden.has("parking"))
    facts.push({ label: t.pdf.parking, value: String(l.parkingSpaces) });
  if (l.places.length) facts.push({ label: t.pdf.area, value: l.places.at(-1)!.name });
  return facts;
}

function listingDetails(
  l: PublicListing,
  unit: AreaUnit,
  currency: CurrencyFormat,
): BrochureFact[] {
  const hidden = new Set<string>(l.type?.hidden ?? []);
  const rows: BrochureFact[] = [];
  if (l.view.length) rows.push({ label: t.pdf.view, value: l.view.join(", ") });
  if (l.floor && !hidden.has("floor")) rows.push({ label: t.pdf.floor, value: l.floor });
  if (l.yearBuilt) rows.push({ label: t.pdf.yearBuilt, value: String(l.yearBuilt) });
  if (l.ownership && l.purpose === "sale")
    rows.push({ label: t.pdf.ownership, value: l.ownership });
  if (l.serviceChargePerArea != null)
    rows.push({
      label: t.pdf.serviceCharge,
      value: format(t.pdf.serviceChargeValue, {
        amount: formatMoney(Math.round(perAreaFromSqm(l.serviceChargePerArea, unit)), currency),
        unit: areaUnitLabels[unit],
      }),
    });
  if (l.completion === "off_plan" && l.constructionProgress != null)
    rows.push({
      label: t.pdf.progress,
      value: format(t.pdf.progressValue, { n: l.constructionProgress }),
    });
  if (l.agencyFeeText) rows.push({ label: tp.details.agencyFee, value: l.agencyFeeText });
  return rows;
}

function listingPrice(l: PublicListing, currency: CurrencyFormat): string {
  if (l.price == null) return t.pdf.priceOnRequest;
  const amount = formatMoney(l.price, currency);
  if (l.purpose !== "rent" || !l.pricePeriod) return amount;
  return format(l.pricePeriod === "month" ? t.pdf.perMonth : t.pdf.perYear, { price: amount });
}

export async function loadPropertyBrochure(db: DbOrTx, id: string): Promise<LoadedBrochure | null> {
  const [row] = await db
    .select({ slug: properties.slug })
    .from(properties)
    .where(
      and(
        eq(properties.id, id),
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    );
  if (!row) return null;
  const l = await getPublicListing(row.slug);
  if (!l) return null;
  const s = await settingsFor(db);
  const unit = s.market.areaUnit;
  const currency = formatFor(l.currency || s.market.baseCurrency.code, currencyFormats(s.market));
  const pageUrl = siteUrl(`/property/${l.slug}`);

  const points = l.nearby.length
    ? await db
        .select({ id: propertyPois.id, point: pois.point })
        .from(propertyPois)
        .innerJoin(pois, eq(pois.id, propertyPois.poiId))
        .where(
          inArray(
            propertyPois.id,
            l.nearby.map((n) => n.id),
          ),
        )
    : [];
  const pointOf = new Map(points.map((p) => [p.id, p.point]));

  const logo = await agencyLogo(s);
  const a = l.agent;
  const photos = l.photos.map((p) => ({ url: p.url, alt: p.alt }));
  const floor = l.floorPlans.find((f) => f.mime.startsWith("image/"));
  const places = [...l.places].reverse().map((p) => p.name);
  const data: BrochureData = {
    kind: "property",
    id: l.id,
    slug: l.slug,
    reference: l.reference,
    title: l.title,
    subtitle: [l.buildingName, l.addressLine, ...places].filter(Boolean).join(", "),
    eyebrow: [
      l.purpose === "rent" ? t.pdf.forRent : t.pdf.forSale,
      l.completion === "off_plan" ? t.pdf.offPlan : null,
      l.type?.name ?? null,
    ]
      .filter(Boolean)
      .join(" · "),
    priceText: listingPrice(l, currency),
    pricePerAreaText:
      l.purpose === "sale" && l.price != null && l.size
        ? perAreaText(l.price, l.size, unit, currency)
        : null,
    statusNote: l.status === "available" ? null : statusLabels[l.status],
    facts: listingFacts(l, unit),
    cover: photos[0] ?? null,
    gallery: photos.slice(1, 7),
    aboutTitle: t.pdf.about,
    descriptionHtml: l.descriptionHtml,
    highlights: l.highlights,
    floorPlan: floor
      ? { url: floor.url, alt: floor.alt || t.pdf.floorPlan, title: t.pdf.floorPlan }
      : null,
    unitTypes: [],
    facilitiesTitle: t.pdf.facilities,
    facilities: l.facilities.map((f) => f.name),
    plan: l.plan
      ? {
          label: l.plan.summaryLabel || suggestSummaryLabel(l.plan.steps) || null,
          rows: planRows(l.plan.steps, l.purpose === "sale" ? l.price : null, currency),
          total: l.purpose === "sale" && l.price != null ? formatMoney(l.price, currency) : null,
          notes: l.plan.notes,
        }
      : null,
    details: listingDetails(l, unit, currency),
    location: {
      center: l.point,
      areaName: places.slice(-2).join(", ") || null,
      pois: pickPois(
        l.nearby.map((n) => {
          const walk = n.mode === "walk" && n.walkSeconds != null;
          return {
            name: n.name,
            typeName: n.typeName,
            category: n.category,
            distanceM: n.distanceM,
            seconds: walk ? n.walkSeconds : n.driveSeconds,
            mode: walk ? ("walk" as const) : ("drive" as const),
            overrideText: n.overrideText,
            point: pointOf.get(n.id) ?? null,
          };
        }),
        s.market.distanceUnit,
      ),
      distanceUnit: s.market.distanceUnit,
    },
    contact: a
      ? {
          heading: t.pdf.agent,
          name: a.name,
          title: a.title,
          photo: a.photoUrl ? { url: a.photoUrl, alt: a.name } : null,
          phone: a.phone || s.contact.phone || null,
          email: a.email || s.contact.email || null,
          whatsappHref: whatsappLink(a.whatsapp || s.contact.whatsapp, l.reference, pageUrl),
          whatsappText: a.whatsapp || s.contact.whatsapp || null,
        }
      : {
          heading: t.pdf.agency,
          name: s.general.agencyName,
          title: null,
          photo: null,
          phone: s.contact.phone || null,
          email: s.contact.email || null,
          whatsappHref: whatsappLink(s.contact.whatsapp, l.reference, pageUrl),
          whatsappText: s.contact.whatsapp || null,
        },
    permit:
      s.market.permit.enabled && l.permitNumber
        ? { label: s.market.permit.label, number: l.permitNumber }
        : null,
    agency: agencyBlock(s, logo),
    pageUrl,
    branding: branding(s),
  };
  const uploadedKey = l.brochure ? keyFromMediaUrl(l.brochure.url) : null;
  return {
    data,
    uploaded: uploadedKey ? { key: uploadedKey, fileName: l.brochure!.fileName } : null,
  };
}

/* Projects ----------------------------------------------------------------------------- */

function sizeRange(min: number | null, max: number | null, unit: AreaUnit): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && Math.round(min) !== Math.round(max))
    return `${formatArea(min, unit).split(" ")[0]}–${formatArea(max, unit)}`;
  return formatArea((min ?? max)!, unit);
}

function projectFacts(p: PublicProject): BrochureFact[] {
  const facts: BrochureFact[] = [];
  if (p.developer) facts.push({ label: t.pdf.developer, value: p.developer.name });
  if (p.locationPath.length) facts.push({ label: t.pdf.area, value: p.locationPath.at(-1)!.name });
  if (p.handover) facts.push({ label: t.pdf.handover, value: handoverText(p.handover) });
  facts.push({ label: t.pdf.status, value: pages.projects.statuses[p.status] });
  if (p.planLabel) facts.push({ label: t.pdf.plan, value: p.planLabel });
  if (p.unitTypesSummary) facts.push({ label: t.pdf.unitMix, value: p.unitTypesSummary });
  if (p.totalUnits != null) facts.push({ label: t.pdf.units, value: String(p.totalUnits) });
  if (p.progress != null)
    facts.push({ label: t.pdf.progress, value: format(t.pdf.progressValue, { n: p.progress }) });
  return facts;
}

export async function loadProjectBrochure(db: DbOrTx, id: string): Promise<LoadedBrochure | null> {
  const [row] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.agencyId, currentAgencyId()),
        isNull(projects.deletedAt),
        eq(projects.isPublished, true),
      ),
    );
  if (!row) return null;
  const p = await getPublicProject(row.slug);
  if (!p) return null;
  const s = await settingsFor(db);
  const unit = s.market.areaUnit;
  const currency = formatFor(p.currency || s.market.baseCurrency.code, currencyFormats(s.market));
  const pageUrl = siteUrl(`/projects/${p.slug}`);
  const logo = await agencyLogo(s);
  const photos = p.photos.map((x) => ({ url: x.url, alt: x.alt }));
  const unitPlan = p.unitTypes.find((u) => u.floorPlanUrl && isImage(u.floorPlanUrl));
  const floorPlan =
    p.masterPlan && !p.masterPlan.isPdf
      ? {
          url: p.masterPlan.url,
          alt: p.masterPlan.alt || t.pdf.masterPlan,
          title: t.pdf.masterPlan,
        }
      : unitPlan
        ? {
            url: unitPlan.floorPlanUrl!,
            alt: `${t.pdf.floorPlan}: ${unitPlan.name}`,
            title: `${t.pdf.floorPlan}: ${unitPlan.name}`,
          }
        : null;
  const places = [...p.locationPath].reverse().map((x) => x.name);

  const data: BrochureData = {
    kind: "project",
    id: p.id,
    slug: p.slug,
    reference: null,
    title: p.name,
    subtitle: [p.developer?.name, places.join(", ")].filter(Boolean).join(" · "),
    eyebrow: [t.pdf.project, pages.projects.statuses[p.status]].join(" · "),
    priceText:
      p.startingPrice != null
        ? format(t.pdf.from, { price: formatMoney(p.startingPrice, currency) })
        : t.pdf.priceOnRequest,
    pricePerAreaText: null,
    statusNote: null,
    facts: projectFacts(p),
    cover: photos[0] ?? null,
    gallery: photos.slice(1, 7),
    aboutTitle: t.pdf.aboutProject,
    descriptionHtml: p.descriptionHtml,
    highlights: p.highlights,
    floorPlan,
    unitTypes: p.unitTypes.map((u) => ({
      name: u.name,
      beds: bedsText(u.beds),
      size: sizeRange(u.sizeMin, u.sizeMax, unit),
      price: u.priceFrom != null ? formatMoney(u.priceFrom, currency) : "—",
    })),
    facilitiesTitle: t.pdf.amenities,
    facilities: p.facilities.map((f) => f.name),
    plan: p.plan
      ? {
          label: p.plan.summaryLabel || suggestSummaryLabel(p.plan.steps) || null,
          // A project has many prices: the plan shows shares only.
          rows: planRows(p.plan.steps, null, null),
          total: null,
          notes: p.plan.notes,
        }
      : null,
    details: [],
    location: {
      center: p.point ? { ...p.point, approx: false, radiusM: 0 } : null,
      areaName: places.slice(0, 2).join(", ") || null,
      pois: pickPois(
        p.nearby.map((n) => ({
          name: n.name,
          typeName: n.typeName,
          category: n.category,
          distanceM: n.distanceM,
          seconds: n.seconds,
          mode: n.mode,
          overrideText: n.overrideText,
          point: n.point,
        })),
        s.market.distanceUnit,
      ),
      distanceUnit: s.market.distanceUnit,
    },
    contact: {
      heading: t.pdf.agency,
      name: s.general.agencyName,
      title: null,
      photo: null,
      phone: s.contact.phone || null,
      email: s.contact.email || null,
      whatsappHref: whatsappLink(s.contact.whatsapp, p.name, pageUrl),
      whatsappText: s.contact.whatsapp || null,
    },
    permit: null,
    agency: agencyBlock(s, logo),
    pageUrl,
    branding: branding(s),
  };
  const uploadedKey = p.brochure ? keyFromMediaUrl(p.brochure.url) : null;
  return {
    data,
    uploaded: uploadedKey ? { key: uploadedKey, fileName: p.brochure!.fileName } : null,
  };
}

export function loadBrochure(db: DbOrTx, kind: BrochureKind, id: string) {
  return kind === "property" ? loadPropertyBrochure(db, id) : loadProjectBrochure(db, id);
}

/** The version: changes whenever anything printed changes (listing, media, agent, branding…). */
export async function brochureVersion(data: BrochureData): Promise<string> {
  return (await sha256Hex(JSON.stringify({ v: BROCHURE_TEMPLATE_VERSION, data }))).slice(0, 24);
}

/** Where a version is kept (R2 on Workers, the local disk in development). */
export const brochurePrefix = (kind: BrochureKind, id: string) => `brochures/${kind}/${id}/`;
export const brochureKey = (kind: BrochureKind, id: string, version: string) =>
  `${brochurePrefix(kind, id)}${version}.pdf`;

/** `[reference]-[slug].pdf` (11 §4); a project has no reference, so its slug. */
export function brochureFileName(data: Pick<BrochureData, "reference" | "slug">): string {
  const name = data.reference ? `${data.reference}-${data.slug}` : data.slug;
  return `${name.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
}
