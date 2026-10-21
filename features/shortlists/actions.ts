"use server";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leads } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { renderTemplateEmail } from "@/features/messages/render";
import { queueEmail } from "@/features/notifications/email";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { timelineActor } from "@/features/leads/stage";
import { createShortlist } from "./store";

/**
 * Send properties (09 §4): the picked live homes become a personal link (/s/<token>) that is
 * emailed to the lead when they have an email address; the link can be copied either way.
 */
export const sendShortlist = adminAction(
  z
    .object({
      leadId: z.uuid(),
      propertyIds: z
        .array(z.uuid())
        .min(1, "Pick at least one home")
        .max(12, "Pick at most 12 homes"),
      message: z.string().trim().max(2000).default(""),
      email: z.boolean().default(true),
    })
    .strict(),
  { write: true },
  async ({ leadId, propertyIds, message, email }, ctx) => {
    const db = await getDb();
    const agency = currentAgencyId();
    const [lead] = await db
      .select({ id: leads.id, contactId: leads.contactId, agentId: leads.agentId })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.agencyId, agency), isNull(leads.mergedIntoId)));
    if (!lead) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
    const ids = [...new Set(propertyIds)];
    const live = await db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          inArray(properties.id, ids),
          eq(properties.agencyId, agency),
          isNull(properties.deletedAt),
          isNotNull(properties.publishedAt),
          inArray(properties.status, [...liveStatuses]),
        ),
      );
    const liveIds = ids.filter((id) => live.some((l) => l.id === id));
    if (liveIds.length === 0)
      throw new ActionError("None of these homes is listed any more.", "NOT_LIVE");
    const now = new Date();
    const created = await db.transaction(async (tx) => {
      const row = await createShortlist(tx, {
        leadId,
        propertyIds: liveIds,
        message: message || null,
        actor: timelineActor(ctx.actor),
        now,
      });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead.shortlist",
        entityType: "lead",
        entityId: leadId,
        after: { shortlistId: row.id, propertyIds: liveIds },
      });
      return row;
    });
    const url = siteUrl(`/s/${created.token}`);

    let emailed = false;
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
    if (email && contact?.email) {
      const [agent] = lead.agentId
        ? await db
            .select({ name: agents.name, email: agents.email })
            .from(agents)
            .where(eq(agents.id, lead.agentId))
        : [];
      const general = await loadSettings("general", db);
      const mail = await renderTemplateEmail(
        db,
        "shortlist.sent",
        {
          name: contact.name.split(/\s+/)[0] ?? contact.name,
          agent: agent?.name ?? ctx.user.name,
          agency: general.agencyName,
          homes: liveIds.length === 1 ? "1 home" : `${liveIds.length} homes`,
          message: message || null,
          url,
        },
        url,
      );
      if (mail) {
        await queueEmail(
          {
            to: contact.email,
            subject: mail.subject,
            template: "shortlist.sent",
            html: mail.html,
            text: mail.text,
            replyTo: agent?.email ?? ctx.user.email,
            related: { type: "lead", id: leadId },
          },
          db,
        );
        emailed = true;
      }
    }
    return {
      url,
      token: created.token,
      count: liveIds.length,
      skipped: ids.length - liveIds.length,
      emailed,
    };
  },
);
