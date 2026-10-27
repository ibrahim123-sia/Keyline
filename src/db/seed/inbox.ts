import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { Db } from "../client";
import type { SeedInbox, SeedInboxLine } from "./types";
import {
  approvalQueue,
  contacts,
  conversations,
  leads,
  messages,
  quickReplies,
} from "../schema/crm";

/**
 * Demo inbox (16 §1): the preset's WhatsApp, web chat and email conversations with demo
 * contacts, quick replies and drafts waiting for approval. Contacts are found by email or phone (the leads
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

type Line = SeedInboxLine;

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

export async function seedInbox(db: Db, options: { now: Date; inbox: SeedInbox }): Promise<void> {
  const { now, inbox } = options;
  if (inbox.quickReplies.length)
    await db
      .insert(quickReplies)
      .values(inbox.quickReplies.map((q, sortOrder) => ({ ...q, sortOrder })));
  for (const c of inbox.conversations) {
    const id = await conversation(db, now, c);
    if (c.approval)
      await db.insert(approvalQueue).values({
        conversationId: id,
        draftReply: c.approval.draftReply,
        reason: c.approval.reason,
        createdAt: new Date(now.getTime() - c.approval.ago * MIN),
      });
  }
}
