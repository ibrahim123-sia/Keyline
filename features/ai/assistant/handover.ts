import "server-only";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, conversations, leadEvents, leads } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import {
  agencyInbox,
  agencyWhatsapp,
  sendTemplate,
  whatsappNotices,
} from "@/features/leads/process";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";

/**
 * Hand-over to a person (10 §2): the conversation waits for the team ("needs_human", the
 * assistant stops answering), and the lead's agent and the agency's lead inbox hear about it
 * once (Settings -> Notifications, "new lead" row). The name returned goes into the reply:
 * "I've asked [agent] to reply to you."
 */

export const inboxUrl = (conversationId: string) => siteUrl(`/admin/inbox?c=${conversationId}`);

export type HandoverResult = { agentName: string | null; alreadyWaiting: boolean };

export async function handOver(
  db: DbOrTx,
  input: { conversationId: string; reason: string; now?: Date },
): Promise<HandoverResult> {
  const now = input.now ?? new Date();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.agencyId, currentAgencyId()),
      ),
    );
  if (!conv) return { agentName: null, alreadyWaiting: false };

  const [lead] = conv.leadId
    ? await db
        .select({ id: leads.id, agentId: leads.agentId })
        .from(leads)
        .where(eq(leads.id, conv.leadId))
    : [];
  const [agent] = lead?.agentId
    ? await db
        .select({
          name: agents.name,
          email: agents.email,
          whatsapp: agents.whatsapp,
          isActive: agents.isActive,
        })
        .from(agents)
        .where(eq(agents.id, lead.agentId))
    : [];
  const activeAgent = agent?.isActive ? agent : null;
  const agentName = activeAgent?.name.split(/\s+/)[0] ?? null;

  // A person already has it (taken over or waiting): nothing more to send.
  if (conv.status === "needs_human" || conv.status === "human" || conv.status === "closed")
    return { agentName, alreadyWaiting: true };

  await db
    .update(conversations)
    .set({ status: "needs_human" })
    .where(eq(conversations.id, conv.id));
  if (lead)
    await db.insert(leadEvents).values({
      leadId: lead.id,
      type: "note",
      body: `The assistant handed the chat over to the team: ${input.reason}`,
      meta: { conversationId: conv.id, handover: true },
      actorType: "ai",
      createdAt: now,
    });

  const [contact] = conv.contactId
    ? await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, conv.contactId))
    : [];
  const notifications = await loadSettings("notifications", db);
  const to: string[] = [];
  if (notifications.admins.newLead.email) to.push(...(await agencyInbox(db)));
  if (notifications.agents.newLead.email && activeAgent?.email) to.push(activeAgent.email);
  const numbers: string[] = [];
  if (notifications.admins.newLead.whatsapp) numbers.push(...(await agencyWhatsapp(db)));
  if (notifications.agents.newLead.whatsapp && activeAgent?.whatsapp)
    numbers.push(activeAgent.whatsapp);
  const url = inboxUrl(conv.id);
  const vars = {
    name: contact?.name ?? "A website visitor",
    channel: conv.channel === "whatsapp" ? "WhatsApp chat" : "website chat",
    reason: input.reason,
    agent: activeAgent?.name ?? "Not assigned yet",
    url,
  };
  // One notice per hand-over: a conversation handed back to the assistant can hand over again.
  const related = { type: "handover", id: `${conv.id}:${now.getTime()}` };
  await whatsappNotices(db, "chat.handover", numbers, vars, `handover:${related.id}`);
  await sendTemplate(db, "chat.handover", to, vars, url, related);
  return { agentName, alreadyWaiting: false };
}
