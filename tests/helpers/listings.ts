import { getDb } from "@/db/client";
import { facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { testAdmin } from "./admin-context";

const actor = { type: "admin" as const, id: testAdmin.id };

/** Market in sq ft and AED, one type, Dubai > Dubai Marina, one agent, Pool and Gym. */
export async function importWorld() {
  const db = await getDb();
  const ids = {
    apt: newId(),
    city: newId(),
    marina: newId(),
    agent: newId(),
    pool: newId(),
    gym: newId(),
  };
  await patchSettings(
    db,
    "market",
    {
      areaUnit: "sqft",
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      rentPeriod: "year",
    },
    actor,
  );
  await db.insert(propertyTypes).values({ id: ids.apt, name: "Apartment", slug: "apartments" });
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
    {
      id: ids.marina,
      parentId: ids.city,
      level: "area",
      name: "Dubai Marina",
      slug: "dubai-marina",
    },
  ]);
  await db
    .insert(agents)
    .values({ id: ids.agent, name: "Sara Khan", slug: "sara-khan", email: "sara@agency.example" });
  await db.insert(facilities).values([
    { id: ids.pool, name: "Pool" },
    { id: ids.gym, name: "Gym" },
  ]);
  return { db, ids };
}
