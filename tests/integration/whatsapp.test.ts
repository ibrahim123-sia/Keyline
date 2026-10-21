import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  contacts,
  conversations,
  leadEvents,
  leads,
  messages,
  visitorEvents,
  visitors,
} from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { sendOutgoing } from "@/features/inbox/store";
import { setWhatsappClient, type WhatsappClient } from "@/features/integrations/whatsapp/client";
import { patchSettings } from "@/features/settings/mutations";
import { setSecret } from "@/features/settings/secrets";
import { runDueJobs } from "@/jobs/runner";
import { hmacSha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { testAdmin } from "../helpers/admin-context";
import { ensureTestAdminUser, truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const APP_SECRET = "app-secret-for-tests";
const wa = "971501234567";

type Sent = { kind: string; to: string; payload: unknown };
function fakeClient(sent: Sent[]): WhatsappClient {
  let n = 0;
  const ok = (kind: string, to: string, payload: unknown) => {
    sent.push({ kind, to, payload });
    return Promise.resolve({ id: `wamid.out${++n}` });
  };
  return {
    sendText: (to, body) => ok("text", to, body),
    sendTemplate: (to, t) => ok("template", to, t),
    sendImage: (to, image) => ok("image", to, image),
  };
}

async function post(body: unknown, secret = APP_SECRET) {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const raw = JSON.stringify(body);
  return POST(
    new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": `sha256=${await hmacSha256Hex(secret, raw)}` },
      body: raw,
    }),
  );
}

const inbound = (id: string, text: string, ts: number, name = "Sam Visitor") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "123" },
            contacts: [{ wa_id: wa, profile: { name } }],
            messages: [{ from: wa, id, timestamp: String(ts), type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});

const status = (id: string, s: string, errors?: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { statuses: [{ id, status: s, errors }] } }] }],
});

describe("WhatsApp (13 §1)", () => {
  const sent: Sent[] = [];
  beforeEach(async () => {
    sent.length = 0;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "visitors",
      "visitor_events",
      "conversations",
      "messages",
      "properties",
      "agents",
      "lead_stages",
      "settings",
      "secrets",
      "job_runs",
      "email_log",
      "message_templates",
      "audit_log",
    );
    const db = await getDb();
    await ensureTestAdminUser();
    await setSecret(db, "whatsapp_app_secret", APP_SECRET, actor);
    await setSecret(db, "whatsapp_verify_token", "verify-me", actor);
    await patchSettings(db, "market", { phoneCountryCode: "+971" }, actor);
    setWhatsappClient(fakeClient(sent));
  });
  afterEach(() => setWhatsappClient(undefined));

  it("verifies Meta's subscription and refuses unsigned or badly signed calls", async () => {
    const { GET } = await import("@/app/api/webhooks/whatsapp/route");
    const ok = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242",
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("4242");
    const bad = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1",
      ),
    );
    expect(bad.status).toBe(403);
    expect((await post(inbound("wamid.1", "hi", 1_760_000_000), "wrong-secret")).status).toBe(401);
    const { POST } = await import("@/app/api/webhooks/whatsapp/route");
    expect(
      (await POST(new Request("http://localhost/x", { method: "POST", body: "{}" }))).status,
    ).toBe(401);
    const db = await getDb();
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  it("a first message from a site click: contact, conversation and a lead with the visit's attribution", async () => {
    const db = await getDb();
    const agent = newId();
    await db
      .insert(agents)
      .values({ id: agent, name: "Layla Haddad", slug: "layla", email: "l@a.example" });
    const listing = newId();
    await db.insert(properties).values({
      id: listing,
      reference: "HD-2041",
      title: "Two bed",
      slug: "two-bed",
      purpose: "sale",
      status: "available",
      publishedAt: new Date(),
      agentId: agent,
    });
    const visitor = newId();
    await db.insert(visitors).values({
      id: visitor,
      visitorKey: "0192f000-0000-7000-8000-00000000d001",
      firstTouch: {
        channel: "paid_social",
        utm_source: "instagram",
        landing_path: "/",
        at: "2026-10-01T00:00:00Z",
      },
      lastTouch: {
        channel: "paid_social",
        utm_source: "instagram",
        landing_path: "/",
        at: "2026-10-01T00:00:00Z",
      },
    });
    await db.insert(visitorEvents).values({
      visitorId: visitor,
      type: "whatsapp_click",
      path: "/property/two-bed",
      entityType: "property",
      entityId: listing,
      meta: { ref: "k3f9", label: "HD-2041" },
    });

    const ts = Math.floor(Date.now() / 1000) - 60;
    const res = await post(
      inbound("wamid.in1", "Hello, I'm interested in HD-2041 [HD-2041·k3f9]", ts),
    );
    expect(res.status).toBe(200);

    const [contact] = await db.select().from(contacts);
    expect(contact).toMatchObject({
      name: "Sam Visitor",
      phone: "+971501234567",
      whatsapp: "+971501234567",
    });
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({
      source: "whatsapp",
      sourceDetail: "click",
      propertyIds: [listing],
      agentId: agent,
      visitorId: visitor,
    });
    expect(lead!.firstTouch).toMatchObject({ channel: "paid_social", utm_source: "instagram" });
    const [conv] = await db.select().from(conversations);
    expect(conv).toMatchObject({
      channel: "whatsapp",
      status: "needs_human",
      externalId: wa,
      contactId: contact!.id,
      leadId: lead!.id,
      visitorId: visitor,
      unreadCount: 1,
    });
    expect(conv!.waWindowExpiresAt).toEqual(new Date((ts + 86_400) * 1000));

    // A second message joins the conversation and the timeline; Meta's retries are ignored.
    await post(inbound("wamid.in2", "Is parking included?", ts + 30));
    await post(inbound("wamid.in2", "Is parking included?", ts + 30));
    expect(await db.select().from(leads)).toHaveLength(1);
    expect(await db.select().from(messages)).toHaveLength(2);
    const [after] = await db.select().from(conversations);
    expect(after!.unreadCount).toBe(2);
    const events = await db
      .select({ type: leadEvents.type, body: leadEvents.body })
      .from(leadEvents)
      .orderBy(asc(leadEvents.createdAt));
    expect(events.filter((e) => e.type === "whatsapp_in").map((e) => e.body)).toEqual([
      "Hello, I'm interested in HD-2041 [HD-2041·k3f9]",
      "Is parking included?",
    ]);
  });

  it("replies: free text inside 24 hours, templates outside; statuses never go back; not set up is a clear failure", async () => {
    const db = await getDb();
    const ts = Math.floor(Date.now() / 1000) - 120;
    await post(inbound("wamid.in1", "Hi", ts));
    const [conv] = await db.select().from(conversations);
    const now = new Date();

    const reply = await sendOutgoing(db, {
      conversationId: conv!.id,
      text: "Hello Sam, happy to help.",
      sender: "admin",
      adminId: testAdmin.id,
      now,
    });
    expect(reply.status).toBe("queued");
    await runDueJobs();
    expect(sent).toEqual([{ kind: "text", to: wa, payload: "Hello Sam, happy to help." }]);
    const [msg] = await db.select().from(messages).where(eq(messages.id, reply.messageId));
    expect(msg).toMatchObject({ status: "sent", externalId: "wamid.out1", sender: "admin" });

    // The reply is the lead's first response; the admin now has the conversation.
    const [lead] = await db.select().from(leads);
    expect(lead!.firstResponseAt).toEqual(now);
    const [taken] = await db.select().from(conversations);
    expect(taken).toMatchObject({ status: "human", assignedAdminId: testAdmin.id, unreadCount: 0 });
    expect(
      (await db.select({ type: leadEvents.type }).from(leadEvents)).map((e) => e.type),
    ).toContain("whatsapp_out");

    // Statuses: delivered, read, then a late "delivered" is ignored.
    await post(status("wamid.out1", "delivered"));
    await post(status("wamid.out1", "read"));
    await post(status("wamid.out1", "delivered"));
    expect(
      (await db.select().from(messages).where(eq(messages.id, reply.messageId)))[0]!.status,
    ).toBe("read");

    // Outside the window: free text is refused, a template goes.
    await db.update(conversations).set({ waWindowExpiresAt: new Date(Date.now() - 1000) });
    await expect(
      sendOutgoing(db, {
        conversationId: conv!.id,
        text: "Still there?",
        sender: "admin",
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "WA_WINDOW" });
    const tpl = await sendOutgoing(db, {
      conversationId: conv!.id,
      text: "Thanks, Sam. Layla will reach out shortly.",
      sender: "admin",
      template: {
        key: "lead.auto_reply",
        name: "auto_reply",
        language: "en",
        parameters: ["Sam", "Layla"],
      },
      now: new Date(),
    });
    await runDueJobs();
    expect(sent.at(-1)).toEqual({
      kind: "template",
      to: wa,
      payload: {
        key: "lead.auto_reply",
        name: "auto_reply",
        language: "en",
        parameters: ["Sam", "Layla"],
      },
    });
    await post(status("wamid.out2", "failed", [{ code: 131026, title: "Message undeliverable" }]));
    expect(
      (await db.select().from(messages).where(eq(messages.id, tpl.messageId)))[0],
    ).toMatchObject({
      status: "failed",
      error: "Message undeliverable",
    });

    // WhatsApp not set up: stored as not sent, with the reason; nothing pretends to work.
    setWhatsappClient(null);
    await db.update(conversations).set({ waWindowExpiresAt: new Date(Date.now() + 3_600_000) });
    const off = await sendOutgoing(db, {
      conversationId: conv!.id,
      text: "Hello?",
      sender: "admin",
      now: new Date(),
    });
    await runDueJobs();
    const [failed] = await db.select().from(messages).where(eq(messages.id, off.messageId));
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toMatch(/WhatsApp is not set up/);
  });

  it("pipeline: team notices and the auto-reply on WhatsApp from mapped templates, once", async () => {
    const db = await getDb();
    await patchSettings(
      db,
      "integrations",
      {
        whatsapp: {
          enabled: true,
          phoneNumberId: "123",
          businessAccountId: "",
          displayNumber: "",
          voiceNotes: false,
          templates: {
            "lead.new": { name: "new_lead", language: "en", variables: ["name", "interest"] },
            "lead.auto_reply": { name: "auto_reply", language: "en", variables: ["name", "agent"] },
          },
        },
      },
      actor,
    );
    const agent = newId();
    await db.insert(agents).values({
      id: agent,
      name: "Layla Haddad",
      slug: "layla",
      email: "layla@a.example",
      whatsapp: "+971509990000",
    });
    const { captureLead } = await import("@/features/leads/capture");
    await captureLead(db, {
      source: "form",
      contact: { name: "Rania Saleh", phone: "0507778888" },
      message: "Interested in a villa",
    });
    for (let i = 0; i < 4; i++) await runDueJobs();
    const templates = sent.filter((s) => s.kind === "template");
    expect(templates).toEqual(
      expect.arrayContaining([
        {
          kind: "template",
          to: "971509990000",
          payload: {
            name: "new_lead",
            language: "en",
            parameters: ["Rania Saleh", "General enquiry"],
          },
        },
        {
          kind: "template",
          to: "971507778888",
          payload: {
            key: "lead.auto_reply",
            name: "auto_reply",
            language: "en",
            parameters: ["Rania", "Layla"],
          },
        },
      ]),
    );
    expect(templates).toHaveLength(2);
    // The auto-reply sits in the customer's WhatsApp conversation and on the timeline.
    const [conv] = await db.select().from(conversations);
    expect(conv).toMatchObject({ channel: "whatsapp", externalId: "971507778888" });
    const auto = await db.select().from(leadEvents).where(eq(leadEvents.type, "whatsapp_out"));
    expect(auto[0]!.meta).toMatchObject({ auto: true, template: "lead.auto_reply" });
    // A retried lead job sends nothing again.
    const { leadProcessJob } = await import("@/features/leads/process");
    const [lead] = await db.select().from(leads);
    const [created] = await db.select().from(leadEvents).where(eq(leadEvents.type, "created"));
    await leadProcessJob.run(
      { leadId: lead!.id, eventId: created!.id, isNew: false },
      { db, jobId: newId(), attempt: 2, log: () => {} },
    );
    for (let i = 0; i < 3; i++) await runDueJobs();
    expect(sent.filter((s) => s.kind === "template" && s.to === "971509990000")).toHaveLength(1);
  });
});
