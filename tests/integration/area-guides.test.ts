import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { areaGuideMedia, areaGuides, faqs } from "@/db/schema/content";
import { locations, poiTypes, pois } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties } from "@/db/schema/properties";
import { seoRedirects } from "@/db/schema/seo";
import {
  createGuide,
  deleteGuide,
  saveGuide,
  setGuidePublishing,
} from "@/features/area-guides/actions";
import { loadGuide } from "@/features/area-guides/load";
import { getPublicGuide, guideForLocation, listPublicGuides } from "@/features/area-guides/public";
import type { GuideInput } from "@/features/area-guides/schema";
import { deleteLocation } from "@/features/locations/actions";
import { mediaUsage } from "@/features/media/usage";
import { landingFor } from "@/features/search/page-data";
import { loadSettings } from "@/features/settings/queries";
import { newId } from "@/lib/ids";
import type { RichDoc } from "@/lib/rich-text";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const ids = { city: newId(), marina: newId(), photo: newId(), school: newId() };
const answer = (text: string): RichDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const body = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Life by the water." }],
    },
  ],
};

let n = 0;
async function listing(values: Partial<typeof properties.$inferInsert>) {
  const db = await getDb();
  const market = await loadSettings("market", db);
  n++;
  await db.insert(properties).values({
    reference: `AG-${100 + n}`,
    title: `Home ${n}`,
    slug: `home-${n}-${newId().slice(-6)}`,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    currency: market.baseCurrency.code,
    locationId: ids.marina,
    ...values,
  });
}

async function newGuide() {
  const res = await createGuide({ locationId: ids.marina });
  if (!res.ok) throw new Error(res.error);
  const db = await getDb();
  const loaded = (await loadGuide(db, res.data.id))!;
  return { id: res.data.id, input: loaded.input, version: loaded.row.updatedAt.toISOString() };
}

const filled = (input: GuideInput): GuideInput => ({
  ...input,
  intro: "Towers, a long promenade and the beach.",
  body,
  coverId: ids.photo,
  gallery: [{ mediaId: ids.photo, caption: "The promenade", alt: null }],
  highlights: ["Beach within a walk"],
  stats: [{ label: "Metro stations", value: "2", source: "Transport authority map, 2026" }],
  faqs: [
    {
      id: newId(),
      question: "Is it good for families?",
      answer: answer("Yes, with two schools."),
      isPublished: true,
    },
    { id: newId(), question: "Hidden one", answer: answer("Not shown."), isPublished: false },
  ],
});

describe("area guides", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "faqs",
      "area_guide_media",
      "area_guides",
      "properties",
      "pois",
      "poi_types",
      "locations",
      "media",
      "seo_redirects",
      "audit_log",
    );
    const db = await getDb();
    await db.insert(locations).values([
      { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
      {
        id: ids.marina,
        parentId: ids.city,
        level: "area",
        name: "Dubai Marina",
        slug: "dubai-marina",
        center: { lng: 55.14, lat: 25.08 },
        description: "The location's own text.",
      },
    ]);
    await db.insert(media).values({
      id: ids.photo,
      r2Key: "2026/10/guidephoto/marina.jpg",
      fileName: "marina.jpg",
      mime: "image/jpeg",
      status: "ready",
      width: 1600,
      height: 900,
      alt: "Marina at dusk",
    });
    const [type] = await db
      .insert(poiTypes)
      .values({ name: "School" })
      .returning({ id: poiTypes.id });
    await db.insert(pois).values([
      {
        id: ids.school,
        poiTypeId: type!.id,
        name: "Marina School",
        point: { lng: 55.141, lat: 25.081 },
      },
      { poiTypeId: type!.id, name: "Far School", point: { lng: 55.4, lat: 25.3 } },
    ]);
  });

  it("creates one guide per area and saves photos, numbers and its own questions", async () => {
    const db = await getDb();
    const guide = await newGuide();
    expect(guide.input).toMatchObject({ title: "Dubai Marina", locationId: ids.marina });
    const twice = await createGuide({ locationId: ids.marina });
    expect(!twice.ok && twice.fieldErrors?.locationId).toEqual(["This area already has a guide."]);

    const data = filled(guide.input);
    const saved = await saveGuide({ id: guide.id, data, expectedUpdatedAt: guide.version });
    if (!saved.ok) throw new Error(`${saved.error} ${JSON.stringify(saved.fieldErrors)}`);
    const questions = await db.select().from(faqs).orderBy(asc(faqs.sortOrder));
    expect(questions.map((q) => [q.question, q.areaGuideId, q.answerHtml])).toEqual([
      ["Is it good for families?", guide.id, "<p>Yes, with two schools.</p>"],
      ["Hidden one", guide.id, "<p>Not shown.</p>"],
    ]);
    expect(await db.select().from(areaGuideMedia)).toHaveLength(1);
    const uses = (await mediaUsage(db, [ids.photo])).get(ids.photo)!;
    expect(uses.map((u) => u.label)).toEqual([
      "Area guide Dubai Marina: cover",
      "Area guide Dubai Marina: photo",
    ]);

    // Removing a question deletes it; the other keeps its id.
    const again = await saveGuide({
      id: guide.id,
      data: { ...data, faqs: [data.faqs[0]!] },
      expectedUpdatedAt: saved.data.updatedAt,
    });
    expect(again.ok).toBe(true);
    expect((await db.select({ id: faqs.id }).from(faqs)).map((q) => q.id)).toEqual([
      data.faqs[0]!.id,
    ]);

    // A number needs its source.
    const noSource = await saveGuide({
      id: guide.id,
      data: { ...data, stats: [{ label: "Schools", value: "4", source: "" }] },
      expectedUpdatedAt: again.ok ? again.data.updatedAt : "",
    });
    expect(!noSource.ok && noSource.fieldErrors?.["stats.0.source"]).toEqual([
      "Say where the number comes from",
    ]);
  });

  it("publishes with an intro and text, then shows live numbers, places and questions", async () => {
    const db = await getDb();
    const guide = await newGuide();
    const empty = await setGuidePublishing({ action: "publish", id: guide.id });
    expect(!empty.ok && Object.keys(empty.fieldErrors ?? {}).sort()).toEqual(["body", "intro"]);

    const saved = await saveGuide({
      id: guide.id,
      data: filled(guide.input),
      expectedUpdatedAt: guide.version,
    });
    if (!saved.ok) throw new Error(saved.error);
    expect((await setGuidePublishing({ action: "publish", id: guide.id })).ok).toBe(true);

    // 3 homes for sale at 10,000 a m² (in minor units), 1 to rent, 1 draft that does not count.
    for (const size of [100, 120, 150]) await listing({ price: size * 1_000_000, size });
    await listing({ purpose: "rent", price: 9_000_000, size: 80 });
    await listing({ status: "draft", publishedAt: null });

    const g = (await getPublicGuide("dubai-marina"))!;
    expect(g).toMatchObject({
      title: "Dubai Marina",
      counts: { sale: 3, rent: 1 },
      average: { perSqm: 1_000_000, listings: 3 },
      highlights: ["Beach within a walk"],
      stats: [{ label: "Metro stations", value: "2", source: "Transport authority map, 2026" }],
      location: { name: "Dubai Marina", parentName: "Dubai", center: { lng: 55.14, lat: 25.08 } },
    });
    expect(g.faqs.map((f) => f.question)).toEqual(["Is it good for families?"]);
    expect(g.places.map((p) => p.name)).toEqual(["Marina School"]);
    expect(g.gallery).toMatchObject([{ caption: "The promenade", alt: "Marina at dusk" }]);
    expect(g.forSale).toHaveLength(3);
    expect(g.toRent).toHaveLength(1);
    expect((await listPublicGuides()).map((c) => [c.title, c.counts])).toEqual([
      ["Dubai Marina", { sale: 3, rent: 1 }],
    ]);

    // The area's search pages open with the guide's intro and show its questions.
    const landing = (await landingFor("dubai-marina", null))!;
    expect(landing.guide).toMatchObject({
      slug: "dubai-marina",
      intro: "Towers, a long promenade and the beach.",
      faqs: [{ question: "Is it good for families?" }],
    });
    expect(await guideForLocation(ids.city)).toBeNull();

    // A new slug after publishing keeps the old address (301).
    const renamed = await saveGuide({
      id: guide.id,
      data: { ...filled(guide.input), slug: "marina" },
      expectedUpdatedAt: (await loadGuide(db, guide.id))!.row.updatedAt.toISOString(),
    });
    expect(renamed.ok && renamed.data.slug).toBe("marina");
    expect(await db.select().from(seoRedirects)).toMatchObject([
      { fromPath: "/areas/dubai-marina", toPath: "/areas/marina" },
    ]);
  });

  it("keeps the area while it has a guide, and deletes a draft guide with its questions", async () => {
    const db = await getDb();
    const guide = await newGuide();
    await saveGuide({ id: guide.id, data: filled(guide.input), expectedUpdatedAt: guide.version });

    const blocked = await deleteLocation({ id: ids.marina });
    expect(!blocked.ok && blocked.error).toMatch(/its area guide/);

    await setGuidePublishing({ action: "publish", id: guide.id });
    const live = await deleteGuide({ id: guide.id });
    expect(!live.ok && live.code).toBe("PUBLISHED");
    await setGuidePublishing({ action: "unpublish", id: guide.id });
    expect((await deleteGuide({ id: guide.id })).ok).toBe(true);
    expect(await db.select().from(areaGuides)).toEqual([]);
    expect(await db.select().from(faqs)).toEqual([]);
    const [file] = await db.select().from(media).where(eq(media.id, ids.photo));
    expect(file!.usedCount).toBe(0);
    expect((await deleteLocation({ id: ids.marina })).ok).toBe(true);
  });
});
