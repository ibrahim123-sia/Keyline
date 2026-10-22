import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { listingRequests, valuationRequests, type Requirements } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { captureLead, type LeadCapture } from "@/features/leads/capture";
import { subscribeNewsletter } from "@/features/newsletter/subscribe";
import { loadSettings } from "@/features/settings/queries";
import type { PageForm } from "./schema";

type FormInput = Omit<PageForm, "consent" | "website" | "captchaToken">;

/** "2.4M", "850k", "1,200,000" -> major units, or null. */
export function parseAmount(text: string): number | null {
  const m = text.replace(/[\s,]/g, "").match(/(\d+(?:\.\d+)?)(k|m|mn|million)?/i);
  if (!m) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const n = Number(m[1]) * (unit === "k" ? 1e3 : unit ? 1e6 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Studio" is 0 bedrooms; anything else needs a number. */
export function parseBeds(text: string): number | null {
  if (/studio/i.test(text)) return 0;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}

/** The location or property type a visitor typed, when it names one we know. */
async function matchMasterData(db: Db, area: string, type: string) {
  const agency = currentAgencyId();
  const [location] = area
    ? await db
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.agencyId, agency),
            or(
              sql`lintel_normalize(${locations.name}) = lintel_normalize(${area})`,
              eq(locations.slug, area.toLowerCase()),
            ),
          ),
        )
        .limit(1)
    : [];
  const [propertyType] = type
    ? await db
        .select({ id: propertyTypes.id })
        .from(propertyTypes)
        .where(
          and(
            eq(propertyTypes.agencyId, agency),
            or(
              sql`lintel_normalize(${propertyTypes.name}) = lintel_normalize(${type})`,
              eq(propertyTypes.slug, type.toLowerCase()),
            ),
          ),
        )
        .limit(1)
    : [];
  return { locationId: location?.id ?? null, propertyTypeId: propertyType?.id ?? null };
}

const sources = {
  contact: "form",
  callback: "callback",
  valuation: "valuation",
  list_property: "listing_request",
} as const;

/**
 * A page form submit (06 §10, 09 §1): contact, callback, valuation and "list your property"
 * become leads (or a new entry on the person's open lead) with the visitor's attribution;
 * owners also get a valuation or listing request and a task. The agency hears about it from
 * the lead pipeline. A newsletter form signs the address up (double opt-in).
 */
export async function handlePageForm(
  db: Db,
  input: FormInput,
  visitorKey: string | null = null,
): Promise<{ kind: "lead" | "subscriber"; leadId?: string }> {
  const [page] = input.pageId
    ? await db
        .select({ title: pages.title, slug: pages.slug })
        .from(pages)
        .where(
          and(
            eq(pages.id, input.pageId),
            eq(pages.agencyId, currentAgencyId()),
            isNull(pages.deletedAt),
          ),
        )
    : [];

  if (input.formType === "newsletter") {
    await subscribeNewsletter(db, {
      email: input.email,
      source: page ? `page:${page.slug}` : "page",
    });
    return { kind: "subscriber" };
  }

  const owner = input.formType === "valuation" || input.formType === "list_property";
  const { locationId, propertyTypeId } = owner
    ? await matchMasterData(db, input.area, input.propertyType)
    : { locationId: null, propertyTypeId: null };
  const beds = owner ? parseBeds(input.beds) : null;
  const purpose = input.purpose ?? "sale";
  const requirements: Requirements = owner
    ? {
        purpose,
        ...(locationId ? { locationIds: [locationId] } : {}),
        ...(propertyTypeId ? { propertyTypeIds: [propertyTypeId] } : {}),
        ...(beds !== null ? { bedsMin: beds } : {}),
      }
    : {};
  const when = input.preferredTime;
  const where = input.area || "their property";
  const task: LeadCapture["task"] =
    input.formType === "callback"
      ? { title: when ? `Call back (best time: ${when})` : "Call back", dueAt: new Date() }
      : input.formType === "valuation"
        ? { title: `Value the home in ${where}`, dueAt: new Date() }
        : input.formType === "list_property"
          ? { title: `Call about listing the home in ${where}`, dueAt: new Date() }
          : null;

  const lead = await captureLead(db, {
    source: sources[input.formType],
    sourceDetail: input.formType === "contact" ? "contact" : "page form",
    contact: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      preferredContact: input.formType === "callback" ? "call" : null,
    },
    message: input.message || null,
    requirements,
    details: Object.fromEntries(
      Object.entries({
        page: page?.title ?? "",
        preferredTime: when,
        purpose: owner ? (purpose === "rent" ? "Rent" : "Sale") : "",
        area: input.area,
        propertyType: input.propertyType,
        beds: input.beds,
        expectedPrice: input.expectedPrice,
      }).filter(([, v]) => v !== ""),
    ),
    visitorKey,
    task,
  });

  if (owner) {
    const notes = [
      input.message,
      input.expectedPrice ? `Expected price: ${input.expectedPrice}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const row = {
      contactId: lead.contactId,
      leadId: lead.leadId,
      purpose: purpose === "rent" ? ("rent" as const) : ("sell" as const),
      propertyTypeId,
      locationId,
      building: input.area || null,
      beds,
      notes: notes || null,
    };
    if (input.formType === "valuation") await db.insert(valuationRequests).values(row);
    else {
      const market = await loadSettings("market", db);
      const amount = parseAmount(input.expectedPrice);
      await db.insert(listingRequests).values({
        ...row,
        askingPrice:
          amount === null ? null : Math.round(amount * 10 ** market.baseCurrency.decimals),
      });
    }
  }
  return { kind: "lead", leadId: lead.leadId };
}
