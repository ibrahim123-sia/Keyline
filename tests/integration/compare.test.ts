import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { facilities, locations, poiTypes, pois } from "@/db/schema/master-data";
import { projects, projectUnitTypes } from "@/db/schema/projects";
import { properties, propertyFacilities, propertyPois } from "@/db/schema/properties";
import { emailLog } from "@/db/schema/system";
import { compareIds, toggleCompare } from "@/features/account/store";
import { sendComparison } from "@/features/compare/actions";
import { compareItems } from "@/features/compare/load";
import { newId } from "@/lib/ids";
import { adminState } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

describe("compare page data (11 §3)", () => {
  beforeEach(async () => {
    adminState.user = null;
    await truncate(
      "compare_sets",
      "property_pois",
      "property_facilities",
      "properties",
      "project_unit_types",
      "projects",
      "pois",
      "poi_types",
      "facilities",
      "locations",
      "email_log",
      "job_runs",
      "rate_limits",
      "settings",
    );
  });

  it("compares listings and project unit types, in the order picked, public ones only", async () => {
    const db = await getDb();
    const area = newId();
    await db.insert(locations).values({ id: area, level: "area", name: "Marina", slug: "marina" });
    const home = newId();
    const draft = newId();
    await db.insert(properties).values([
      {
        id: home,
        reference: "CP-1",
        title: "Bay flat",
        slug: "bay-flat",
        purpose: "sale",
        status: "available",
        publishedAt: new Date(),
        currency: "AED",
        price: 200_000_000,
        size: 100,
        beds: 2,
        expectedRentYearly: 13_000_000,
        locationId: area,
        isVerified: true,
        lastVerifiedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        id: draft,
        reference: "CP-2",
        title: "Draft",
        slug: "draft",
        purpose: "sale",
        status: "draft",
      },
    ]);
    const pool = newId();
    await db.insert(facilities).values({ id: pool, name: "Pool" });
    await db.insert(propertyFacilities).values({ propertyId: home, facilityId: pool });
    const school = newId();
    const poi = newId();
    await db.insert(poiTypes).values({ id: school, name: "School", category: "schools" });
    await db
      .insert(pois)
      .values({ id: poi, poiTypeId: school, name: "Bay School", point: { lng: 55, lat: 25 } });
    await db
      .insert(propertyPois)
      .values({ propertyId: home, poiId: poi, straightDistanceM: 700, driveSeconds: 180 });
    const project = newId();
    const unit = newId();
    await db.insert(projects).values({
      id: project,
      name: "Crest",
      slug: "crest",
      currency: "AED",
      handoverText: "Q2 2028",
      locationId: area,
      isPublished: true,
    });
    await db.insert(projectUnitTypes).values({
      id: unit,
      projectId: project,
      name: "1 bed A",
      beds: 1,
      sizeMin: 70,
      sizeMax: 80,
      priceFrom: 150_000_000,
    });

    const owner = { visitorKey: "visitor-compare-1" };
    await toggleCompare(db, owner, unit);
    await toggleCompare(db, owner, home);
    await expect(toggleCompare(db, owner, draft)).rejects.toThrow();
    expect(await compareIds(db, owner)).toEqual([unit, home]);

    const items = await compareItems([unit, draft, home]);
    expect(items.map((i) => i.id)).toEqual([unit, home]);
    expect(items[0]).toMatchObject({
      kind: "unit",
      title: "1 bed A",
      subtitle: "Crest",
      price: 150_000_000,
      priceFrom: true,
      completion: "off_plan",
      handover: "Q2 2028",
      sizeMin: 70,
      sizeMax: 80,
      href: "/projects/crest#units",
    });
    expect(items[1]).toMatchObject({
      kind: "property",
      href: "/property/bay-flat",
      expectedYield: 6.5,
      facilities: ["Pool"],
      areaName: "Marina",
      verifiedAt: "2026-10-01T00:00:00.000Z",
      nearest: { school: { name: "Bay School", distanceM: 700, seconds: 180, mode: "drive" } },
    });

    // "Send to my email" for a guest: the share link by email.
    const res = await sendComparison({ ids: [unit, home], email: "Guest@Example.com" });
    if (!res.ok) throw new Error(res.error);
    const [mail] = await db.select().from(emailLog).where(eq(emailLog.template, "compare.sent"));
    expect(mail).toMatchObject({ to: "guest@example.com", subject: "Your comparison: 2 homes" });
    expect(mail!.html).toContain(`/tools/compare?ids=${unit},${home}`);
    expect(mail!.text).toContain("Crest · 1 bed A");
    expect(await sendComparison({ ids: [unit], email: "" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
  });
});
