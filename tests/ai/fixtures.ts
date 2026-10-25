import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { faqs } from "@/db/schema/content";
import { facilities, locations, pois, poiTypes, propertyTypes } from "@/db/schema/master-data";
import { properties, propertyFacilities, propertyPois } from "@/db/schema/properties";
import { backfillEmbeddings } from "@/features/ai/embeddings";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { renderRichText, type RichDoc } from "@/lib/rich-text";

/**
 * A small fictional agency for the AI eval set and the AI integration tests (Keyline demo
 * data, AED, m²). Listings are referred to by key in the eval cases.
 */

export const evalListingKeys = [
  "marinaSeaView",
  "hillsVilla",
  "downtownStudio",
  "marinaPenthouse",
  "hillsTownhouse",
  "draftVilla",
] as const;
export type EvalListingKey = (typeof evalListingKeys)[number];
export const evalFaqKeys = ["buyerFees", "weekendViewings"] as const;
export type EvalFaqKey = (typeof evalFaqKeys)[number];

export type EvalWorld = {
  listings: Record<EvalListingKey, { id: string; reference: string; title: string }>;
  faqs: Record<EvalFaqKey, string>;
  locations: Record<"dubai" | "marina" | "hills" | "downtown", string>;
};

export const doc = (...paragraphs: string[]): RichDoc =>
  ({
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  }) as RichDoc;

/** Tables the world writes to (for clean-up between tests). */
export const evalWorldTables = [
  "embeddings",
  "properties",
  "property_facilities",
  "property_pois",
  "pois",
  "poi_types",
  "facilities",
  "locations",
  "property_types",
  "faqs",
  "settings",
];

const system = { type: "system" as const, id: null };

export async function seedEvalWorld(db: DbOrTx): Promise<EvalWorld> {
  await patchSettings(
    db,
    "market",
    {
      areaUnit: "sqm",
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      visitorCurrencies: [],
    },
    system,
  );
  const types = { apartment: newId(), villa: newId(), townhouse: newId() };
  await db.insert(propertyTypes).values([
    { id: types.apartment, name: "Apartment", slug: "apartments" },
    { id: types.villa, name: "Villa", slug: "villas" },
    { id: types.townhouse, name: "Townhouse", slug: "townhouses" },
  ]);
  const loc = { dubai: newId(), marina: newId(), hills: newId(), downtown: newId() };
  await db.insert(locations).values([
    { id: loc.dubai, level: "city", name: "Dubai", slug: "dubai" },
    {
      id: loc.marina,
      parentId: loc.dubai,
      level: "area",
      name: "Dubai Marina",
      slug: "dubai-marina",
    },
    { id: loc.hills, parentId: loc.dubai, level: "area", name: "Dubai Hills", slug: "dubai-hills" },
    { id: loc.downtown, parentId: loc.dubai, level: "area", name: "Downtown", slug: "downtown" },
  ]);
  const fac = { pool: newId(), gym: newId(), garden: newId() };
  await db.insert(facilities).values([
    { id: fac.pool, name: "Swimming pool" },
    { id: fac.gym, name: "Gym" },
    { id: fac.garden, name: "Private garden" },
  ]);
  const schoolType = newId();
  const school = newId();
  await db.insert(poiTypes).values({ id: schoolType, name: "School", category: "schools" });
  await db.insert(pois).values({
    id: school,
    poiTypeId: schoolType,
    name: "Hills International School",
    point: { lng: 55.25, lat: 25.11 },
  });

  let n = 0;
  const listing = async (
    values: Partial<typeof properties.$inferInsert> & { title: string },
    description: string,
  ) => {
    const id = newId();
    n += 1;
    const reference = `KL-${2000 + n}`;
    const rich = doc(description);
    await db.insert(properties).values({
      id,
      reference,
      slug: `eval-${n}-${id.slice(-6)}`,
      purpose: "sale",
      status: "available",
      publishedAt: new Date(Date.UTC(2026, 8, n)),
      currency: "AED",
      description: rich,
      descriptionHtml: renderRichText(rich),
      ...values,
    });
    return { id, reference, title: values.title };
  };

  const listings: EvalWorld["listings"] = {
    marinaSeaView: await listing(
      {
        title: "Two-bed apartment with sea view in Dubai Marina",
        propertyTypeId: types.apartment,
        locationId: loc.marina,
        beds: 2,
        baths: 2,
        size: 120,
        price: 180_000_000,
        view: ["sea"],
      },
      "Bright apartment with a full sea view from every room, a large balcony, and a shared swimming pool and gym in the building.",
    ),
    hillsVilla: await listing(
      {
        title: "Family villa with private garden in Dubai Hills",
        propertyTypeId: types.villa,
        locationId: loc.hills,
        beds: 4,
        baths: 5,
        size: 420,
        price: 650_000_000,
        maidRoom: true,
      },
      "Four-bedroom family villa with a private garden and maid's room, a short walk from a school and the park.",
    ),
    downtownStudio: await listing(
      {
        title: "Furnished studio near the metro in Downtown",
        purpose: "rent",
        propertyTypeId: types.apartment,
        locationId: loc.downtown,
        beds: 0,
        baths: 1,
        size: 45,
        price: 8_500_000,
        pricePeriod: "year",
        furnishing: "furnished",
      },
      "Fully furnished studio with tower views, walking distance to the metro station and the mall.",
    ),
    marinaPenthouse: await listing(
      {
        title: "Penthouse with private pool on the Marina",
        propertyTypeId: types.apartment,
        locationId: loc.marina,
        beds: 4,
        baths: 5,
        size: 600,
        price: 1_200_000_000,
        isFeatured: true,
      },
      "Duplex penthouse with a private rooftop pool, a wraparound terrace and views over the yachts.",
    ),
    hillsTownhouse: await listing(
      {
        title: "Off-plan townhouse with payment plan in Dubai Hills",
        propertyTypeId: types.townhouse,
        locationId: loc.hills,
        beds: 3,
        baths: 3,
        size: 210,
        price: 320_000_000,
        completion: "off_plan",
        handoverText: "Q4 2027",
      },
      "Three-bedroom townhouse with handover at the end of 2027, close to the shopping mall and the golf course.",
    ),
    draftVilla: await listing(
      {
        title: "Secret beachfront villa",
        status: "draft",
        publishedAt: null,
        propertyTypeId: types.villa,
        locationId: loc.marina,
        beds: 6,
        price: 5_000_000_000,
      },
      "A private beachfront villa that is not on the market yet.",
    ),
  };
  await db.insert(propertyFacilities).values([
    { propertyId: listings.marinaSeaView.id, facilityId: fac.pool },
    { propertyId: listings.marinaSeaView.id, facilityId: fac.gym },
    { propertyId: listings.hillsVilla.id, facilityId: fac.garden },
  ]);
  await db.insert(propertyPois).values({
    propertyId: listings.hillsVilla.id,
    poiId: school,
    straightDistanceM: 650,
  });

  const faq = async (question: string, answer: string) => {
    const id = newId();
    const rich = doc(answer);
    await db.insert(faqs).values({
      id,
      question,
      answer: rich,
      answerHtml: renderRichText(rich),
      group: "buying",
      isPublished: true,
    });
    return id;
  };
  const faqIds: EvalWorld["faqs"] = {
    buyerFees: await faq(
      "What fees does a buyer pay?",
      "Buyers pay the agency fee of 2% and the land department transfer fee. Our team can give you the full list for a home.",
    ),
    weekendViewings: await faq(
      "Can I view a home at the weekend?",
      "Yes. Viewings are possible on Saturdays; book a time on the listing page.",
    ),
  };

  await backfillEmbeddings(db);
  return { listings, faqs: faqIds, locations: loc };
}

/** Count of chunks per entity (tests). */
export async function embeddingCount(db: DbOrTx, entityId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from embeddings where entity_id = ${entityId}`,
  );
  return rows.rows[0]?.n ?? 0;
}
