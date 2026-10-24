import "server-only";
import { asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { propertyTypes } from "@/db/schema/master-data";
import type { OwnerFormOptions } from "@/components/site/valuation/owner-request-form";
import { getLocationTree } from "@/features/locations/queries";
import { loadSettings } from "@/features/settings/queries";
import { tags } from "@/lib/cache-tags";

/**
 * What the owner forms offer (cached): areas below the country level in tree order, with
 * communities and buildings indented under their area, the property types and the market.
 */
export async function ownerFormOptions(): Promise<OwnerFormOptions> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.locations, tags.masterData("property-types"), tags.settings("market"));
  const db = await getDb();
  const [tree, market] = [await getLocationTree(), await loadSettings("market", db)];
  const types = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name, hidden: propertyTypes.fieldsHidden })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, currentAgencyId()))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));

  const children = new Map<string | null, typeof tree>();
  for (const n of tree) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const out: OwnerFormOptions["locations"] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of children.get(parentId) ?? []) {
      // Countries are only a heading level; cities and below can be chosen.
      const shown = n.level === "country" ? depth : depth + 1;
      if (n.level !== "country")
        out.push({ id: n.id, label: `${"— ".repeat(Math.max(0, shown - 1))}${n.name}` });
      walk(n.id, shown);
    }
  };
  walk(null, 0);
  return {
    locations: out,
    types: types.map((x) => ({
      id: x.id,
      name: x.name,
      hidesBeds: x.hidden.includes("beds"),
      hidesBaths: x.hidden.includes("baths"),
    })),
    areaUnit: market.areaUnit,
    currency: market.baseCurrency,
    rentPeriod: market.rentPeriod,
  };
}
