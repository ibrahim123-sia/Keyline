import "server-only";
import { and, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  contacts,
  conversations,
  leadEvents,
  leads,
  messages,
  type conversationChannels,
  type conversationStatuses,
} from "@/db/schema/crm";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import { TemplateEmail } from "@/emails/template-email";
import { markFirstResponse } from "@/features/leads/first-response";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { insideWindow, leadReplyAddress, waId, windowExpiry } from "./rules";

export type Channel = (typeof conversationChannels)[number];
export type ConversationStatus = (typeof conversationStatuses)[number];
type Attachment = { mediaId?: string; url?: string; name: string; mime: string };

const leadEventFor = {
  in: { whatsapp: "whatsapp_in", email: "email_received", web_chat: "chat" },
  out: { whatsapp: "whatsapp_out", email: "email_sent", web_chat: "chat" },
} as const;

/** The open (not closed) conversation on a channel for a contact or an outside id, if any. */
export async function findOpenConversation(
  db: DbOrTx,
  input: { channel: Channel; contactId?: string | null; externalId?: string | null },
) {
  const who: SQL[] = [];
  if (input.contactId) who.push(eq(conversations.contactId, input.contactId));
  if (input.externalId) who.push(eq(conversations.externalId, input.externalId));
  if (who.length === 0) return null;
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.agencyId, currentAgencyId()),
        eq(conversations.channel, input.channel),
        ne(conversations.status, "closed"),
        or(...who),
      ),
    )
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(1);
  return row ?? null;
}

/** The open conversation, or a new one (status "needs_human" until the AI arrives in Phase 9). */
export async function ensureConversation(
  db: DbOrTx,
  input: {
    channel: Channel;
    contactId: string | null;
    leadId?: string | null;
    visitorId?: string | null;
    externalId?: string | null;
    subject?: string | null;
    status?: ConversationStatus;
    now: Date;
  },
) {
  const open = await findOpenConversation(db, input);
  if (open) {
    if ((!open.leadId && input.leadId) || (!open.contactId && input.contactId)) {
      const [updated] = await db
        .update(conversations)
        .set({
          leadId: open.leadId ?? input.leadId ?? null,
          contactId: open.contactId ?? input.contactId ?? null,
        })
        .where(eq(conversations.id, open.id))
        .returning();
      return updated!;
    }
    return open;
  }
  const [created] = await db
    .insert(conversations)
    .values({
      channel: input.channel,
      contactId: input.contactId,
      leadId: input.leadId ?? null,
      visitorId: input.visitorId ?? null,
      externalId: input.externalId ?? null,
      subject: input.subject ?? null,
      status: input.status ?? "needs_human",
      createdAt: input.now,
    })
    .returning();
  return created!;
}

/** Adds a customer's message and bumps the conversation (unread, WhatsApp window). */
export async function addIncoming(
  db: DbOrTx,
  input: {
    conversationId: string;
    body: string;
    attachments?: Attachment[];
    externalId?: string | null;
    at: Date;
    /** False when the lead pipeline already put this message on the timeline. */
    leadEvent?: boolean;
  },
): Promise<string> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId));
  if (!conv) throw new Error("conversation not found");
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: "in",
      sender: "customer",
      body: input.body,
      attachments: input.attachments ?? [],
      externalId: input.externalId ?? null,
      status: "delivered",
      createdAt: input.at,
    })
    .returning({ id: messages.id });
  await db
    .update(conversations)
    .set({
      lastMessageAt: sql`greatest(coalesce(${conversations.lastMessageAt}, ${input.at.toISOString()}::timestamptz), ${input.at.toISOString()}::timestamptz)`,
      unreadCount: sql`${conversations.unreadCount} + 1`,
      ...(conv.channel === "whatsapp" ? { waWindowExpiresAt: windowExpiry(input.at) } : {}),
    })
    .where(eq(conversations.id, conv.id));
  if (conv.leadId && input.leadEvent !== false) {
    await db.insert(leadEvents).values({
      leadId: conv.leadId,
      type: leadEventFor.in[conv.channel],
      body: input.body || null,
      meta: { conversationId: conv.id, messageId: msg!.id },
      actorType: "customer",
      createdAt: input.at,
    });
    await db.update(leads).set({ lastActivityAt: input.at }).where(eq(leads.id, conv.leadId));
  }
  return msg!.id;
}

export type OutgoingTemplate = {
  /** Our template key (lead.auto_reply …) or "custom" for one an admin picked. */
  key: string;
  name: string;
  language: string;
  parameters: string[];
};

/**
 * Sends on the conversation's channel: WhatsApp and email are queued (jobs with retries and
 * stored status), web chat is shown at the next poll. A reply from a person or the AI is the
 * lead's first response and goes on its timeline; an admin replying takes the conversation
 * over from the AI.
 */
export async function sendOutgoing(
  db: DbOrTx,
  input: {
    conversationId: string;
    text: string;
    sender: "admin" | "ai" | "system";
    adminId?: string | null;
    template?: OutgoingTemplate | null;
    image?: { link: string; caption: string } | null;
    toolCalls?: Array<{ tool: string; summary: string }>;
    now: Date;
  },
): Promise<{ messageId: string; status: "queued" | "sent" }> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.agencyId, currentAgencyId()),
      ),
    );
  if (!conv) throw new ActionError("This conversation no longer exists.", "NOT_FOUND");
  const [contact] = conv.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, conv.contactId))
    : [];

  let status: "queued" | "sent" = "queued";
  let externalId: string | null = null;
  if (conv.channel === "whatsapp") {
    const to =
      conv.externalId ??
      (contact?.whatsapp || contact?.phone ? waId((contact.whatsapp || contact.phone)!) : null);
    if (!to) throw new ActionError("This conversation has no WhatsApp number.", "VALIDATION");
    if (!input.template && !insideWindow(conv.waWindowExpiresAt, input.now))
      throw new ActionError(
        "More than 24 hours since their last message: WhatsApp only allows an approved template now.",
        "WA_WINDOW",
      );
  } else if (conv.channel === "email") {
    if (!contact?.email) throw new ActionError("This contact has no email address.", "VALIDATION");
    const [general, integrations] = [
      await loadSettings("general", db),
      await loadSettings("integrations", db),
    ];
    const brand = await loadEmailBrand(db);
    const { html, text } = await renderEmail(
      createElement(TemplateEmail, { brand, preview: input.text.slice(0, 120), body: input.text }),
    );
    const subject = conv.subject
      ? /^re:/i.test(conv.subject)
        ? conv.subject
        : `Re: ${conv.subject}`
      : `A message from ${general.agencyName}`;
    const emailId = await queueEmail(
      {
        to: contact.email,
        subject,
        template: "inbox.reply",
        html,
        text,
        replyTo:
          (conv.leadId && leadReplyAddress(conv.leadId, integrations.resend.inboundDomain)) ||
          undefined,
        related: { type: "conversation", id: conv.id },
      },
      db,
    );
    externalId = `email:${emailId}`;
  } else {
    status = "sent";
  }

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: "out",
      sender: input.sender,
      senderAdminId: input.adminId ?? null,
      body: input.text,
      attachments: input.image ? [{ url: input.image.link, name: "photo", mime: "image/*" }] : [],
      toolCalls: input.toolCalls ?? [],
      status,
      externalId,
      createdAt: input.now,
    })
    .returning({ id: messages.id });
  if (conv.channel === "whatsapp")
    await enqueue(
      "whatsapp.send",
      {
        messageId: msg!.id,
        template: input.template ?? null,
        image: input.image ?? null,
      },
      { db, dedupeKey: `wa:${msg!.id}` },
    );

  const takesOver =
    input.sender === "admin" && (conv.status === "ai" || conv.status === "needs_human");
  await db
    .update(conversations)
    .set({
      lastMessageAt: input.now,
      ...(input.sender === "admin" ? { unreadCount: 0 } : {}),
      ...(takesOver ? { status: "human", assignedAdminId: input.adminId ?? null } : {}),
    })
    .where(eq(conversations.id, conv.id));

  if (conv.leadId && input.sender !== "system") {
    await markFirstResponse(db, conv.leadId, input.now);
    await db.insert(leadEvents).values({
      leadId: conv.leadId,
      type: leadEventFor.out[conv.channel],
      body: input.text,
      meta: {
        conversationId: conv.id,
        messageId: msg!.id,
        ...(input.template ? { template: input.template.key } : {}),
      },
      actorType: input.sender,
      actorId: input.adminId ?? null,
      createdAt: input.now,
    });
    await db.update(leads).set({ lastActivityAt: input.now }).where(eq(leads.id, conv.leadId));
  }
  return { messageId: msg!.id, status };
}

/**
 * A lead's conversation for the inbox (09 §6, "?lead=<id>"): WhatsApp when they have a number,
 * else email; created when there is none yet.
 */
export async function leadConversation(db: DbOrTx, leadId: string, now: Date, prefer?: Channel) {
  const [lead] = await db
    .select({ id: leads.id, contactId: leads.contactId, visitorId: leads.visitorId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.agencyId, currentAgencyId())));
  if (!lead) return null;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
  if (!contact) return null;
  const number = contact.whatsapp || contact.phone;
  const channel: Channel | null =
    prefer && (prefer !== "whatsapp" || number) && (prefer !== "email" || contact.email)
      ? prefer
      : number
        ? "whatsapp"
        : contact.email
          ? "email"
          : null;
  if (!channel) return null;
  const general = await loadSettings("general", db);
  return ensureConversation(db, {
    channel,
    contactId: contact.id,
    leadId: lead.id,
    visitorId: channel === "web_chat" ? lead.visitorId : null,
    externalId: channel === "whatsapp" ? waId(number!) : null,
    subject: channel === "email" ? `Your enquiry with ${general.agencyName}` : null,
    status: "human",
    now,
  });
}
