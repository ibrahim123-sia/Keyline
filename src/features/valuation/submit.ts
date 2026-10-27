import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { listingRequests, valuationRequests, type Requirements } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { captureLead } from "@/features/leads/capture";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { format } from "@/lib/i18n";
import { valuation as t } from "@/lib/i18n/dictionaries/valuation";
import { formatMoney, toMinor } from "@/lib/money";
import { areaToSqm } from "@/lib/units";
import { loadComparableCandidates, locationAndBelow } from "./comparables";
import { estimateValuation, type ValuationEstimate } from "./estimate";
import { conditionLabel, homeSummary, rangeText, upgradeLabels } from "./format";
import { OWNER_REQUEST_NOTIFY_JOB } from "./notify";
import { photoIdsFromReceipts } from "./photos";
import type {
  ListingRequestData,
  OwnerRequestKind,
  OwnerRequestResult,
  ValuationRequestData,
} from "./schema";

const DAY_MS = 86_400_000;

const fieldError = (field: string, message: string) =>
  new ActionError(t.errors.check, "VALIDATION", { [field]: [message] });

/**
 * A valuation or "list your property" request from the site (11 §5-6, 09 §1 #12-13): checks
 * the area and type, works out the estimate from comparable own listings (valuations), then
 * the lead (source valuation / listing_request, type seller or landlord) with a task for its
 * agent, the request row with its photos, and the owner_request.notify job for the messages.
 */
export async function submitOwnerRequest(
  db: Db,
  kind: OwnerRequestKind,
  data: ValuationRequestData | ListingRequestData,
  options: { visitorKey?: string | null; now?: Date } = {},
): Promise<OwnerRequestResult & { requestId: string; leadId: string }> {
  const now = options.now ?? new Date();
  const agency = currentAgencyId();
  const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
  const currency = market.baseCurrency;

  const [location] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(and(eq(locations.id, data.locationId), eq(locations.agencyId, agency)));
  if (!location) throw fieldError("locationId", t.errors.area);
  const [type] = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name, hidden: propertyTypes.fieldsHidden })
    .from(propertyTypes)
    .where(and(eq(propertyTypes.id, data.propertyTypeId), eq(propertyTypes.agencyId, agency)));
  if (!type) throw fieldError("propertyTypeId", t.errors.type);
  const beds = type.hidden.includes("beds") ? null : data.beds;
  if (!type.hidden.includes("beds") && beds == null) throw fieldError("beds", t.errors.beds);
  const baths = type.hidden.includes("baths") ? null : data.baths;
  const size = Math.round(areaToSqm(data.size, market.areaUnit) * 100) / 100;
  const purpose = data.purpose === "rent" ? ("rent" as const) : ("sale" as const);
  const photoIds = await photoIdsFromReceipts(db, data.photos);
  const building = data.building || null;
  const period = purpose === "rent" ? market.rentPeriod : null;

  // The estimate (11 §5): comparable own listings in the area or anywhere inside it.
  let estimate: ValuationEstimate | null = null;
  let comparableRows: Awaited<ReturnType<typeof loadComparableCandidates>> = [];
  if (kind === "valuation") {
    const areaIds = await locationAndBelow(db, location.id);
    comparableRows = await loadComparableCandidates(db, {
      purpose,
      propertyTypeId: type.id,
      locationIds: areaIds,
      currency: currency.code,
      rentPeriod: market.rentPeriod,
    });
    estimate = estimateValuation(
      { purpose, propertyTypeId: type.id, areaLocationIds: areaIds, beds, size },
      comparableRows,
      { decimals: currency.decimals },
    );
  }
  const range =
    estimate?.status === "estimate"
      ? rangeText(estimate.low, estimate.high, currency, period)
      : null;

  const listing = kind === "listing" ? (data as ListingRequestData) : null;
  const askingPrice =
    listing?.askingPrice != null ? toMinor(listing.askingPrice, currency.decimals) : null;
  const where = building ? `${building}, ${location.name}` : location.name;
  const task =
    kind === "listing"
      ? { title: `Call about listing the home in ${where}`, dueAt: now }
      : range
        ? {
            title: `Refine the valuation for ${where} (estimate ${range})`,
            dueAt: new Date(now.getTime() + DAY_MS),
          }
        : {
            title: `Value the home in ${where}: not enough comparables, arrange a visit`,
            dueAt: now,
          };
  const requirements: Requirements = {
    purpose,
    locationIds: [location.id],
    propertyTypeIds: [type.id],
    ...(beds != null ? { bedsMin: beds } : {}),
  };
  const home = homeSummary(
    { typeName: type.name, beds, size, building, areaName: location.name },
    market.areaUnit,
  );

  const lead = await captureLead(db, {
    source: kind === "valuation" ? "valuation" : "listing_request",
    sourceDetail: kind === "valuation" ? "valuation tool" : "list your property",
    contact: {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      marketingConsent: data.marketing,
    },
    message: data.notes || null,
    requirements,
    details: Object.fromEntries(
      Object.entries({
        purpose: t.messages.purposes[data.purpose],
        area: home,
        estimate:
          kind === "valuation"
            ? range
              ? format(t.messages.estimateLine, {
                  range,
                  count: estimate?.comparables.length ?? 0,
                })
              : t.messages.noEstimateLine
            : "",
        expectedPrice: askingPrice != null ? formatMoney(askingPrice, currency) : "",
        availableFrom: listing?.availableFrom ?? "",
        condition: conditionLabel(data.condition) ?? "",
        upgrades: upgradeLabels(data.upgrades).join(", "),
        photos: photoIds.length || "",
      }).filter(([, v]) => v !== ""),
    ),
    visitorKey: options.visitorKey ?? null,
    task,
    now,
  });

  const row = {
    contactId: lead.contactId,
    leadId: lead.leadId,
    purpose: data.purpose,
    propertyTypeId: type.id,
    locationId: location.id,
    building,
    beds,
    baths,
    size,
    condition: data.condition,
    upgrades: data.upgrades,
    notes: data.notes || null,
    currency: currency.code,
    photoIds,
    aiRangeMin: estimate?.status === "estimate" ? estimate.low : null,
    aiRangeMax: estimate?.status === "estimate" ? estimate.high : null,
    aiComparableIds: estimate?.comparables.map((c) => c.id) ?? [],
  };
  const [saved] =
    kind === "valuation"
      ? await db.insert(valuationRequests).values(row).returning({ id: valuationRequests.id })
      : await db
          .insert(listingRequests)
          .values({ ...row, askingPrice, availableFrom: listing?.availableFrom || null })
          .returning({ id: listingRequests.id });
  const requestId = saved!.id;
  await enqueue(
    OWNER_REQUEST_NOTIFY_JOB,
    { kind, requestId },
    { db, dedupeKey: `${OWNER_REQUEST_NOTIFY_JOB}:${requestId}` },
  );

  const [agent] = lead.agentId
    ? await db
        .select({ name: agents.name, isActive: agents.isActive })
        .from(agents)
        .where(eq(agents.id, lead.agentId))
    : [];
  const byId = new Map(comparableRows.map((c) => [c.id, c]));
  return {
    requestId,
    leadId: lead.leadId,
    kind,
    agentName: agent?.isActive ? agent.name.split(/\s+/)[0]! : general.agencyName,
    areaName: location.name,
    email: data.email || null,
    estimate:
      kind !== "valuation" || !estimate
        ? null
        : estimate.status === "not_enough_data"
          ? { status: "not_enough_data" }
          : {
              status: "estimate",
              low: estimate.low,
              mid: estimate.mid,
              high: estimate.high,
              currency: currency.code,
              period,
              comparables: estimate.comparables.map((c) => {
                const r = byId.get(c.id)!;
                return {
                  id: c.id,
                  title: r.title,
                  slug: r.slug,
                  beds: c.beds,
                  size: c.size,
                  price: c.price,
                  status: r.status,
                  locationName: r.locationName,
                };
              }),
            },
  };
}
