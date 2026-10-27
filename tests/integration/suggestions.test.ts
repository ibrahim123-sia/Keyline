import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { contacts, leads, viewings } from "@/db/schema/crm";
import { properties } from "@/db/schema/properties";
import { loadDashboardSuggestions, suggestionCounts } from "@/features/reports/suggestions";
import { loadReportContext } from "@/features/reports/context";
import { parsePeriodParams } from "@/features/reports/period";
import { newId } from "@/lib/ids";
import { evalWorldTables, seedEvalWorld, type EvalWorld } from "../ai/fixtures";
import { truncate } from "../helpers/db";

let world: EvalWorld;

describe("dashboard suggestions (10 §3 Suggest)", () => {
  beforeEach(async () => {
    await truncate(...evalWorldTables, "contacts", "leads", "viewings", "lead_events");
    const db = await getDb();
    world = await seedEvalWorld(db);
    // Three more Marina apartments at the sea-view flat's price per m² (AED 15,000).
    const [base] = await db
      .select({ propertyTypeId: properties.propertyTypeId, locationId: properties.locationId })
      .from(properties)
      .where(eq(properties.id, world.listings.marinaSeaView.id));
    for (const [i, size] of [100, 80, 150].entries())
      await db.insert(properties).values({
        reference: `KL-30${i}`,
        slug: `similar-${i}`,
        title: `Similar Marina apartment ${i}`,
        purpose: "sale",
        status: "available",
        currency: "AED",
        propertyTypeId: base!.propertyTypeId,
        locationId: base!.locationId,
        size,
        price: size * 1_500_000,
        isVerified: true,
        lastVerifiedAt: new Date(),
        seoTitle: "t",
        seoDescription: "d",
      });
  });

  it("counts what needs attention and links to where to act", async () => {
    const db = await getDb();
    const contactId = newId();
    await db.insert(contacts).values({ id: contactId, name: "Hot Lead" });
    await db.insert(leads).values({ contactId, source: "form", aiScore: 82 });
    const [warm] = await db
      .insert(leads)
      .values({ contactId, source: "form", aiScore: 85, type: "tenant" })
      .returning({ id: leads.id });
    // The second one already has a viewing.
    await db.insert(viewings).values({
      leadId: warm!.id,
      contactId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 88_200_000),
    });

    const counts = await suggestionCounts(db);
    expect(counts.hotNoViewing).toBe(1);
    // The penthouse is AED 20,000/m² against 15,000 for similar Marina apartments.
    expect(counts.overpriced).toEqual([
      expect.objectContaining({ id: world.listings.marinaPenthouse.id, pct: 33 }),
    ]);
    // The five live eval listings (the draft is not live) have no photos, SEO or check.
    expect(counts).toMatchObject({ toVerify: 5, noPhotos: 8, missingSeo: 5 });

    const ctx = await loadReportContext(db, parsePeriodParams({}));
    const cards = await loadDashboardSuggestions(db, ctx);
    expect(cards.map((c) => c.id)).toEqual([
      "hot-no-viewing",
      `overpriced-${world.listings.marinaPenthouse.id}`,
      "verify",
      "no-photos",
      "missing-seo",
    ]);
    expect(cards[0]).toMatchObject({
      title: "1 hot lead has no viewing yet",
      href: "/admin/leads?smin=70&status=open",
    });
    expect(cards[1]!.title).toBe(
      `${world.listings.marinaPenthouse.reference} is 33% above similar homes`,
    );
    expect(cards[2]!.href).toBe("/admin/properties?verifiedOlder=30");
  });
});
