import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leadEvents, leads, shortlists } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { bytesToBase64Url } from "@/lib/crypto";

/** "Send properties" (09 §4): a personal shortlist link for a lead, opens tracked. */

export const newShortlistToken = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const TOKEN = /^[A-Za-z0-9_-]{20,40}$/;

/** The shortlist behind a link, with who it is for and from; null for unknown links. */
export async function loadShortlist(db: DbOrTx, token: string) {
  if (!TOKEN.test(token)) return null;
  const [row] = await db
    .select({
      id: shortlists.id,
      leadId: shortlists.leadId,
      title: shortlists.title,
      message: shortlists.message,
      propertyIds: shortlists.propertyIds,
      createdAt: shortlists.createdAt,
      contactName: contacts.name,
      agentName: agents.name,
      agentPhone: agents.phone,
      agentWhatsapp: agents.whatsapp,
      agentEmail: agents.email,
    })
    .from(shortlists)
    .innerJoin(leads, eq(leads.id, shortlists.leadId))
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(agents, eq(agents.id, leads.agentId))
    .where(and(eq(shortlists.token, token), eq(shortlists.agencyId, currentAgencyId())));
  return row ?? null;
}

/** One more open of the link (the lead page shows opens and when). */
export async function recordShortlistOpen(db: DbOrTx, token: string, now = new Date()) {
  const iso = now.toISOString();
  const [row] = await db
    .update(shortlists)
    .set({
      openCount: sql`${shortlists.openCount} + 1`,
      firstOpenedAt: sql`coalesce(${shortlists.firstOpenedAt}, ${iso}::timestamptz)`,
      lastOpenedAt: now,
    })
    .where(and(eq(shortlists.token, token), eq(shortlists.agencyId, currentAgencyId())))
    .returning({ leadId: shortlists.leadId });
  if (row) await db.update(leads).set({ lastActivityAt: now }).where(eq(leads.id, row.leadId));
  return Boolean(row);
}

/** They opened one of the homes on it; only homes on the list count. */
export async function recordShortlistView(db: DbOrTx, token: string, propertyId: string) {
  const res = await db.execute(sql`
    update shortlists
    set viewed_property_ids = array_append(viewed_property_ids, ${propertyId}::uuid)
    where token = ${token} and agency_id = ${currentAgencyId()}
      and ${propertyId}::uuid = any(property_ids)
      and not (${propertyId}::uuid = any(viewed_property_ids))
    returning id`);
  return res.rows.length > 0;
}

/** Saves a shortlist for a lead and puts it on the timeline. */
export async function createShortlist(
  tx: DbOrTx,
  input: {
    leadId: string;
    propertyIds: string[];
    message: string | null;
    actor: { actorType: "admin" | "ai" | "system"; actorId: string | null };
    now: Date;
  },
) {
  const token = newShortlistToken();
  const [row] = await tx
    .insert(shortlists)
    .values({
      leadId: input.leadId,
      token,
      message: input.message,
      propertyIds: input.propertyIds,
      sentAt: input.now,
      createdBy: input.actor.actorId,
    })
    .returning({ id: shortlists.id });
  await tx.insert(leadEvents).values({
    leadId: input.leadId,
    type: "property_sent",
    body: input.message,
    meta: { shortlistId: row!.id, count: input.propertyIds.length, propertyIds: input.propertyIds },
    ...input.actor,
    createdAt: input.now,
  });
  await tx.update(leads).set({ lastActivityAt: input.now }).where(eq(leads.id, input.leadId));
  return { id: row!.id, token };
}

/** The lead page's list of what was sent and how it was received. */
export async function leadShortlists(db: DbOrTx, leadId: string) {
  const rows = await db
    .select()
    .from(shortlists)
    .where(eq(shortlists.leadId, leadId))
    .orderBy(desc(shortlists.createdAt));
  const ids = [...new Set(rows.flatMap((r) => r.propertyIds))];
  const refs = ids.length
    ? await db
        .select({ id: properties.id, reference: properties.reference })
        .from(properties)
        .where(inArray(properties.id, ids))
    : [];
  const refOf = new Map(refs.map((r) => [r.id, r.reference]));
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    createdAt: r.createdAt.toISOString(),
    count: r.propertyIds.length,
    references: r.propertyIds.map((id) => refOf.get(id) ?? "—"),
    viewed: r.viewedPropertyIds.map((id) => refOf.get(id) ?? "—"),
    openCount: r.openCount,
    lastOpenedAt: r.lastOpenedAt?.toISOString() ?? null,
  }));
}
