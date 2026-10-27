import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import { loadSettings } from "@/features/settings/queries";
import type { LeadImportContext } from "./csv";

/** What a lead CSV is checked against: lead types, places, listing references, the market. */
export async function loadLeadImportContext(db: DbOrTx): Promise<LeadImportContext> {
  const agency = currentAgencyId();
  const [leadSettings, market] = [
    await loadSettings("leads", db),
    await loadSettings("market", db),
  ];
  const areas = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.agencyId, agency))
    .orderBy(asc(locations.name));
  const listings = await db
    .select({ id: properties.id, reference: properties.reference })
    .from(properties)
    .where(and(eq(properties.agencyId, agency), isNull(properties.deletedAt)));
  return {
    leadTypes: leadSettings.leadTypes,
    areas,
    listings,
    phoneCountryCode: market.phoneCountryCode,
    currencyDecimals: market.baseCurrency.decimals,
  };
}
