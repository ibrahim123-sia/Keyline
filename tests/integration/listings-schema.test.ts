import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties, propertyFacilities, propertyMedia } from "@/db/schema/properties";
import { deleteAgent } from "@/features/agents/actions";
import { deleteLocation } from "@/features/locations/actions";
import { mergeMasterItem } from "@/features/master-data/actions";
import { deleteMedia } from "@/features/media/actions";
import { nextPropertyReference } from "@/features/properties/reference";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

async function world() {
  const db = await getDb();
  const ids = {
    type: newId(),
    location: newId(),
    agent: newId(),
    pool: newId(),
    gym: newId(),
    photo: newId(),
  };
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db.insert(locations).values({
    id: ids.location,
    level: "area",
    name: "Harbour District",
    slug: "harbour-district",
  });
  await db.insert(agents).values({ id: ids.agent, name: "Layla", slug: "layla" });
  await db.insert(facilities).values([
    { id: ids.pool, name: "Pool" },
    { id: ids.gym, name: "Gym" },
  ]);
  await db.insert(media).values({
    id: ids.photo,
    r2Key: "2026/10/abcdefghij/front.jpg",
    fileName: "front.jpg",
    mime: "image/jpeg",
    status: "ready",
  });
  return { db, ids };
}

describe("listings schema", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "property_media",
      "property_facilities",
      "media",
      "agents",
      "locations",
      "property_types",
      "facilities",
      "audit_log",
      "settings",
    );
  });

  it("generates references, price per area, yield and a search vector", async () => {
    const { db, ids } = await world();
    const a = await nextPropertyReference(db);
    const b = await nextPropertyReference(db);
    expect(a).toMatch(/^LT-\d{4,}$/);
    expect(Number(b.slice(3))).toBe(Number(a.slice(3)) + 1);

    const id = newId();
    await db.insert(properties).values({
      id,
      reference: a,
      title: "Sea view apartment",
      slug: "sea-view-apartment",
      purpose: "sale",
      propertyTypeId: ids.type,
      locationId: ids.location,
      agentId: ids.agent,
      price: 245_000_000, // 2,450,000.00
      currency: "USD",
      size: 120.5,
      expectedRentYearly: 18_000_000,
      buildingName: "Marina Gate",
      searchText: "Harbour District",
    });
    const [row] = await db.select().from(properties).where(eq(properties.id, id));
    expect(row!.pricePerArea).toBe(2_033_195);
    expect(row!.expectedYield).toBe(7.35);
    const found = await db.execute<{ id: string }>(
      sql`select id from properties where search_vector @@ plainto_tsquery('simple', lintel_normalize('harbour marina'))`,
    );
    expect(found.rows.map((r) => r.id)).toEqual([id]);
  });

  it("listings count as usage: agents, locations, facilities and files are protected", async () => {
    const { db, ids } = await world();
    const id = newId();
    await db.insert(properties).values({
      id,
      agencyId: currentAgencyId(),
      reference: await nextPropertyReference(db),
      title: "Garden villa",
      slug: "garden-villa",
      purpose: "rent",
      propertyTypeId: ids.type,
      locationId: ids.location,
      agentId: ids.agent,
    });
    await db.insert(propertyFacilities).values([
      { propertyId: id, facilityId: ids.pool },
      { propertyId: id, facilityId: ids.gym },
    ]);
    await db
      .insert(propertyMedia)
      .values({ propertyId: id, mediaId: ids.photo, kind: "photo", isCover: true });

    const agent = await deleteAgent({ id: ids.agent });
    expect(agent.ok === false && agent.error).toContain("1 listings");
    const location = await deleteLocation({ id: ids.location });
    expect(location.ok === false && location.error).toContain("1 listings");
    const file = await deleteMedia({ ids: [ids.photo] });
    expect(file).toMatchObject({ ok: true, data: { deleted: 0 } });
    expect(file.ok && file.data.skipped[0]!.usedIn[0]).toMatch(/^Listing LT-\d+: photo$/);

    // Merging "Pool" into "Gym" keeps one link per listing (no duplicate key).
    expect(
      await mergeMasterItem({ kind: "facilities", fromId: ids.pool, toId: ids.gym }),
    ).toMatchObject({ ok: true });
    const links = await db
      .select()
      .from(propertyFacilities)
      .where(eq(propertyFacilities.propertyId, id));
    expect(links.map((l) => l.facilityId)).toEqual([ids.gym]);
  });
});
