import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { propertyTypes } from "@/db/schema/master-data";
import { properties, propertyFacilities } from "@/db/schema/properties";
import { auditLog, jobRuns } from "@/db/schema/system";
import { autoMap } from "@/features/properties/csv";
import { importPropertyRows } from "@/features/properties/import-actions";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";
import { importWorld } from "../helpers/listings";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const headers = [
  "title",
  "purpose",
  "property_type",
  "location",
  "price",
  "beds",
  "size_sqft",
  "facilities",
  "agent",
  "photo_urls",
];

describe("CSV import", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "property_facilities",
      "property_badges",
      "job_runs",
      "agents",
      "locations",
      "property_types",
      "facilities",
      "badges",
      "audit_log",
      "settings",
    );
  });

  it("creates drafts with references, matched records, stored units and photo jobs", async () => {
    const { db, ids } = await importWorld();
    const columns = autoMap(headers, "sqft");
    const res = await importPropertyRows({
      columns,
      rows: [
        {
          line: 2,
          cells: [
            "Marina view",
            "sale",
            "Apartment",
            "Dubai Marina",
            "2,450,000",
            "2",
            "1200",
            "Pool | Gym",
            "Sara Khan",
            "https://cdn.example/a.jpg | https://cdn.example/b.jpg",
          ],
        },
        { line: 3, cells: ["Bad type", "sale", "Castle", "", "", "", "", "", "", ""] },
        {
          line: 4,
          cells: [
            "Studio to let",
            "rent",
            "apartments",
            "dubai",
            "85000",
            "studio",
            "",
            "",
            "",
            "",
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    const results = res.ok ? res.data.results : [];
    expect(results.map((r) => [r.line, r.ok])).toEqual([
      [2, true],
      [3, false],
      [4, true],
    ]);
    expect(results[1]).toEqual({
      line: 3,
      ok: false,
      errors: ["Property type “Castle” is not set up (Setup -> Property types)."],
    });

    const rows = await db.select().from(properties).orderBy(asc(properties.createdAt));
    expect(rows).toHaveLength(2);
    const [a, b] = rows;
    expect(a).toMatchObject({
      title: "Marina view",
      slug: "marina-view",
      status: "draft",
      source: "import",
      purpose: "sale",
      propertyTypeId: ids.apt,
      locationId: ids.marina,
      agentId: ids.agent,
      price: 245_000_000,
      currency: "AED",
      beds: 2,
      publishedAt: null,
      searchText: "Dubai Marina Dubai Apartment",
    });
    expect(a!.reference).toMatch(/^LT-\d+$/);
    expect(a!.size).toBeCloseTo(111.48, 2);
    expect(b).toMatchObject({
      purpose: "rent",
      pricePeriod: "year",
      beds: 0,
      locationId: ids.city,
    });
    expect(results[0]).toMatchObject({ ok: true, reference: a!.reference, photos: 2 });

    const links = await db
      .select()
      .from(propertyFacilities)
      .where(eq(propertyFacilities.propertyId, a!.id));
    expect(links.map((l) => l.facilityId).sort()).toEqual([ids.pool, ids.gym].sort());

    const jobs = await db.select().from(jobRuns).where(eq(jobRuns.name, "media.fetch_url"));
    expect(
      jobs.map((j) => j.payload).sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder)),
    ).toEqual([
      { propertyId: a!.id, url: "https://cdn.example/a.jpg", sortOrder: 0, userId: testAdmin.id },
      { propertyId: a!.id, url: "https://cdn.example/b.jpg", sortOrder: 1, userId: testAdmin.id },
    ]);

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "property.create"), eq(auditLog.entityId, a!.id)));
    expect(audit[0]!.after).toMatchObject({ source: "import", line: 2, photos: 2 });
  });

  it("checks the columns and the batch size on the server too", async () => {
    await importWorld();
    expect(
      await importPropertyRows({ columns: ["title"], rows: [{ line: 2, cells: ["x"] }] }),
    ).toMatchObject({ ok: false, code: "MAPPING", error: "Choose the column for “Purpose”." });
    const many = Array.from({ length: 51 }, (_, i) => ({
      line: i + 2,
      cells: ["sale", "Apartment"],
    }));
    expect(
      await importPropertyRows({ columns: ["purpose", "property_type"], rows: many }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(
      await importPropertyRows({
        columns: ["reference" as never, "purpose"],
        rows: [{ line: 2, cells: ["LT-1", "sale"] }],
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("read-only admins cannot import", async () => {
    await importWorld();
    adminState.user = { ...testAdmin, readOnly: true };
    expect(
      await importPropertyRows({
        columns: ["purpose", "property_type"],
        rows: [{ line: 2, cells: ["sale", "Apartment"] }],
      }),
    ).toMatchObject({ ok: false, code: "READ_ONLY" });
  });

  it("matches master data again on the server (the browser's preview may be stale)", async () => {
    const { db, ids } = await importWorld();
    // The type was renamed after the page was opened: the row now fails on the server.
    await db
      .update(propertyTypes)
      .set({ name: "Flat", slug: "flats" })
      .where(eq(propertyTypes.id, ids.apt));
    const res = await importPropertyRows({
      columns: ["purpose", "property_type"],
      rows: [{ line: 2, cells: ["sale", "Apartment"] }],
    });
    expect(res.ok && res.data.results[0]).toEqual({
      line: 2,
      ok: false,
      errors: ["Property type “Apartment” is not set up (Setup -> Property types)."],
    });
  });
});
