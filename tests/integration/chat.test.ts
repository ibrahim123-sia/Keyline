import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations, leadEvents, leads, messages, visitors } from "@/db/schema/crm";
import { sendChatMessage, startChat } from "@/features/chat/actions";
import { sendOutgoing } from "@/features/inbox/store";
import { patchSettings } from "@/features/settings/mutations";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

const VID = "0192f000-0000-7000-8000-00000000e001";
const jar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n in jar ? { name: n, value: jar[n] } : undefined),
  }),
  headers: async () => new Headers({ "cf-connecting-ip": "203.0.113.9" }),
}));
vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function poll(after?: string) {
  const { GET } = await import("@/app/api/chat/route");
  const res = await GET(
    new Request(`http://localhost/api/chat${after ? `?after=${encodeURIComponent(after)}` : ""}`, {
      headers: { cookie: `vid=${VID}` },
    }),
  );
  return (await res.json()) as {
    enabled: boolean;
    conversation: { id: string } | null;
    messages: Array<{ mine: boolean; body: string; createdAt: string }>;
  };
}

describe("website chat (09 §1 #3)", () => {
  beforeEach(async () => {
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "visitors",
      "conversations",
      "messages",
      "settings",
      "rate_limits",
      "job_runs",
      "audit_log",
    );
    jar.vid = VID;
    await patchSettings(await getDb(), "market", { phoneCountryCode: "+971" }, actor);
  });

  it("off until Settings turns it on; then contact details first, a lead and a conversation", async () => {
    const db = await getDb();
    const first = {
      name: "Mina Park",
      email: "mina@example.com",
      phone: "",
      message: "Any three beds in the marina?",
    };
    expect(await startChat(first)).toMatchObject({ ok: false, code: "OFF" });
    expect((await poll()).enabled).toBe(false);

    await patchSettings(db, "ai", { webChat: { enabled: true, askContactFirst: true } }, actor);
    expect(await startChat({ message: "Hello" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { name: expect.any(Array), email: expect.any(Array) },
    });
    // Bots fill the hidden field: same answer, nothing stored.
    expect(await startChat({ ...first, website: "https://spam.example" })).toMatchObject({
      ok: true,
    });
    expect(await db.select().from(conversations)).toHaveLength(0);

    const res = await startChat(first);
    expect(res.ok).toBe(true);
    const [visitor] = await db.select().from(visitors);
    const [conv] = await db.select().from(conversations);
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ source: "chat", visitorId: visitor!.id });
    expect(conv).toMatchObject({
      channel: "web_chat",
      status: "needs_human",
      externalId: visitor!.id,
      visitorId: visitor!.id,
      leadId: lead!.id,
      unreadCount: 1,
    });

    expect(await sendChatMessage({ text: "Budget around 3M." })).toMatchObject({ ok: true });
    const events = await db
      .select({ body: leadEvents.body })
      .from(leadEvents)
      .where(eq(leadEvents.type, "chat"));
    expect(events.map((e) => e.body)).toEqual([
      "Any three beds in the marina?",
      "Budget around 3M.",
    ]);

    // The visitor sees their messages, then the team's reply arrives at the next poll.
    const before = await poll();
    expect(before.messages.map((m) => [m.mine, m.body])).toEqual([
      [true, "Any three beds in the marina?"],
      [true, "Budget around 3M."],
    ]);
    await sendOutgoing(db, {
      conversationId: conv!.id,
      text: "Yes, two. Shall I send them?",
      sender: "admin",
      now: new Date(Date.now() + 1000),
    });
    const after = await poll(before.messages.at(-1)!.createdAt);
    expect(after.messages.map((m) => [m.mine, m.body])).toEqual([
      [false, "Yes, two. Shall I send them?"],
    ]);
    expect((await db.select().from(messages)).length).toBe(3);
  });

  it("without asking for details first: an anonymous chat, no lead; no cookie, no chat", async () => {
    const db = await getDb();
    await patchSettings(db, "ai", { webChat: { enabled: true, askContactFirst: false } }, actor);
    expect(await startChat({ message: "Just looking" })).toMatchObject({ ok: true });
    expect(await db.select().from(leads)).toHaveLength(0);
    const [conv] = await db.select().from(conversations);
    expect(conv).toMatchObject({ leadId: null, contactId: null, status: "needs_human" });
    delete jar.vid;
    expect(await sendChatMessage({ text: "Hello?" })).toMatchObject({
      ok: false,
      code: "NO_VISITOR",
    });
  });
});
