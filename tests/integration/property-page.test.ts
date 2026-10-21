import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agents } from "@/db/schema/people";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { paymentPlanSteps, paymentPlans } from "@/db/schema/payment-plans";
import { projects } from "@/db/schema/projects";
import { properties, propertyMedia } from "@/db/schema/properties";
import { seoRedirects } from "@/db/schema/seo";
import { emailLog } from "@/db/schema/system";
import { sendListingInquiry } from "@/features/inquiries/actions";
import { publicCards } from "@/features/listings/public-cards";
import { getPublicListing, listingRedirect } from "@/features/listings/public";
import { similarListings } from "@/features/listings/similar";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { setTurnstileVerifier } from "@/lib/turnstile";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
let n = 0;

async function world() {
  const db = await getDb();
  await patchSettings(
    db,
    "market",
    {
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      phoneCountryCode: "+971",
    },
    actor,
  );
  await patchSettings(
    db,
    "contact",
    { email: "hello@agency.example", leadNotifyEmails: [] },
    actor,
  );
  const ids = {
    type: newId(),
    city: newId(),
    area: newId(),
    tower: newId(),
    other: newId(),
    agent: newId(),
    project: newId(),
    plan: newId(),
    photo: newId(),
  };
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
    { id: ids.area, parentId: ids.city, level: "area", name: "Dubai Marina", slug: "dubai-marina" },
    {
      id: ids.tower,
      parentId: ids.area,
      level: "building",
      name: "Marina Gate",
      slug: "marina-gate",
    },
    { id: ids.other, parentId: ids.city, level: "area", name: "Downtown", slug: "downtown" },
  ]);
  await db.insert(agents).values({
    id: ids.agent,
    name: "Layla Haddad",
    slug: "layla",
    email: "layla@agency.example",
    whatsapp: "+971501112233",
    languages: ["English", "Arabic"],
  });
  await db.insert(media).values({
    id: ids.photo,
    r2Key: "2026/10/pageaaaaaa/living.jpg",
    fileName: "living.jpg",
    mime: "image/jpeg",
    status: "ready",
    alt: "Living room",
  });
  await db.insert(paymentPlans).values({ id: ids.plan, name: "60/40" });
  await db.insert(paymentPlanSteps).values([
    { paymentPlanId: ids.plan, stage: "booking", label: "Down payment", percent: 60 },
    { paymentPlanId: ids.plan, stage: "handover", label: "On handover", percent: 40 },
  ]);
  await db.insert(projects).values({
    id: ids.project,
    name: "Marina Crest",
    slug: "marina-crest",
    locationId: ids.area,
    paymentPlanId: ids.plan,
    isPublished: true,
  });
  return { db, ids };
}

type Listing = Partial<typeof properties.$inferInsert>;
async function listing(db: Awaited<ReturnType<typeof getDb>>, values: Listing) {
  const id = newId();
  n++;
  await db.insert(properties).values({
    id,
    reference: `HD-${7000 + n}`,
    title: `Listing ${n}`,
    slug: `listing-${n}-${id.slice(-6)}`,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    currency: "AED",
    ...values,
  });
  return id;
}

describe("public property page", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    setTurnstileVerifier(async (token) => token === "good-token");
    await truncate(
      "properties",
      "property_media",
      "projects",
      "payment_plans",
      "payment_plan_steps",
      "media",
      "agents",
      "locations",
      "property_types",
      "seo_redirects",
      "email_log",
      "job_runs",
      "rate_limits",
      "settings",
      "audit_log",
    );
  });
  afterEach(() => setTurnstileVerifier(null));

  it("shows live listings only, never the unit number or a private exact pin", async () => {
    const { db, ids } = await world();
    const exactPoint = { lng: 55.141234, lat: 25.081234 };
    const id = await listing(db, {
      title: "Marina view apartment",
      slug: "marina-view",
      locationId: ids.tower,
      propertyTypeId: ids.type,
      agentId: ids.agent,
      unitNumber: "2304-SECRET",
      point: exactPoint,
      mapPinExact: false,
      price: 245_000_000,
      beds: 2,
    });
    await db
      .insert(propertyMedia)
      .values({ propertyId: id, mediaId: ids.photo, kind: "photo", isCover: true });
    await listing(db, { slug: "a-draft", status: "draft", publishedAt: null });
    await listing(db, { slug: "off-market", status: "off_market" });
    await listing(db, { slug: "archived", deletedAt: new Date() });
    await listing(db, { slug: "sold-one", status: "sold" });

    const page = await getPublicListing("marina-view");
    expect(page).toMatchObject({
      title: "Marina view apartment",
      places: [
        { name: "Dubai", level: "city" },
        { name: "Dubai Marina", level: "area" },
        { name: "Marina Gate", level: "building" },
      ],
      agent: { name: "Layla Haddad", languages: ["English", "Arabic"] },
      photos: [{ alt: "Living room" }],
    });
    expect(JSON.stringify(page)).not.toContain("2304-SECRET");
    expect(page!.point!.approx).toBe(true);
    expect(JSON.stringify(page)).not.toContain("55.141234");
    expect(await getPublicListing("a-draft")).toBeNull();
    expect(await getPublicListing("off-market")).toBeNull();
    expect(await getPublicListing("archived")).toBeNull();
    expect((await getPublicListing("sold-one"))!.status).toBe("sold");
  });

  it("shows its own complete plan, else the project's complete plan, else none", async () => {
    const { db, ids } = await world();
    await listing(db, { slug: "inherits", completion: "off_plan", projectId: ids.project });
    expect((await getPublicListing("inherits"))!.plan!.steps.map((s) => s.percent)).toEqual([
      60, 40,
    ]);
    const ownPlan = newId();
    await db.insert(paymentPlans).values({ id: ownPlan, name: "Unfinished" });
    await db
      .insert(paymentPlanSteps)
      .values({ paymentPlanId: ownPlan, stage: "booking", label: "Down", percent: 30 });
    await listing(db, { slug: "own-unfinished", projectId: ids.project, paymentPlanId: ownPlan });
    expect((await getPublicListing("own-unfinished"))!.plan).toBeNull();
    await db
      .update(paymentPlanSteps)
      .set({ percent: 30 })
      .where(
        and(eq(paymentPlanSteps.paymentPlanId, ids.plan), eq(paymentPlanSteps.stage, "booking")),
      );
    await listing(db, { slug: "project-unfinished", projectId: ids.project });
    expect((await getPublicListing("project-unfinished"))!.plan).toBeNull();
  });

  it("similar homes: same purpose and area, ±20% price, one bedroom more or less", async () => {
    const { db, ids } = await world();
    const base = { locationId: ids.tower, price: 200_000_000, beds: 2 };
    const self = await listing(db, { ...base, slug: "the-one" });
    const match = await listing(db, { ...base, price: 230_000_000, beds: 3 });
    await listing(db, { ...base, price: 250_000_000 }); // +25%
    await listing(db, { ...base, beds: 4 }); // two more bedrooms
    await listing(db, { ...base, purpose: "rent" });
    await listing(db, { ...base, locationId: ids.other });
    await listing(db, { ...base, status: "sold" });
    const similar = await similarListings((await getPublicListing("the-one"))!);
    expect(similar.map((c) => c.id)).toEqual([match]);
    expect(similar.map((c) => c.id)).not.toContain(self);
  });

  it("old slugs redirect and count the hit; cards are only for live listings", async () => {
    const { db } = await world();
    await db
      .insert(seoRedirects)
      .values({ fromPath: "/property/old-name", toPath: "/property/new-name" });
    expect(await listingRedirect("old-name")).toEqual({
      to: "/property/new-name",
      permanent: true,
    });
    const [row] = await db.select().from(seoRedirects);
    expect(row!.hits).toBe(1);
    expect(await listingRedirect("never-existed")).toBeNull();
    const live = await listing(db, {});
    const draft = await listing(db, { status: "draft", publishedAt: null });
    expect((await publicCards([draft, live])).map((c) => c.id)).toEqual([live]);
  });
});

describe("listing inquiry form", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    setTurnstileVerifier(async (token) => token === "good-token");
    await truncate(
      "properties",
      "agents",
      "locations",
      "property_types",
      "projects",
      "payment_plans",
      "payment_plan_steps",
      "media",
      "email_log",
      "job_runs",
      "rate_limits",
      "settings",
      "audit_log",
    );
  });
  afterEach(() => setTurnstileVerifier(null));

  const valid = (propertyId: string) => ({
    propertyId,
    kind: "inquiry" as const,
    name: "Sam Visitor",
    email: "sam@example.com",
    phone: "050 123 4567",
    message: "Is it still available?",
    similar: true,
    consent: true as const,
    captchaToken: "good-token",
  });

  it("emails the agent, with the visitor as reply-to", async () => {
    const { db, ids } = await world();
    const id = await listing(db, { agentId: ids.agent });
    expect(await sendListingInquiry(valid(id))).toEqual({
      ok: true,
      data: { who: "Layla Haddad" },
    });
    const [mail] = await db.select().from(emailLog);
    expect(mail).toMatchObject({ to: "layla@agency.example", template: "listing.inquiry" });
    expect(mail!.subject).toMatch(/^New question: HD-\d+ from Sam Visitor$/);
    expect(mail!.text).toContain("+971501234567");
    expect(mail!.text).toContain("Is it still available?");
  });

  it("without an agent the agency inbox gets it; tours and callbacks too", async () => {
    const { db } = await world();
    const id = await listing(db, {});
    const tour = await sendListingInquiry({
      ...valid(id),
      kind: "tour",
      preferredTime: "Saturday 10am",
    });
    expect(tour).toMatchObject({ ok: true });
    expect(
      await sendListingInquiry({ ...valid(id), kind: "callback", email: "", message: "" }),
    ).toMatchObject({ ok: true });
    const mails = await db.select().from(emailLog);
    expect(mails.map((m) => [m.to, m.template]).sort()).toEqual([
      ["hello@agency.example", "listing.callback"],
      ["hello@agency.example", "listing.tour"],
    ]);
  });

  it("checks the fields, the honeypot, Turnstile and the rate limit", async () => {
    const { db } = await world();
    const id = await listing(db, {});
    expect(
      await sendListingInquiry({ ...valid(id), consent: false as unknown as true }),
    ).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { consent: expect.any(Array) } });
    expect(await sendListingInquiry({ ...valid(id), email: "", phone: "" })).toMatchObject({
      ok: false,
      fieldErrors: { email: ["Enter an email address or a phone number so we can reply"] },
    });
    expect(await sendListingInquiry({ ...valid(id), kind: "callback", phone: "" })).toMatchObject({
      ok: false,
      fieldErrors: { phone: ["Enter the number to call"] },
    });
    expect(await sendListingInquiry({ ...valid(id), phone: "12" })).toMatchObject({
      ok: false,
      fieldErrors: { phone: expect.any(Array) },
    });
    expect(await sendListingInquiry({ ...valid(id), captchaToken: "bad" })).toMatchObject({
      ok: false,
      code: "CAPTCHA",
    });
    // Bots: same answer, nothing sent.
    expect(await sendListingInquiry({ ...valid(id), website: "https://spam.example" })).toEqual({
      ok: true,
      data: { who: "" },
    });
    expect(await db.select().from(emailLog)).toEqual([]);
    // 5 a minute per address (the checks above count too).
    let last;
    for (let i = 0; i < 6; i++) last = await sendListingInquiry(valid(id));
    expect(last).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("refuses listings that are not live", async () => {
    const { db } = await world();
    const draft = await listing(db, { status: "draft", publishedAt: null });
    expect(await sendListingInquiry(valid(draft))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
