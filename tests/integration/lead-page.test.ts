import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leadEvents, leads, visitorEvents, visitors } from "@/db/schema/crm";
import { leadStages, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { emailLog } from "@/db/schema/system";
import { captureLead } from "@/features/leads/capture";
import {
  addLeadNote,
  addLeadTask,
  completeLeadTask,
  logLeadCall,
  sendLeadEmail,
  updateLeadContact,
  updateLeadRequirements,
} from "@/features/leads/lead-actions";
import { loadLeadPage } from "@/features/leads/page-data";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function world() {
  const db = await getDb();
  await patchSettings(
    db,
    "market",
    {
      phoneCountryCode: "+971",
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    },
    actor,
  );
  const ids = { city: newId(), marina: newId(), tower: newId(), type: newId(), layla: newId() };
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
    { id: ids.marina, parentId: ids.city, level: "area", name: "Dubai Marina", slug: "marina" },
    { id: ids.tower, parentId: ids.marina, level: "building", name: "Marina Gate", slug: "gate" },
  ]);
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db
    .insert(agents)
    .values({ id: ids.layla, name: "Layla Haddad", slug: "layla", email: "layla@agency.example" });
  await db.insert(leadStages).values({ name: "New", kind: "open" });
  const listing = (ref: string, values: Partial<typeof properties.$inferInsert>) => ({
    id: newId(),
    reference: ref,
    title: `Home ${ref}`,
    slug: `home-${ref.toLowerCase()}`,
    purpose: "sale" as const,
    status: "available" as const,
    publishedAt: new Date(),
    currency: "AED",
    propertyTypeId: ids.type,
    ...values,
  });
  const asked = listing("HD-1", {
    price: 200_000_000,
    beds: 2,
    locationId: ids.tower,
    agentId: ids.layla,
  });
  const near = listing("HD-2", { price: 210_000_000, beds: 2, locationId: ids.tower });
  const far = listing("HD-3", { price: 900_000_000, beds: 4, locationId: ids.tower });
  const rent = listing("HD-4", {
    price: 20_000_000,
    beds: 2,
    locationId: ids.tower,
    purpose: "rent",
  });
  await db.insert(properties).values([asked, near, far, rent]);

  const vid = "0192f000-0000-7000-8000-00000000d001";
  const [visitor] = await db
    .insert(visitors)
    .values({
      visitorKey: vid,
      firstTouch: {
        channel: "paid_search",
        gclid: "g",
        utm_campaign: "marina-2bed",
        landing_path: "/buy",
        at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
      lastTouch: {
        channel: "paid_search",
        gclid: "g",
        utm_campaign: "marina-2bed",
        landing_path: "/buy",
        at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
    })
    .returning();
  await db.insert(visitorEvents).values({
    visitorId: visitor!.id,
    type: "listing_view",
    path: "/property/home-hd-1",
    entityType: "property",
    entityId: asked.id,
  });
  const lead = await captureLead(db, {
    source: "form",
    contact: { name: "Sara Khan", email: "sara@example.com" },
    propertyId: asked.id,
    message: "Still available?",
    visitorKey: vid,
  });
  return { db, ids, lead, asked, near, far };
}

describe("lead page (09 §4)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "visitors",
      "visitor_events",
      "viewings",
      "properties",
      "property_types",
      "agents",
      "locations",
      "lead_stages",
      "email_log",
      "job_runs",
      "settings",
      "audit_log",
    );
  });

  it("shows the story, the matches and what to do next", async () => {
    const { db, lead, near, far } = await world();
    const data = (await loadLeadPage(db, lead.leadId))!;
    expect(data.contact.name).toBe("Sara Khan");
    expect(data.attribution).toMatch(
      /^First came from Google Ads \(campaign marina-2bed\) 5 days ago/,
    );
    expect(data.timeline.map((x) => (x.kind === "event" ? x.type : x.kind))).toEqual([
      "created",
      "assigned",
    ]);
    expect(data.interest.map((l) => l.reference)).toEqual(["HD-1"]);
    // Same purpose, place and beds within the 15% band around HD-1; not the dear one or the rental.
    expect(data.matching.map((l) => l.id)).toEqual([near.id]);
    expect(data.matching.map((l) => l.id)).not.toContain(far.id);
    expect(data.journey.map((j) => j.listing?.reference)).toEqual(["HD-1"]);
    expect(data.nextStep.key).toBe("first_reply");
    expect(await loadLeadPage(db, newId())).toBeNull();
  });

  it("notes, calls and emails go on the timeline; a call or an email is the first reply", async () => {
    const { db, lead } = await world();
    expect((await addLeadNote({ id: lead.leadId, body: "Prefers evenings" })).ok).toBe(true);
    let [row] = await db.select().from(leads).where(eq(leads.id, lead.leadId));
    expect(row!.firstResponseAt).toBeNull();

    expect(await logLeadCall({ id: lead.leadId, outcome: "no_answer", body: "" })).toMatchObject({
      ok: true,
      data: { firstResponse: true },
    });
    [row] = await db.select().from(leads).where(eq(leads.id, lead.leadId));
    expect(row!.firstResponseAt).not.toBeNull();
    expect(row!.responseDueAt).toBeNull();

    expect(
      await sendLeadEmail({
        id: lead.leadId,
        subject: "Floor plans",
        body: "Here they are.\n\nLayla",
      }),
    ).toMatchObject({ ok: true, data: { firstResponse: false } });
    const [mail] = await db.select().from(emailLog);
    expect(mail).toMatchObject({
      to: "sara@example.com",
      subject: "Floor plans",
      template: "lead.message",
    });
    expect(mail!.text).toContain("Here they are.");
    const types = (await db.select({ type: leadEvents.type }).from(leadEvents))
      .map((e) => e.type)
      .sort();
    expect(types).toEqual(["assigned", "call", "created", "email_sent", "note"]);

    await db.update(contacts).set({ email: null });
    expect(await sendLeadEmail({ id: lead.leadId, subject: "x", body: "y" })).toMatchObject({
      ok: false,
      code: "NO_EMAIL",
    });
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await addLeadNote({ id: lead.leadId, body: "x" })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("tasks keep the next task right; requirements and contact edits are checked", async () => {
    const { db, lead, ids } = await world();
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const a = await addLeadTask({
      id: lead.leadId,
      title: "Send plans",
      dueAt: later,
      agentId: null,
    });
    const b = await addLeadTask({
      id: lead.leadId,
      title: "Call back",
      dueAt: soon,
      agentId: null,
    });
    let [row] = await db.select().from(leads).where(eq(leads.id, lead.leadId));
    expect(row!.nextTaskAt?.toISOString()).toBe(soon);
    if (!b.ok || !a.ok) throw new Error("tasks");
    await completeLeadTask({ taskId: b.data.id, done: true });
    [row] = await db.select().from(leads).where(eq(leads.id, lead.leadId));
    expect(row!.nextTaskAt?.toISOString()).toBe(later);
    const done = await db.select().from(leadEvents).where(eq(leadEvents.type, "task_done"));
    expect(done.map((e) => e.body)).toEqual(["Call back"]);

    expect(
      await updateLeadRequirements({
        id: lead.leadId,
        data: {
          purpose: "sale",
          budgetMin: 2_000_000,
          budgetMax: 1_000_000,
          locationIds: [ids.marina],
        },
      }),
    ).toMatchObject({ ok: false, fieldErrors: { budgetMax: expect.any(Array) } });
    await updateLeadRequirements({
      id: lead.leadId,
      data: {
        purpose: "sale",
        budgetMin: 1_800_000,
        budgetMax: 2_200_000,
        locationIds: [ids.marina],
        timeline: "now",
      },
    });
    [row] = await db.select().from(leads).where(eq(leads.id, lead.leadId));
    expect(row!.requirements).toMatchObject({
      budgetMin: 180_000_000,
      budgetMax: 220_000_000,
      currency: "AED",
      budgetFrom: "lead",
      timeline: "now",
      locationIds: [ids.marina],
    });
    // Rescored: a stated budget that fits HD-1, and moving soon.
    expect(row!.aiScoreReason).toContain("+15 Gave a budget");
    expect(row!.aiScoreReason).toContain("+10 Budget fits the homes asked about");

    expect(
      await updateLeadContact({ id: lead.leadId, data: { name: "Sara K", phone: "12" } }),
    ).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(Array) } });
    await updateLeadContact({
      id: lead.leadId,
      data: {
        name: "Sara K",
        email: "SARA@example.com",
        phone: "050 999 8888",
        marketingConsent: true,
      },
    });
    const [c] = await db.select().from(contacts);
    expect(c).toMatchObject({
      name: "Sara K",
      email: "sara@example.com",
      phone: "+971509998888",
      marketingConsent: true,
    });
    expect(c!.marketingConsentAt).not.toBeNull();
  });
});
