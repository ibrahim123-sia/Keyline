import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  contacts,
  leadEvents,
  leads,
  leadTasks,
  messageTemplates,
  visitorEvents,
  visitors,
} from "@/db/schema/crm";
import { leadStages, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties, propertyDailyStats } from "@/db/schema/properties";
import { emailLog } from "@/db/schema/system";
import { recordTrack } from "@/features/attribution/record";
import { captureLead } from "@/features/leads/capture";
import { markFirstResponse } from "@/features/leads/first-response";
import { alertUnansweredLeads } from "@/features/leads/process";
import { patchSettings } from "@/features/settings/mutations";
import { runDueJobs } from "@/jobs/runner";
import { newId } from "@/lib/ids";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

const cookieJar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  }),
}));
vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const t0 = new Date("2026-10-01T09:00:00Z");
const minutes = (m: number) => new Date(t0.getTime() + m * 60_000);

async function runJobs() {
  for (let i = 0; i < 5; i++) if ((await runDueJobs()).ran === 0) return;
}

async function world() {
  const db = await getDb();
  await patchSettings(db, "market", { phoneCountryCode: "+971" }, actor);
  await patchSettings(
    db,
    "contact",
    { email: "hello@agency.example", leadNotifyEmails: [] },
    actor,
  );
  await patchSettings(db, "general", { agencyName: "Haven & Dune", timeZone: "Asia/Dubai" }, actor);
  const ids = {
    type: newId(),
    city: newId(),
    area: newId(),
    tower: newId(),
    layla: newId(),
    omar: newId(),
    away: newId(),
    stage: newId(),
  };
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
    { id: ids.area, parentId: ids.city, level: "area", name: "Dubai Marina", slug: "dubai-marina" },
    { id: ids.tower, parentId: ids.area, level: "building", name: "Marina Gate", slug: "mg" },
  ]);
  await db.insert(agents).values([
    { id: ids.layla, name: "Layla Haddad", slug: "layla", email: "layla@agency.example" },
    { id: ids.omar, name: "Omar Nasser", slug: "omar", email: "omar@agency.example", sortOrder: 1 },
    {
      id: ids.away,
      name: "Away Agent",
      slug: "away",
      email: "away@agency.example",
      isActive: false,
    },
  ]);
  await db.insert(leadStages).values([
    { name: "Won", sortOrder: 9, kind: "won" },
    { id: ids.stage, name: "New", sortOrder: 0, kind: "open" },
    { name: "Contacted", sortOrder: 1, kind: "open" },
  ]);
  const listing = newId();
  await db.insert(properties).values({
    id: listing,
    reference: "HD-2041",
    title: "Two bed with a marina view",
    slug: "two-bed-marina",
    purpose: "sale",
    status: "available",
    publishedAt: t0,
    price: 200_000_000,
    currency: "AED",
    beds: 2,
    locationId: ids.tower,
    propertyTypeId: ids.type,
    agentId: ids.layla,
  });
  return { db, ids, listing };
}

const track = (
  db: Awaited<ReturnType<typeof getDb>>,
  visitorKey: string,
  input: Partial<Parameters<typeof recordTrack>[1]>,
) =>
  recordTrack(db, {
    visitorKey,
    consent: { analytics: true, marketing: false, at: t0.toISOString() },
    type: "page_view",
    path: "/",
    device: "mobile",
    country: "AE",
    siteHost: "havendune.example",
    portals: [],
    now: t0,
    today: "2026-10-01",
    ...input,
  });

describe("lead pipeline (09 §3)", () => {
  beforeEach(async () => {
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "visitors",
      "visitor_events",
      "property_daily_stats",
      "properties",
      "agents",
      "locations",
      "property_types",
      "lead_stages",
      "message_templates",
      "email_log",
      "job_runs",
      "rate_limits",
      "settings",
      "audit_log",
    );
  });

  it("a listing inquiry: normalised contact, listing agent, enriched needs, touches, timeline", async () => {
    const { db, ids, listing } = await world();
    const vid = "0192f000-0000-7000-8000-00000000a001";
    // First visit from a Google ad, then direct, then from Instagram: first and last touch.
    await track(db, vid, {
      landing: {
        search: "?utm_source=google&utm_medium=cpc&utm_campaign=marina-2bed&gclid=g1",
        referrer: null,
      },
      path: "/buy/dubai-marina",
      now: minutes(-60 * 24 * 12),
    });
    await track(db, vid, { landing: { search: "", referrer: null }, now: minutes(-60) });
    await track(db, vid, {
      landing: { search: "", referrer: "https://l.instagram.com/?u=x" },
      path: "/property/two-bed-marina",
      now: minutes(-5),
    });

    const res = await captureLead(db, {
      source: "form",
      sourceDetail: "listing",
      contact: { name: "Sam Visitor", email: " Sam@Example.com ", phone: "050 123 4567" },
      propertyId: listing,
      message: "Is it still available?",
      details: { preferredTime: "Saturday 10am" },
      visitorKey: vid,
      now: t0,
    });
    expect(res).toMatchObject({ isNew: true, agentId: ids.layla });

    const [contact] = await db.select().from(contacts);
    expect(contact).toMatchObject({ email: "sam@example.com", phone: "+971501234567" });
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({
      contactId: contact!.id,
      type: "buyer",
      status: "open",
      stageId: ids.stage,
      source: "form",
      sourceDetail: "listing",
      agentId: ids.layla,
      propertyIds: [listing],
      requirements: {
        purpose: "sale",
        locationIds: [ids.tower],
        propertyTypeIds: [ids.type],
        bedsMin: 2,
        budgetMin: 170_000_000,
        budgetMax: 230_000_000,
        currency: "AED",
        budgetFrom: "listing",
      },
    });
    expect(lead!.firstTouch).toMatchObject({ channel: "paid_search", utm_campaign: "marina-2bed" });
    expect(lead!.lastTouch).toMatchObject({
      channel: "organic_social",
      referrer: "https://l.instagram.com/",
    });
    expect(lead!.responseDueAt).toEqual(minutes(10));
    const [visitor] = await db.select().from(visitors);
    expect(visitor).toMatchObject({ leadId: lead!.id });
    expect(lead!.visitorId).toBe(visitor!.id);

    const events = await db
      .select({ type: leadEvents.type, body: leadEvents.body, meta: leadEvents.meta })
      .from(leadEvents)
      .orderBy(asc(leadEvents.createdAt));
    expect(events).toEqual([
      { type: "assigned", body: null, meta: { agentId: ids.layla, rule: "listing_agent" } },
      {
        type: "created",
        body: "Is it still available?",
        meta: expect.objectContaining({
          source: "form",
          propertyId: listing,
          details: { preferredTime: "Saturday 10am" },
        }),
      },
    ]);
    const [stats] = await db.select().from(propertyDailyStats);
    expect(stats).toMatchObject({ propertyId: listing, inquiries: 1 });

    // After commit: the agent and the agency inbox are told, the visitor gets the auto-reply,
    // and the lead is scored with its reasons.
    await runJobs();
    const mails = await db
      .select({
        to: emailLog.to,
        template: emailLog.template,
        subject: emailLog.subject,
        text: emailLog.text,
      })
      .from(emailLog);
    expect(mails.map((m) => [m.to, m.template]).sort()).toEqual([
      ["hello@agency.example", "lead.new"],
      ["layla@agency.example", "lead.new"],
      ["sam@example.com", "lead.auto_reply"],
    ]);
    const toAgent = mails.find((m) => m.to === "layla@agency.example")!;
    expect(toAgent.subject).toBe("New lead: Sam Visitor · HD-2041 · Website form, listing");
    expect(toAgent.text).toContain("Preferred time: Saturday 10am");
    expect(toAgent.text).toContain("Is it still available?");
    const reply = mails.find((m) => m.template === "lead.auto_reply")!;
    expect(reply.subject).toBe("Thanks, Sam. We have your message");
    expect(reply.text).toContain("Layla will reach out shortly");
    const [scored] = await db.select().from(leads);
    expect(scored).toMatchObject({ aiScore: 40, aiScoreReason: "+10 Gave email and phone" });
    // The auto-reply is on the timeline but is not the first response (setting default).
    expect(scored!.firstResponseAt).toBeNull();
    expect(
      (await db.select({ type: leadEvents.type }).from(leadEvents)).map((e) => e.type).sort(),
    ).toEqual(["assigned", "created", "email_sent"]);
  });

  it("the same person by email or phone joins their open lead; another type is a second lead", async () => {
    const { db, listing } = await world();
    const first = await captureLead(db, {
      source: "form",
      contact: { name: "Sam", email: "sam@example.com" },
      propertyId: listing,
      message: "Hello",
      now: t0,
    });
    // Same phone later, with an email: same contact, same lead, details filled in.
    await db.update(contacts).set({ phone: "+971501234567" });
    const again = await captureLead(db, {
      source: "callback",
      contact: { name: "Sam V", phone: "+971 50 123 4567", email: "sam@example.com" },
      message: "Call me",
      requirements: {
        budgetMax: 250_000_000,
        currency: "AED",
        budgetFrom: "lead",
        timeline: "now",
      },
      now: minutes(30),
    });
    expect(again).toMatchObject({ leadId: first.leadId, contactId: first.contactId, isNew: false });
    const [lead] = await db.select().from(leads);
    expect(lead!.requirements).toMatchObject({
      budgetMin: null,
      budgetMax: 250_000_000,
      budgetFrom: "lead",
      timeline: "now",
      bedsMin: 2,
    });
    expect(lead!.lastActivityAt).toEqual(minutes(30));
    const events = await db
      .select({ type: leadEvents.type })
      .from(leadEvents)
      .where(eq(leadEvents.leadId, first.leadId));
    expect(events.map((e) => e.type).sort()).toEqual(["assigned", "created", "form"]);

    // Selling as well as buying: a second lead for the same contact.
    const seller = await captureLead(db, {
      source: "valuation",
      contact: { name: "Sam", email: "SAM@example.com" },
      requirements: { purpose: "sale" },
      now: minutes(60),
    });
    expect(seller).toMatchObject({ contactId: first.contactId, isNew: true });
    expect((await db.select().from(leads)).map((l) => l.type).sort()).toEqual(["buyer", "seller"]);

    // Matching by email only: a phone match is a different person.
    await patchSettings(db, "leads", { duplicateMatching: "email" }, actor);
    const other = await captureLead(db, {
      source: "form",
      contact: { name: "Someone else", phone: "+971501234567" },
      now: minutes(90),
    });
    expect(other.contactId).not.toBe(first.contactId);
    expect(await db.select().from(contacts)).toHaveLength(2);

    // An unreadable phone fails a form; a webhook keeps it in the details instead.
    await expect(
      captureLead(db, { source: "form", contact: { name: "X", phone: "12" } }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const lenient = await captureLead(db, {
      source: "social_form",
      contact: { name: "Y", phone: "12", email: "y@example.com" },
      lenientPhone: true,
    });
    const [ev] = await db
      .select({ meta: leadEvents.meta })
      .from(leadEvents)
      .where(eq(leadEvents.id, lenient.eventId));
    expect(ev!.meta).toMatchObject({ details: { phoneAsGiven: "12" } });
  });

  it("assignment: listing agent, then area match, then round robin; manual leaves it", async () => {
    const { db, ids } = await world();
    await db
      .update(agents)
      .set({ areas: [ids.area] })
      .where(eq(agents.id, ids.omar));
    const inTower = newId();
    await db.insert(properties).values({
      id: inTower,
      reference: "HD-2042",
      title: "Studio",
      slug: "studio",
      purpose: "rent",
      status: "available",
      publishedAt: t0,
      locationId: ids.tower,
      agentId: ids.away, // not active: falls through
    });
    const a = await captureLead(db, {
      source: "form",
      contact: { name: "A", email: "a@example.com" },
      propertyId: inTower,
      now: t0,
    });
    // Omar covers Dubai Marina, which holds the tower; a renter is a tenant.
    expect(a.agentId).toBe(ids.omar);
    expect((await db.select().from(leads).where(eq(leads.id, a.leadId)))[0]!.type).toBe("tenant");

    // No listing, no area: round robin, the one given a lead longest ago (Layla, never).
    const b = await captureLead(db, {
      source: "form",
      contact: { name: "B", email: "b@example.com" },
      now: minutes(1),
    });
    expect(b.agentId).toBe(ids.layla);
    const c = await captureLead(db, {
      source: "form",
      contact: { name: "C", email: "c@example.com" },
      now: minutes(2),
    });
    expect(c.agentId).toBe(ids.omar);

    await patchSettings(db, "leads", { assignmentRule: "manual" }, actor);
    const d = await captureLead(db, {
      source: "form",
      contact: { name: "D", email: "d@example.com" },
      now: minutes(3),
    });
    expect(d.agentId).toBeNull();
    // A later message from D, after the rule changed back, assigns the open lead then.
    await patchSettings(db, "leads", { assignmentRule: "round_robin" }, actor);
    const d2 = await captureLead(db, {
      source: "form",
      contact: { name: "D", email: "d@example.com" },
      now: minutes(4),
    });
    expect(d2).toMatchObject({ leadId: d.leadId, isNew: false, agentId: ids.layla });
  });

  it("tasks, the response timer and the first response", async () => {
    const { db, ids } = await world();
    const callback = await captureLead(db, {
      source: "callback",
      contact: { name: "Rania", phone: "0501112222" },
      task: { title: "Call back", dueAt: minutes(15) },
      now: t0,
    });
    const [task] = await db.select().from(leadTasks);
    expect(task).toMatchObject({ leadId: callback.leadId, title: "Call back", dueAt: minutes(15) });
    expect((await db.select().from(leads))[0]!.nextTaskAt).toEqual(minutes(15));

    const answered = await captureLead(db, {
      source: "form",
      contact: { name: "Answered", email: "ans@example.com" },
      now: t0,
    });
    expect(await markFirstResponse(db, answered.leadId, minutes(3))).toBe(true);
    expect(await markFirstResponse(db, answered.leadId, minutes(4))).toBe(false);
    const [done] = await db.select().from(leads).where(eq(leads.id, answered.leadId));
    expect(done).toMatchObject({
      firstResponseAt: minutes(3),
      responseDueAt: null,
      responseSeconds: 180,
    });

    await db.delete(emailLog);
    expect(await alertUnansweredLeads(db, minutes(9))).toBe(0);
    // 10 minutes (the default) without a reply: the agency inbox and the agent hear once.
    expect(await alertUnansweredLeads(db, minutes(11))).toBe(2);
    expect(await alertUnansweredLeads(db, minutes(12))).toBe(0);
    const mails = await db.select({ to: emailLog.to, subject: emailLog.subject }).from(emailLog);
    expect(mails.map((m) => m.to).sort()).toEqual(["hello@agency.example", "layla@agency.example"]);
    expect(mails[0]!.subject).toBe("Not answered for 11 minutes: Rania");
    const [alerted] = await db.select().from(leads).where(eq(leads.id, callback.leadId));
    expect(alerted!.responseAlertSentAt).toEqual(minutes(11));
    expect(alerted!.agentId).toBe(ids.layla);
  });

  it("an agency's own template wording wins; a template turned off sends nothing", async () => {
    const { db } = await world();
    await db.insert(messageTemplates).values([
      {
        channel: "email",
        key: "lead.auto_reply",
        name: "Auto-reply",
        subject: "Hi {{name}} from {{agency}}",
        body: "We will call you soon.",
      },
      {
        channel: "email",
        key: "lead.new",
        name: "New lead",
        subject: "x",
        body: "x",
        isActive: false,
      },
    ]);
    await captureLead(db, {
      source: "form",
      contact: { name: "Mina Park", email: "mina@example.com" },
      now: t0,
    });
    await runJobs();
    const mails = await db.select({ to: emailLog.to, subject: emailLog.subject }).from(emailLog);
    expect(mails).toEqual([{ to: "mina@example.com", subject: "Hi Mina from Haven & Dune" }]);
  });
});

describe("visitor tracking (09 §2)", () => {
  beforeEach(async () => {
    await truncate(
      "visitors",
      "visitor_events",
      "property_daily_stats",
      "properties",
      "contacts",
      "leads",
      "lead_events",
      "agents",
      "locations",
      "property_types",
      "lead_stages",
      "message_templates",
      "rate_limits",
      "settings",
    );
    for (const k of Object.keys(cookieJar)) delete cookieJar[k];
  });

  it("without analytics consent: touches and contact clicks only; listing views still counted", async () => {
    const { db, listing } = await world();
    const vid = "0192f000-0000-7000-8000-00000000b001";
    const noConsent = { analytics: false, marketing: false, at: null };
    await track(db, vid, {
      consent: noConsent,
      landing: { search: "?utm_source=flyer&utm_medium=qr", referrer: null },
    });
    await track(db, vid, {
      consent: noConsent,
      type: "listing_view",
      entityType: "property",
      entityId: listing,
    });
    await track(db, vid, {
      consent: noConsent,
      type: "whatsapp_click",
      entityType: "property",
      entityId: listing,
      meta: { ref: "k3f9", label: "HD-2041" },
    });
    const [visitor] = await db.select().from(visitors);
    expect(visitor!.firstTouch).toMatchObject({ channel: "offline_qr", utm_source: "flyer" });
    expect(
      await db.select({ type: visitorEvents.type, meta: visitorEvents.meta }).from(visitorEvents),
    ).toEqual([{ type: "whatsapp_click", meta: { ref: "k3f9", label: "HD-2041" } }]);
    const [stats] = await db.select().from(propertyDailyStats);
    expect(stats).toMatchObject({ propertyId: listing, views: 1 });
  });

  it("a known lead tapping Call leaves a note on their timeline", async () => {
    const { db, listing } = await world();
    const vid = "0192f000-0000-7000-8000-00000000b002";
    await track(db, vid, { landing: { search: "", referrer: null } });
    const lead = await captureLead(db, {
      source: "form",
      contact: { name: "Lee", email: "lee@example.com" },
      visitorKey: vid,
    });
    await track(db, vid, {
      type: "call_click",
      entityType: "property",
      entityId: listing,
      path: "/property/two-bed-marina",
    });
    const types = (
      await db
        .select({ type: leadEvents.type })
        .from(leadEvents)
        .where(eq(leadEvents.leadId, lead.leadId))
    ).map((e) => e.type);
    expect(types).toContain("possible_call");
  });

  it("the beacon endpoint: needs the visitor cookie, ignores bots and bad input", async () => {
    const { db } = await world();
    const { POST } = await import("@/app/api/track/route");
    const send = (body: unknown, ua = "Mozilla/5.0 (iPhone) Mobile Safari") =>
      POST(
        new Request("http://havendune.example/api/track", {
          method: "POST",
          headers: { "user-agent": ua, "cf-ipcountry": "GB" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );
    const view = {
      type: "page_view",
      path: "/buy",
      landing: { search: "", referrer: "https://www.google.com/" },
    };

    expect((await send(view)).status).toBe(204);
    expect(await db.select().from(visitors)).toHaveLength(0); // no cookie yet

    cookieJar.vid = "s.0192f000-0000-7000-8000-00000000c001";
    cookieJar.keyline_consent = "v1.a1.m0.1760000000";
    await send(view, "Googlebot/2.1");
    await send("not json");
    await send({ type: "nope", path: "/" });
    expect(await db.select().from(visitors)).toHaveLength(0);

    await send(view);
    const [visitor] = await db.select().from(visitors);
    expect(visitor).toMatchObject({
      visitorKey: "0192f000-0000-7000-8000-00000000c001",
      device: "mobile",
      country: "GB",
      consent: { analytics: true, marketing: false },
    });
    expect(visitor!.firstTouch).toMatchObject({ channel: "organic_search", landing_path: "/buy" });
    expect(await db.select().from(visitorEvents)).toHaveLength(1);
  });
});
