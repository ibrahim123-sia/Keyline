import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { badges, locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties, propertyBadges, propertyMedia } from "@/db/schema/properties";
import { writePlan } from "@/features/payment-plans/store";
import { builtInTemplates, planFromTemplate } from "@/features/payment-plans/templates";
import {
  bulkUpdateProperties,
  createProperty,
  duplicateProperty,
} from "@/features/properties/actions";
import { loadProperty } from "@/features/properties/load";
import { listProperties, propertySortable } from "@/features/properties/queries";
import { deleteView, saveView } from "@/features/saved-views/actions";
import { listSavedViews } from "@/features/saved-views/queries";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const list = (sp: Record<string, string> = {}) =>
  listProperties(
    parseTableParams(sp, {
      sortable: propertySortable,
      defaultSort: { id: "updated", desc: true },
    }),
  );

async function world() {
  const db = await getDb();
  const ids = {
    type: newId(),
    city: newId(),
    marina: newId(),
    agent: newId(),
    photo: newId(),
    newBadge: newId(),
    hot: newId(),
  };
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Coastal City", slug: "coastal-city" },
    { id: ids.marina, parentId: ids.city, level: "area", name: "Marina", slug: "marina" },
  ]);
  await db.insert(agents).values({ id: ids.agent, name: "Sara", slug: "sara" });
  await db.insert(media).values({
    id: ids.photo,
    r2Key: "2026/10/abcdefghij/living.jpg",
    fileName: "living.jpg",
    mime: "image/jpeg",
    status: "ready",
    alt: "Bright living room",
  });
  await db.insert(badges).values([
    { id: ids.newBadge, name: "New", autoRule: "new_listing", autoDays: 14 },
    { id: ids.hot, name: "Hot deal" },
  ]);
  return { db, ids };
}

/** A listing that passes the publish rules (07 §3). */
async function completeListing(ids: Awaited<ReturnType<typeof world>>["ids"], title: string) {
  const res = await createProperty({
    purpose: "sale",
    completion: "ready",
    propertyTypeId: ids.type,
    title,
  });
  if (!res.ok) throw new Error(res.error);
  const db = await getDb();
  await db
    .update(properties)
    .set({
      locationId: ids.marina,
      point: { lng: 55.14, lat: 25.08 },
      price: 210_000_000,
      beds: 2,
      baths: 2,
      size: 120,
      agentId: ids.agent,
    })
    .where(eq(properties.id, res.data.id));
  await db
    .insert(propertyMedia)
    .values({ propertyId: res.data.id, mediaId: ids.photo, kind: "photo", isCover: true });
  return res.data;
}

describe("property list", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "property_media",
      "property_badges",
      "property_facilities",
      "payment_plans",
      "price_history",
      "saved_views",
      "badges",
      "media",
      "agents",
      "locations",
      "property_types",
      "audit_log",
      "settings",
    );
  });

  it("creates drafts with a reference, a slug and the market's currency", async () => {
    const { ids } = await world();
    const sale = await createProperty({
      purpose: "sale",
      completion: "off_plan",
      propertyTypeId: ids.type,
      title: "Marina view apartment",
    });
    const rent = await createProperty({
      purpose: "rent",
      completion: "ready",
      propertyTypeId: ids.type,
      title: "",
    });
    expect(sale.ok && rent.ok).toBe(true);
    const db = await getDb();
    const [a] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, sale.ok ? sale.data.id : ""));
    const [b] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, rent.ok ? rent.data.id : ""));
    expect(a).toMatchObject({
      status: "draft",
      slug: "marina-view-apartment",
      currency: "USD",
      pricePeriod: null,
      completion: "off_plan",
    });
    expect(a!.reference).toMatch(/^LT-\d+$/);
    expect(b).toMatchObject({ pricePeriod: "month", slug: b!.reference.toLowerCase() });
    expect(
      await createProperty({
        purpose: "sale",
        completion: "ready",
        propertyTypeId: newId(),
        title: "",
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { propertyTypeId: ["This property type no longer exists."] },
    });
  });

  it("filters by purpose, status, area (with what is under it), photos, SEO and search", async () => {
    const { ids } = await world();
    const full = await completeListing(ids, "Penthouse with terrace");
    const draft = await createProperty({
      purpose: "rent",
      completion: "ready",
      propertyTypeId: ids.type,
      title: "Studio near the beach",
    });
    const draftId = draft.ok ? draft.data.id : "";
    const refs = async (sp: Record<string, string>) => (await list(sp)).rows.map((r) => r.id);

    expect((await list()).total).toBe(2);
    expect(await refs({ purpose: "rent" })).toEqual([draftId]);
    expect(await refs({ area: ids.city })).toEqual([full.id]);
    expect(await refs({ noPhotos: "1" })).toEqual([draftId]);
    expect((await refs({ missingSeo: "1" })).sort()).toEqual([full.id, draftId].sort());
    expect(await refs({ q: full.reference })).toEqual([full.id]);
    expect(await refs({ q: "penthous" })).toEqual([full.id]);
    expect(await refs({ verifiedOlder: "30" })).toHaveLength(2);
    const [row] = (await list({ q: full.reference })).rows;
    expect(row).toMatchObject({
      locationName: "Marina",
      agentName: "Sara",
      typeName: "Apartment",
      coverUrl: "/media/2026/10/abcdefghij/living.jpg",
      verifiedDays: null,
    });
  });

  it("publishing in bulk checks the rules and adds the New badge", async () => {
    const { db, ids } = await world();
    const full = await completeListing(ids, "Garden villa");
    const empty = await createProperty({
      purpose: "sale",
      completion: "ready",
      propertyTypeId: ids.type,
      title: "",
    });
    const emptyId = empty.ok ? empty.data.id : "";
    const res = await bulkUpdateProperties({
      ids: [full.id, emptyId],
      action: { type: "status", status: "available" },
    });
    expect(res.ok).toBe(true);
    const data = res.ok ? res.data : { updated: 0, skipped: [] };
    expect(data.updated).toBe(1);
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped[0]!.reason).toContain("Add a title.");
    expect(data.skipped[0]!.reason).toContain("Drop the pin on the map.");

    const [live] = await db.select().from(properties).where(eq(properties.id, full.id));
    expect(live).toMatchObject({ status: "available", originalPrice: 210_000_000 });
    expect(live!.publishedAt).toBeInstanceOf(Date);
    const [badge] = await db
      .select()
      .from(propertyBadges)
      .where(eq(propertyBadges.propertyId, full.id));
    expect(badge).toMatchObject({ badgeId: ids.newBadge, isAuto: true });
    expect(badge!.reason).toMatch(/^Published /);

    // Back to draft: the New badge goes, published_at stays (the first publish date).
    await bulkUpdateProperties({ ids: [full.id], action: { type: "status", status: "draft" } });
    expect(
      await db.select().from(propertyBadges).where(eq(propertyBadges.propertyId, full.id)),
    ).toEqual([]);
    const [again] = await db.select().from(properties).where(eq(properties.id, full.id));
    expect(again!.publishedAt).toEqual(live!.publishedAt);
  });

  it("verifies, features, assigns, badges, archives and restores", async () => {
    const { db, ids } = await world();
    const a = await completeListing(ids, "Loft one");
    const b = await completeListing(ids, "Loft two");
    const both = [a.id, b.id];
    expect(await bulkUpdateProperties({ ids: both, action: { type: "verify" } })).toMatchObject({
      ok: true,
      data: { updated: 2 },
    });
    expect((await list({ verifiedOlder: "30" })).total).toBe(0);
    await bulkUpdateProperties({ ids: both, action: { type: "feature", featured: true } });
    expect((await list({ featured: "1" })).total).toBe(2);
    await bulkUpdateProperties({ ids: [a.id], action: { type: "agent", agentId: null } });
    expect((await list({ agent: "none" })).rows.map((r) => r.id)).toEqual([a.id]);

    await bulkUpdateProperties({
      ids: both,
      action: { type: "badge", badgeId: ids.hot, add: true },
    });
    expect(
      await db.select().from(propertyBadges).where(eq(propertyBadges.badgeId, ids.hot)),
    ).toHaveLength(2);
    expect(
      await bulkUpdateProperties({
        ids: both,
        action: { type: "badge", badgeId: ids.newBadge, add: true },
      }),
    ).toMatchObject({ ok: false, code: "AUTO_BADGE" });

    await bulkUpdateProperties({ ids: [b.id], action: { type: "archive" } });
    expect((await list()).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await list({ archived: "1" })).rows.map((r) => r.id)).toEqual([b.id]);
    const skipped = await bulkUpdateProperties({ ids: [b.id], action: { type: "verify" } });
    expect(skipped.ok && skipped.data.skipped[0]!.reason).toBe("Archived");
    await bulkUpdateProperties({ ids: [b.id], action: { type: "restore" } });
    expect((await list()).total).toBe(2);

    adminState.user = { ...testAdmin, readOnly: true };
    expect(await bulkUpdateProperties({ ids: both, action: { type: "verify" } })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("duplicates a listing as a new draft with its photos and its own plan", async () => {
    const { db, ids } = await world();
    const source = await completeListing(ids, "Canal apartment");
    const planId = await db.transaction((tx) =>
      writePlan(tx, {
        id: null,
        input: planFromTemplate(builtInTemplates[1]!),
        isTemplate: false,
        actor: { type: "admin", id: testAdmin.id },
        userId: null,
      }),
    );
    await db.update(properties).set({ paymentPlanId: planId }).where(eq(properties.id, source.id));
    await bulkUpdateProperties({
      ids: [source.id],
      action: { type: "status", status: "available" },
    });

    const res = await duplicateProperty({ id: source.id });
    expect(res.ok).toBe(true);
    const copy = await loadProperty(db, res.ok ? res.data.id : "");
    expect(copy!.row).toMatchObject({
      title: "Canal apartment (copy)",
      slug: "canal-apartment-copy",
      status: "draft",
      publishedAt: null,
      price: 210_000_000,
    });
    expect(copy!.row.reference).not.toBe(source.reference);
    expect(copy!.row.paymentPlanId).not.toBe(planId);
    expect(copy!.input.paymentPlan!.steps.map((s) => s.percent)).toEqual([20, 40, 40]);
    expect(copy!.input.media).toEqual([
      { mediaId: ids.photo, kind: "photo", isCover: true, caption: "", alt: "" },
    ]);
  });

  it("saves views for the team, replacing one with the same name", async () => {
    const first = await saveView({
      tableId: "properties",
      name: "Marina drafts",
      query: "status=draft&page=3",
    });
    expect(first).toMatchObject({ ok: true, data: { query: "status=draft" } });
    await saveView({
      tableId: "properties",
      name: "Marina drafts",
      query: "status=draft&purpose=rent",
    });
    const views = await listSavedViews("properties");
    expect(views.map((v) => [v.name, v.query])).toEqual([
      ["Marina drafts", "purpose=rent&status=draft"],
    ]);
    expect(await saveView({ tableId: "properties", name: "Empty", query: "page=2" })).toMatchObject(
      {
        ok: false,
      },
    );
    expect(await deleteView({ id: views[0]!.id })).toMatchObject({ ok: true });
    expect(await listSavedViews("properties")).toEqual([]);
  });
});
