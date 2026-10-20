import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as exportCsv } from "@/app/api/admin/properties/export/route";
import { media } from "@/db/schema/media";
import { properties, propertyMedia } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { autoMap, checkRow } from "@/features/properties/csv";
import { importPropertyRows } from "@/features/properties/import-actions";
import { loadImportContext } from "@/features/properties/import";
import { parseCsv } from "@/lib/csv";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";
import { importWorld } from "../helpers/listings";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const get = (query = "") =>
  exportCsv(new Request(`http://localhost/api/admin/properties/export${query}`));

async function table(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Response.text() would drop the BOM, so look at the bytes.
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder().decode(bytes);
  const [header, ...rows] = parseCsv(text);
  return {
    text,
    rows: rows.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ""]))),
    header: header!,
    bom,
  };
}

describe("CSV export", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "property_facilities",
      "property_media",
      "property_badges",
      "media",
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

  async function listings() {
    const { db } = await importWorld();
    const res = await importPropertyRows({
      columns: autoMap(
        [
          "title",
          "purpose",
          "property_type",
          "location",
          "price",
          "size_sqft",
          "facilities",
          "description",
          "view",
        ],
        "sqft",
      ),
      rows: [
        {
          line: 2,
          cells: [
            "Marina view",
            "sale",
            "Apartment",
            "Dubai Marina",
            "2450000.5",
            "1200",
            "Pool | Gym",
            "Bright, quiet.\n\nNear the metro.",
            "Sea | Marina",
          ],
        },
        {
          line: 3,
          cells: ["=Studio to let", "rent", "Apartment", "Dubai", "85000", "", "", "", ""],
        },
      ],
    });
    if (!res.ok) throw new Error(res.error);
    const [sale, rent] = res.data.results.map((r) => (r.ok ? r.id : ""));
    const photo = newId();
    await db.insert(media).values({
      id: photo,
      r2Key: "2026/10/abcdefghij/living.jpg",
      fileName: "living.jpg",
      mime: "image/jpeg",
      status: "ready",
    });
    await db
      .insert(propertyMedia)
      .values({ propertyId: sale!, mediaId: photo, kind: "photo", isCover: true });
    await db
      .update(properties)
      .set({ status: "available", publishedAt: new Date("2026-10-01T09:00:00Z") })
      .where(eq(properties.id, sale!));
    return { db, sale: sale!, rent: rent! };
  }

  it("exports the filtered list in the market's units with absolute links", async () => {
    const { db } = await listings();
    const res = await get("?purpose=sale");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="properties-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const { bom, rows, header } = await table(res);
    expect(bom).toBe(true);
    expect(header.slice(0, 4)).toEqual(["reference", "status", "title", "purpose"]);
    expect(header).toContain("size_sqft");
    expect(header).not.toContain("size_sqm");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "available",
      title: "Marina view",
      purpose: "sale",
      completion: "ready",
      property_type: "Apartment",
      location: "Dubai Marina",
      price: "2450000.5",
      currency: "AED",
      size_sqft: "1200",
      facilities: "Gym | Pool",
      view: "Sea | Marina",
      description: "Bright, quiet.\n\nNear the metro.",
      photo_urls: "http://localhost/media/2026/10/abcdefghij/living.jpg",
      published_at: "2026-10-01",
      url: "http://localhost/property/marina-view",
      price_on_request: "no",
    });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "property.export"));
    expect(entry!.after).toEqual({ count: 1, filters: { purpose: "sale" } });
  });

  it("exports selected rows, guards formulas, and leaves drafts without a page link", async () => {
    const { rent } = await listings();
    const { rows, text } = await table(await get(`?ids=${rent},not-an-id`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "=Studio to let", rent_period: "year", url: "" });
    expect(text).toContain("'=Studio to let");
  });

  it("can be imported again as it is", async () => {
    const { db } = await listings();
    const { header, text } = await table(await get());
    const [, ...cells] = parseCsv(text);
    const ctx = await loadImportContext(db);
    const columns = autoMap(header, "sqft");
    expect(columns.filter(Boolean)).toHaveLength(header.length - 4); // not reference, status, published, url
    for (const row of cells) expect(checkRow(row, columns, ctx).errors).toEqual([]);
  });

  it("needs a signed-in admin; read-only admins may export", async () => {
    await listings();
    adminState.user = null;
    expect((await get()).status).toBe(401);
    adminState.user = { ...testAdmin, readOnly: true };
    expect((await get()).status).toBe(200);
  });
});
