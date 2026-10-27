import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties, propertyFacilities, propertyMedia } from "@/db/schema/properties";
import { mediaUrl } from "@/features/media/queries";
import { loadSettings } from "@/features/settings/queries";
import { toCsv, type CsvValue } from "@/lib/csv";
import { toMajor } from "@/lib/money";
import type { RichDoc } from "@/lib/rich-text";
import { areaFromSqm, perAreaFromSqm } from "@/lib/units";
import { templateFields, type FieldKey } from "./csv";
import { isLiveStatus } from "./status";

type Node = { type: string; text?: string; content?: Node[]; attrs?: Record<string, unknown> };

/** Rich text back to the plain text the import reads: blank lines between blocks. */
export function docToText(doc: RichDoc | null): string {
  if (!doc?.content) return "";
  const inline = (nodes: Node[] | undefined) =>
    (nodes ?? []).map((n) => (n.type === "hardBreak" ? "\n" : (n.text ?? ""))).join("");
  const block = (n: Node, depth = 0): string[] => {
    if (n.type === "paragraph" || n.type === "heading") return [inline(n.content)];
    if (n.type === "bulletList" || n.type === "orderedList")
      return (n.content ?? []).flatMap((li, i) => {
        const [first, ...rest] = (li.content ?? []).flatMap((c) => block(c, depth + 1));
        const marker = n.type === "bulletList" ? "-" : `${i + 1}.`;
        return [`${"  ".repeat(depth)}${marker} ${first ?? ""}`, ...rest];
      });
    return [];
  };
  return (doc.content as Node[])
    .flatMap((n) => block(n))
    .filter((t) => t.trim())
    .join("\n\n");
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

/**
 * The listings with these ids as CSV (07 §7), in the order they were created: the market's
 * area unit, money in major units of each listing's currency, photo and page links absolute.
 */
export async function exportPropertiesCsv(
  db: DbOrTx,
  ids: string[],
  origin: string,
): Promise<{ csv: string; count: number }> {
  const market = await loadSettings("market", db);
  const unit = market.areaUnit;
  const decimals = new Map(
    [...market.visitorCurrencies, market.baseCurrency].map((c) => [c.code, c.decimals]),
  );
  const columns = templateFields(unit, { exportOnly: true });
  const lines: CsvValue[][] = [columns.map((c) => c.key)];
  let count = 0;

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db
      .select({
        p: properties,
        typeName: propertyTypes.name,
        locationName: locations.name,
        agentName: agents.name,
      })
      .from(properties)
      .leftJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
      .leftJoin(locations, eq(locations.id, properties.locationId))
      .leftJoin(agents, eq(agents.id, properties.agentId))
      .where(and(eq(properties.agencyId, currentAgencyId()), inArray(properties.id, chunk)))
      .orderBy(asc(properties.createdAt), asc(properties.reference));
    const facilityRows = await db
      .select({ propertyId: propertyFacilities.propertyId, name: facilities.name })
      .from(propertyFacilities)
      .innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId))
      .where(inArray(propertyFacilities.propertyId, chunk))
      .orderBy(asc(facilities.name));
    const photoRows = await db
      .select({ propertyId: propertyMedia.propertyId, key: media.r2Key })
      .from(propertyMedia)
      .innerJoin(media, eq(media.id, propertyMedia.mediaId))
      .where(
        and(
          inArray(propertyMedia.propertyId, chunk),
          eq(propertyMedia.kind, "photo"),
          eq(media.status, "ready"),
        ),
      )
      // Cover first: the import makes the first photo the cover again.
      .orderBy(
        asc(propertyMedia.propertyId),
        desc(propertyMedia.isCover),
        asc(propertyMedia.sortOrder),
      );
    const facilitiesOf = groupBy(
      facilityRows,
      (r) => r.propertyId,
      (r) => r.name,
    );
    const photosOf = groupBy(
      photoRows,
      (r) => r.propertyId,
      (r) => `${origin}${mediaUrl(r.key)}`,
    );

    for (const { p, typeName, locationName, agentName } of rows) {
      const d = decimals.get(p.currency ?? "") ?? market.baseCurrency.decimals;
      const money = (v: number | null) => (v == null ? null : round(toMajor(v, d), d));
      const area = (v: number | null) => (v == null ? null : round(areaFromSqm(v, unit), 2));
      const values: Record<FieldKey, CsvValue> = {
        reference: p.reference,
        status: p.status,
        title: p.title,
        purpose: p.purpose,
        completion: p.completion === "off_plan" ? "off-plan" : "ready",
        property_type: typeName,
        location: locationName,
        building: p.buildingName,
        address: p.addressLine,
        unit_number: p.unitNumber,
        floor: p.floor,
        latitude: p.point?.lat ?? null,
        longitude: p.point?.lng ?? null,
        coordinates: null,
        price: money(p.price),
        currency: p.currency,
        price_on_request: p.priceOnRequest,
        rent_period: p.pricePeriod,
        beds: p.beds,
        baths: p.baths,
        size_sqft: area(p.size),
        size_sqm: area(p.size),
        plot_size_sqft: area(p.plotSize),
        plot_size_sqm: area(p.plotSize),
        year_built: p.yearBuilt,
        parking: p.parkingSpaces,
        furnishing: p.furnishing,
        ownership: p.ownership,
        view: p.view.join(" | "),
        maid_room: p.maidRoom,
        study: p.study,
        service_charge_per_sqft:
          p.serviceChargePerArea == null
            ? null
            : money(Math.round(perAreaFromSqm(p.serviceChargePerArea, unit))),
        service_charge_per_sqm:
          p.serviceChargePerArea == null
            ? null
            : money(Math.round(perAreaFromSqm(p.serviceChargePerArea, unit))),
        deposit: money(p.depositAmount),
        agency_fee: p.agencyFeeText,
        handover: p.handoverDate ?? p.handoverText,
        construction_progress: p.constructionProgress,
        expected_rent: money(p.expectedRentYearly),
        tenanted: p.isTenanted,
        tenancy_end: p.tenancyEndDate,
        description: docToText(p.description),
        highlights: p.highlights.join(" | "),
        facilities: (facilitiesOf.get(p.id) ?? []).join(" | "),
        video_url: p.videoUrl,
        tour_url: p.tourUrl,
        permit_number: p.permitNumber,
        agent: agentName,
        photo_urls: (photosOf.get(p.id) ?? []).join(" | "),
        seo_title: p.seoTitle,
        seo_description: p.seoDescription,
        published_at: p.publishedAt ? p.publishedAt.toISOString().slice(0, 10) : null,
        url: !p.deletedAt && isLiveStatus(p.status) ? `${origin}/property/${p.slug}` : null,
      };
      lines.push(columns.map((c) => values[c.key]));
      count++;
    }
  }
  return { csv: toCsv(lines, { bom: true }), count };
}

function groupBy<T, V>(rows: T[], key: (r: T) => string, value: (r: T) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(value(r));
    else map.set(k, [value(r)]);
  }
  return map;
}
