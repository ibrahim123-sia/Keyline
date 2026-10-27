import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { aiActions } from "@/db/schema/ai";
import { posts } from "@/db/schema/content";
import { contacts, leads, leadTasks, utmLinks } from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { priceHistory, properties } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import {
  askAdminAssistant,
  confirmAssistantProposal,
  rejectAssistantProposal,
} from "@/features/ai/assistant/admin-actions";
import { adminTools } from "@/features/ai/assistant/admin";
import { resetMock, scriptMockReplies } from "@/features/ai/providers/mock";
import { patchSettings } from "@/features/settings/mutations";
import { defaultsFor } from "@/features/settings/schema";
import { newId } from "@/lib/ids";
import { evalWorldTables, seedEvalWorld, type EvalWorld } from "../ai/fixtures";
import { adminState, testAdmin } from "../helpers/admin-context";
import { ensureTestAdminUser, truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const sessionId = newId();
let world: EvalWorld;
const ids = { lead: newId(), contact: newId(), agent: newId(), contacted: newId(), fresh: newId() };

async function ask(text: string, page: string | null = null) {
  const res = await askAdminAssistant({ sessionId, lines: [{ role: "user", text }], page });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/** The model proposes exactly this call (scripted), then says so. */
async function propose(name: string, input: Record<string, unknown>) {
  scriptMockReplies({ toolCalls: [{ name, input }] }, { text: "Waiting for your confirmation." });
  const reply = await ask(`please ${name}`);
  expect(reply.proposals).toHaveLength(1);
  return reply.proposals[0]!;
}

async function confirm(id: string, input?: Record<string, unknown>) {
  const res = await confirmAssistantProposal({ id, input });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

describe("admin assistant (10 §3)", () => {
  beforeEach(async () => {
    resetMock();
    adminState.user = testAdmin;
    await truncate(
      ...evalWorldTables,
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "lead_stages",
      "agents",
      "ai_actions",
      "ai_usage",
      "audit_log",
      "posts",
      "utm_links",
      "price_history",
      "shortlists",
      "conversations",
      "messages",
      "email_log",
      "job_runs",
    );
    await ensureTestAdminUser();
    const db = await getDb();
    world = await seedEvalWorld(db);
    await patchSettings(
      db,
      "integrations",
      { ai: { ...defaultsFor("integrations").ai, enabled: true, provider: "mock" } },
      actor,
    );
    await db.insert(agents).values({ id: ids.agent, name: "Layla Haddad", slug: "layla" });
    await db.insert(leadStages).values([
      { id: ids.fresh, name: "New", sortOrder: 0, kind: "open" },
      { id: ids.contacted, name: "Contacted", sortOrder: 1, kind: "open" },
      { name: "Won", sortOrder: 2, kind: "won" },
      { name: "Lost", sortOrder: 3, kind: "lost" },
    ]);
    await db.insert(contacts).values({
      id: ids.contact,
      name: "Sara Khan",
      email: "sara@example.com",
      phone: "+971501234567",
    });
    await db.insert(leads).values({
      id: ids.lead,
      contactId: ids.contact,
      source: "form",
      stageId: ids.fresh,
    });
  });

  it("answers questions from the read tools", async () => {
    const reply = await ask("Who is waiting for a reply?");
    expect(reply.tools.map((t) => t.name)).toContain("unanswered_leads");
    expect(reply.text).toContain("Sara Khan");
    expect(reply.proposals).toHaveLength(0);

    const listing = await ask(`What is the status of ${world.listings.hillsVilla.reference}?`);
    expect(listing.text).toContain(world.listings.hillsVilla.title);
  });

  it("proposes a change, changes nothing until confirmed, then audits it as the AI with the admin", async () => {
    const db = await getDb();
    const ref = world.listings.marinaSeaView.reference;
    const reply = await ask(`Change the price of ${ref} to 1,750,000`);
    const [proposal] = reply.proposals;
    expect(proposal).toMatchObject({
      tool: "update_listing",
      input: { reference: ref, price: 1_750_000 },
    });
    expect(proposal!.preview.price).toEqual({ before: "AED 1,800,000", after: "AED 1,750,000" });
    expect(reply.text).toMatch(/until you confirm/);
    const [before] = await db
      .select({ price: properties.price })
      .from(properties)
      .where(eq(properties.id, world.listings.marinaSeaView.id));
    expect(before!.price).toBe(180_000_000);

    // The admin edits the price on the card, then confirms.
    const done = await confirm(proposal!.id, { reference: ref, price: 1_700_000 });
    expect(done.status).toBe("executed");
    const [after] = await db
      .select({ price: properties.price })
      .from(properties)
      .where(eq(properties.id, world.listings.marinaSeaView.id));
    expect(after!.price).toBe(170_000_000);
    expect(await db.select().from(priceHistory)).toEqual([
      expect.objectContaining({ oldPrice: 180_000_000, newPrice: 170_000_000 }),
    ]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.actorType, "ai"));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["property.update", "ai.update_listing"]),
    );
    expect(audits.every((a) => a.confirmedBy === testAdmin.id)).toBe(true);
    // Decided once: a second confirm is refused.
    expect((await confirmAssistantProposal({ id: proposal!.id })).ok).toBe(false);
  });

  it("runs every kind of change after confirmation", async () => {
    const db = await getDb();
    const lead = ids.lead;

    await confirm((await propose("create_task", { leadId: lead, title: "Call Sara back" })).id);
    expect(
      await db.select({ title: leadTasks.title, kind: leadTasks.createdByKind }).from(leadTasks),
    ).toEqual([{ title: "Call Sara back", kind: "ai" }]);

    await confirm(
      (await propose("update_lead", { leadId: lead, stage: "Contacted", agent: "Layla" })).id,
    );
    const [moved] = await db.select().from(leads).where(eq(leads.id, lead));
    expect(moved).toMatchObject({ stageId: ids.contacted, agentId: ids.agent });

    await confirm(
      (
        await propose("write_listing_copy", {
          reference: world.listings.hillsVilla.reference,
          seoTitle: "Family villa with a garden in Dubai Hills",
          description: "A family villa with a private garden.\n\nClose to a school.",
        })
      ).id,
    );
    const [villa] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, world.listings.hillsVilla.id));
    expect(villa!.seoTitle).toBe("Family villa with a garden in Dubai Hills");
    expect(villa!.descriptionHtml).toContain("<p>Close to a school.</p>");

    const draft = await confirm(
      (
        await propose("create_listing_draft", {
          title: "Three-bed townhouse in Dubai Hills",
          purpose: "sale",
          type: "townhouse",
          area: "Dubai Hills",
          beds: 3,
          price: 2_900_000,
        })
      ).id,
    );
    const created = await db
      .select()
      .from(properties)
      .where(eq(properties.title, "Three-bed townhouse in Dubai Hills"));
    expect(created[0]).toMatchObject({ status: "draft", beds: 3, price: 290_000_000 });
    expect(draft.result).toMatchObject({ done: "Draft created" });

    await confirm(
      (
        await propose("draft_blog_post", {
          title: "Living in Dubai Hills",
          body: "## Schools\n\nThere are good schools close by, with short drives for families.\n\nParks and a mall are part of the community, which keeps weekends easy.",
        })
      ).id,
    );
    const [post] = await db.select().from(posts);
    expect(post).toMatchObject({ status: "draft", isAiDrafted: true });
    expect(post!.bodyHtml).toContain("<h2>Schools</h2>");

    await confirm(
      (
        await propose("create_utm_link", {
          name: "Marina spring",
          page: "/buy/dubai-marina",
          source: "instagram",
          medium: "social",
          campaign: "marina-spring",
        })
      ).id,
    );
    expect(await db.select({ baseUrl: utmLinks.baseUrl }).from(utmLinks)).toEqual([
      { baseUrl: "/buy/dubai-marina" },
    ]);

    const sent = await confirm(
      (
        await propose("send_listings_to_lead", {
          leadId: lead,
          references: [world.listings.marinaSeaView.reference, "KL-9999"],
          message: "Two homes for you",
        })
      ).id,
    );
    expect(sent.result).toMatchObject({ emailed: true, url: expect.stringContaining("/s/") });

    await confirm(
      (await propose("send_lead_reply", { leadId: lead, text: "Hi Sara, are you free Tuesday?" }))
        .id,
    );
    const replies = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.actorType, "ai"), eq(auditLog.action, "conversation.reply")));
    expect(replies).toHaveLength(1);

    const executed = await db
      .select({ tool: aiActions.tool })
      .from(aiActions)
      .where(eq(aiActions.status, "executed"));
    expect(executed).toHaveLength(8);
  });

  it("cancel changes nothing; switched-off actions are not offered and cannot be confirmed", async () => {
    const db = await getDb();
    const p = await propose("create_task", { leadId: ids.lead, title: "Not this one" });
    expect((await rejectAssistantProposal({ id: p.id })).ok).toBe(true);
    expect(await db.select().from(leadTasks)).toHaveLength(0);

    const pending = await propose("create_task", { leadId: ids.lead, title: "Later" });
    const ai = defaultsFor("ai");
    await patchSettings(
      db,
      "ai",
      { allowedActions: { ...ai.allowedActions, create_task: false } },
      actor,
    );
    expect((await adminTools(db)).map((t) => t.name)).not.toContain("create_task");
    const refused = await confirmAssistantProposal({ id: pending.id });
    expect(refused).toMatchObject({
      ok: false,
      error: "This action is turned off in Settings -> AI.",
    });
    expect(await db.select().from(leadTasks)).toHaveLength(0);

    // A read-only admin (the demo viewer) cannot confirm anything.
    await patchSettings(db, "ai", { allowedActions: ai.allowedActions }, actor);
    adminState.user = { ...testAdmin, readOnly: true };
    expect((await confirmAssistantProposal({ id: pending.id })).ok).toBe(false);
    expect(await db.select().from(leadTasks)).toHaveLength(0);
  });
});
