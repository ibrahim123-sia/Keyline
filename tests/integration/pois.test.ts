import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pois } from "@/db/schema/master-data";
import { setMapsProvider, type MapsProvider } from "@/features/integrations/google-maps";
import { saveMasterItem } from "@/features/master-data/actions";
import {
  importGooglePlaces,
  savePoi,
  searchGooglePlaces,
  setPoisActive,
} from "@/features/pois/actions";
import { listPois } from "@/features/pois/queries";
import { saveSettings } from "@/features/settings/mutations";
import { loadSettings } from "@/features/settings/queries";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const marina = { lng: 55.1403, lat: 25.0805 };
const fake: MapsProvider = {
  geocode: async () => ({ point: marina, label: "Dubai Marina" }),
  nearby: async ({ type }) => [
    {
      googlePlaceId: "g-1",
      name: `${type} one`,
      address: "Marina Walk",
      point: { lng: 55.141, lat: 25.081 },
      website: null,
    },
    {
      googlePlaceId: "g-2",
      name: `${type} two`,
      address: "JBR",
      point: { lng: 55.135, lat: 25.077 },
      website: "https://two.example",
    },
  ],
  routes: async () => [],
};

async function schoolType(googlePlaceType: string | null = "school") {
  const res = await saveMasterItem({
    kind: "poi-types",
    id: null,
    data: {
      name: "Schools",
      icon: "school",
      category: "schools",
      googlePlaceType,
      defaultSearchRadiusM: 3000,
      showOnProperty: true,
      travelMode: "drive",
    },
  });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

describe("POIs", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    // Other files store integration keys; "no key" must not depend on the file order.
    await truncate("pois", "poi_types", "audit_log", "secrets", "settings");
  });
  afterEach(() => setMapsProvider(null));

  it("refuses Google search and import when Import from Google is turned off", async () => {
    const db = await getDb();
    const integrations = await loadSettings("integrations", db);
    await saveSettings(
      db,
      "integrations",
      { ...integrations, googleMaps: { ...integrations.googleMaps, importPlaces: false } },
      { type: "admin", id: testAdmin.id },
    );
    const typeId = await schoolType();
    expect(
      await searchGooglePlaces({ poiTypeId: typeId, center: marina, radiusM: 2000 }),
    ).toMatchObject({ ok: false, code: "DISABLED" });
    expect(
      await importGooglePlaces({
        poiTypeId: typeId,
        places: [
          { googlePlaceId: "g-x", name: "X School", address: "", point: marina, website: null },
        ],
      }),
    ).toMatchObject({ ok: false, code: "DISABLED" });
  });

  it("explains that Google needs a key when none is configured", async () => {
    const typeId = await schoolType();
    const res = await searchGooglePlaces({ poiTypeId: typeId, center: marina, radiusM: 2000 });
    expect(res).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("needs a Google place type on the POI type", async () => {
    setMapsProvider(fake);
    const typeId = await schoolType(null);
    const res = await searchGooglePlaces({ poiTypeId: typeId, center: marina, radiusM: 2000 });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("searches, marks places already imported and imports the rest once", async () => {
    setMapsProvider(fake);
    const typeId = await schoolType();
    const first = await searchGooglePlaces({ poiTypeId: typeId, center: marina, radiusM: 2000 });
    expect(first.ok && first.data.map((r) => r.alreadyImported)).toEqual([false, false]);

    const imported = await importGooglePlaces({
      poiTypeId: typeId,
      places: first.ok ? first.data.slice(0, 1).map(({ alreadyImported: _a, ...p }) => p) : [],
    });
    expect(imported).toMatchObject({ ok: true, data: { imported: 1, skipped: 0 } });

    const second = await searchGooglePlaces({ poiTypeId: typeId, center: marina, radiusM: 2000 });
    expect(second.ok && second.data.map((r) => r.alreadyImported)).toEqual([true, false]);

    // Importing the same place again is skipped (unique google place id).
    const again = await importGooglePlaces({
      poiTypeId: typeId,
      places: second.ok ? second.data.map(({ alreadyImported: _a, ...p }) => p) : [],
    });
    expect(again).toMatchObject({ ok: true, data: { imported: 1, skipped: 1 } });
    const db = await getDb();
    expect(await db.select().from(pois)).toHaveLength(2);
  });

  it("saves by hand, filters and hides in bulk", async () => {
    const typeId = await schoolType();
    const created = await savePoi({
      id: null,
      data: {
        poiTypeId: typeId,
        name: "Marina Primary",
        address: "Al Marsa St",
        point: marina,
        googlePlaceId: null,
        website: "",
        ratingNote: "Ages 3-11",
        isActive: true,
      },
    });
    if (!created.ok) throw new Error(created.error);
    const params = parseTableParams(
      { q: "primary" },
      { sortable: ["name"] as const, defaultSort: { id: "name", desc: false } },
    );
    const listed = await listPois(params as never);
    expect(listed.total).toBe(1);
    expect(listed.rows[0]).toMatchObject({
      name: "Marina Primary",
      typeName: "Schools",
      point: marina,
    });

    await setPoisActive({ ids: [created.data.id], active: false });
    const db = await getDb();
    const [row] = await db.select().from(pois).where(eq(pois.id, created.data.id));
    expect(row!.isActive).toBe(false);
  });
});
