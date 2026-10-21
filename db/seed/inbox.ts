import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../client";
import {
  approvalQueue,
  contacts,
  conversations,
  leads,
  messages,
  quickReplies,
} from "../schema/crm";

/**
 * Demo inbox (16 §1): WhatsApp, web chat and email conversations with demo contacts, quick
 * replies and one draft waiting for approval. Contacts are found by email or phone (the leads
 * seed may have made them) or created. Rows are written directly: seeding sends nothing.
 */
const MIN = 60_000;

type Person = { name: string; email?: string; phone?: string };

async function person(db: Db, p: Person): Promise<{ contactId: string; leadId: string | null }> {
  const match = [
    ...(p.email ? [eq(contacts.email, p.email)] : []),
    ...(p.phone ? [eq(contacts.phone, p.phone)] : []),
  ];
  let [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(isNull(contacts.mergedIntoId), or(...match)))
    .orderBy(asc(contacts.createdAt))
    .limit(1);
  if (!row)
    [row] = await db
      .insert(contacts)
      .values({
        name: p.name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        whatsapp: p.phone ?? null,
        preferredContact: p.phone ? "whatsapp" : "email",
      })
      .returning({ id: contacts.id });
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.contactId, row!.id), eq(leads.status, "open")))
    .limit(1);
  return { contactId: row!.id, leadId: lead?.id ?? null };
}

type Line = {
  dir: "in" | "out";
  sender: "customer" | "ai" | "admin" | "system";
  body: string;
  ago: number;
  status?: "sent" | "delivered" | "read";
  tools?: Array<{ tool: string; summary: string }>;
};

async function conversation(
  db: Db,
  now: Date,
  input: {
    channel: "whatsapp" | "web_chat" | "email";
    who: Person;
    status: "ai" | "needs_human" | "human" | "closed";
    subject?: string;
    lines: Line[];
  },
) {
  const { contactId, leadId } = await person(db, input.who);
  const at = (ago: number) => new Date(now.getTime() - ago * MIN);
  const lastIn = input.lines.filter((l) => l.dir === "in").at(-1);
  const lastOut = input.lines.filter((l) => l.dir === "out").at(-1);
  const unread = lastIn && (!lastOut || lastIn.ago < lastOut.ago) ? 1 : 0;
  const [conv] = await db
    .insert(conversations)
    .values({
      channel: input.channel,
      contactId,
      leadId,
      status: input.status,
      subject: input.subject ?? null,
      externalId: input.channel === "whatsapp" ? input.who.phone!.replace(/\D/g, "") : null,
      lastMessageAt: at(Math.min(...input.lines.map((l) => l.ago))),
      unreadCount: unread,
      waWindowExpiresAt:
        input.channel === "whatsapp" && lastIn
          ? new Date(at(lastIn.ago).getTime() + 24 * 60 * MIN)
          : null,
      createdAt: at(Math.max(...input.lines.map((l) => l.ago))),
    })
    .returning({ id: conversations.id });
  for (const l of input.lines)
    await db.insert(messages).values({
      conversationId: conv!.id,
      direction: l.dir,
      sender: l.sender,
      body: l.body,
      toolCalls: l.tools ?? [],
      status: l.status ?? (l.dir === "in" ? "delivered" : "sent"),
      createdAt: at(l.ago),
    });
  return conv!.id;
}

export async function seedInbox(db: Db, options: { now: Date }): Promise<void> {
  const { now } = options;
  await db.insert(quickReplies).values([
    {
      title: "Viewing times",
      body: "We show homes every day from 9 am to 7 pm. Which day and time suit you?",
      sortOrder: 0,
    },
    {
      title: "Documents to rent",
      body: "To rent you will need a passport copy, visa and Emirates ID, and the first cheque or transfer.",
      sortOrder: 1,
    },
    {
      title: "Service charges",
      body: "Service charges are set by the building each year. I will send you this year's figure with the listing.",
      sortOrder: 2,
    },
    {
      title: "Payment plans",
      body: "Most of our off-plan projects take 10 to 20% on booking and the rest in stages. Shall I send the plan?",
      sortOrder: 3,
    },
  ]);

  await conversation(db, now, {
    channel: "whatsapp",
    who: { name: "Amira Haddad", phone: "+971501230001" },
    status: "human",
    lines: [
      {
        dir: "in",
        sender: "customer",
        body: "Hi, is the two bed at Marina Gate still available?",
        ago: 130,
      },
      {
        dir: "out",
        sender: "admin",
        body: "Hello Amira, yes it is. Would you like to see it this week?",
        ago: 118,
        status: "read",
      },
      { dir: "in", sender: "customer", body: "Saturday morning works for me.", ago: 32 },
    ],
  });
  await conversation(db, now, {
    channel: "web_chat",
    who: { name: "Priya Nair", email: "priya.nair@example.com" },
    status: "needs_human",
    lines: [
      {
        dir: "in",
        sender: "customer",
        body: "Do you have family villas with a garden under 5M?",
        ago: 12,
      },
    ],
  });
  await conversation(db, now, {
    channel: "email",
    who: { name: "James Carter", email: "james.carter@example.com" },
    status: "human",
    subject: "Service charges for the Linden Residences",
    lines: [
      {
        dir: "in",
        sender: "customer",
        body: "Could you tell me the service charge per square metre?",
        ago: 60 * 26,
      },
      {
        dir: "out",
        sender: "admin",
        body: "Hello James, this year's charge is in the attached note; I have also sent the payment plan.",
        ago: 60 * 25,
      },
    ],
  });
  const negotiating = await conversation(db, now, {
    channel: "whatsapp",
    who: { name: "Omar Saeed", phone: "+971501230002" },
    status: "ai",
    lines: [
      {
        dir: "in",
        sender: "customer",
        body: "Would the owner take 2.3M for the townhouse?",
        ago: 8,
      },
      {
        dir: "out",
        sender: "ai",
        body: "Thanks Omar. I have asked the agent about the price; they will reply shortly.",
        ago: 7,
        tools: [{ tool: "search_listings", summary: "Found the townhouse he asked about" }],
      },
    ],
  });
  await db.insert(approvalQueue).values({
    conversationId: negotiating,
    draftReply:
      "The owner has accepted offers near the asking price before; 2.3M may be considered with a quick transfer.",
    reason: "price negotiation",
    createdAt: new Date(now.getTime() - 6 * MIN),
  });
}
