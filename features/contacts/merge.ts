import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  contacts,
  conversations,
  leadEvents,
  leads,
  leadTasks,
  listingRequests,
  newsletterSubscribers,
  shortlists,
  valuationRequests,
  viewings,
  visitors,
  type Touch,
} from "@/db/schema/crm";
import { mergeRequirements } from "@/features/leads/requirements";
import { refreshNextTask, timelineActor } from "@/features/leads/stage";
import { ActionError } from "@/lib/actions";
import { writeAudit, type AuditActor } from "@/lib/audit";

/** Contact fields the merge picker offers, one value from either side (09 §4 Contacts). */
export const mergeableContactFields = [
  "name",
  "email",
  "phone",
  "whatsapp",
  "nationality",
  "preferredContact",
  "preferredLanguage",
] as const;
export type MergeableContactField = (typeof mergeableContactFields)[number];

/**
 * Merges `otherId` into `keepId`: the picked value of each field, tags together, consent if
 * either agreed; their leads, viewings, conversations and requests move to the kept contact,
 * and the other is marked merged (kept for the record, never matched again).
 */
export async function mergeContacts(
  tx: DbOrTx,
  input: {
    keepId: string;
    otherId: string;
    pick: Partial<Record<MergeableContactField, "keep" | "other">>;
    actor: AuditActor;
  },
): Promise<void> {
  if (input.keepId === input.otherId)
    throw new ActionError("Choose two different contacts.", "VALIDATION");
  const agency = currentAgencyId();
  const rows = await tx
    .select()
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, [input.keepId, input.otherId]),
        eq(contacts.agencyId, agency),
        isNull(contacts.mergedIntoId),
      ),
    );
  const keep = rows.find((r) => r.id === input.keepId);
  const other = rows.find((r) => r.id === input.otherId);
  if (!keep || !other)
    throw new ActionError("One of these contacts no longer exists.", "NOT_FOUND");

  const next: Record<string, unknown> = {};
  for (const field of mergeableContactFields) {
    const choice = input.pick[field] ?? (keep[field] ? "keep" : "other");
    next[field] =
      choice === "other" ? (other[field] ?? keep[field]) : (keep[field] ?? other[field]);
  }
  const consent = keep.marketingConsent || other.marketingConsent;
  const consentAt = [keep.marketingConsentAt, other.marketingConsentAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const tags = [...new Set([...keep.tags, ...other.tags])];

  await tx
    .update(contacts)
    .set({ mergedIntoId: keep.id, updatedBy: input.actor.id })
    .where(eq(contacts.id, other.id));
  await tx
    .update(contacts)
    .set({
      ...(next as Partial<typeof contacts.$inferInsert>),
      tags,
      marketingConsent: consent,
      marketingConsentAt: consent ? (consentAt ?? new Date()) : null,
      userId: keep.userId ?? other.userId,
      notes: [keep.notes, other.notes].filter(Boolean).join("\n\n") || null,
      updatedBy: input.actor.id,
    })
    .where(eq(contacts.id, keep.id));
  await tx.update(leads).set({ contactId: keep.id }).where(eq(leads.contactId, other.id));
  await tx.update(viewings).set({ contactId: keep.id }).where(eq(viewings.contactId, other.id));
  await tx
    .update(valuationRequests)
    .set({ contactId: keep.id })
    .where(eq(valuationRequests.contactId, other.id));
  await tx
    .update(listingRequests)
    .set({ contactId: keep.id })
    .where(eq(listingRequests.contactId, other.id));
  await tx
    .update(conversations)
    .set({ contactId: keep.id })
    .where(eq(conversations.contactId, other.id));
  await tx
    .update(newsletterSubscribers)
    .set({ contactId: keep.id })
    .where(eq(newsletterSubscribers.contactId, other.id));
  await tx
    .update(contacts)
    .set({ mergedIntoId: keep.id })
    .where(eq(contacts.mergedIntoId, other.id));

  await writeAudit(tx, {
    actor: input.actor,
    action: "contact.merge",
    entityType: "contact",
    entityId: keep.id,
    before: {
      keep: Object.fromEntries(mergeableContactFields.map((f) => [f, keep[f]])),
      other: {
        id: other.id,
        ...Object.fromEntries(mergeableContactFields.map((f) => [f, other[f]])),
      },
    },
    after: next,
  });
}

const earliest = (touches: Array<Touch | null>) =>
  touches.filter((t): t is Touch => Boolean(t)).sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
const latest = (touches: Array<Touch | null>) =>
  touches.filter((t): t is Touch => Boolean(t)).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

/**
 * Merges leads into one (09 §4 bulk "merge"): their timeline, tasks, viewings, shortlists,
 * conversations and visitors move to the kept lead; interest and requirements join (the
 * kept lead's answers win); the earliest touch stays first and the latest last.
 */
export async function mergeLeads(
  tx: DbOrTx,
  input: { keepId: string; otherIds: string[]; actor: AuditActor; now: Date },
): Promise<number> {
  const otherIds = [...new Set(input.otherIds.filter((id) => id !== input.keepId))];
  if (otherIds.length === 0)
    throw new ActionError("Choose at least two leads to merge.", "VALIDATION");
  const agency = currentAgencyId();
  const rows = await tx
    .select()
    .from(leads)
    .where(
      and(
        inArray(leads.id, [input.keepId, ...otherIds]),
        eq(leads.agencyId, agency),
        isNull(leads.mergedIntoId),
      ),
    );
  const keep = rows.find((r) => r.id === input.keepId);
  const others = rows.filter((r) => r.id !== input.keepId);
  if (!keep || others.length !== otherIds.length)
    throw new ActionError(
      "One of these leads no longer exists or was merged already.",
      "NOT_FOUND",
    );

  let requirements = keep.requirements;
  for (const o of others) requirements = mergeRequirements(requirements, o.requirements);
  const all = [keep, ...others];
  const firstResponse = all
    .map((l) => l.firstResponseAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  await tx.update(leadEvents).set({ leadId: keep.id }).where(inArray(leadEvents.leadId, otherIds));
  await tx.update(leadTasks).set({ leadId: keep.id }).where(inArray(leadTasks.leadId, otherIds));
  await tx.update(shortlists).set({ leadId: keep.id }).where(inArray(shortlists.leadId, otherIds));
  await tx.update(viewings).set({ leadId: keep.id }).where(inArray(viewings.leadId, otherIds));
  await tx
    .update(conversations)
    .set({ leadId: keep.id })
    .where(inArray(conversations.leadId, otherIds));
  await tx.update(visitors).set({ leadId: keep.id }).where(inArray(visitors.leadId, otherIds));
  await tx
    .update(valuationRequests)
    .set({ leadId: keep.id })
    .where(inArray(valuationRequests.leadId, otherIds));
  await tx
    .update(listingRequests)
    .set({ leadId: keep.id })
    .where(inArray(listingRequests.leadId, otherIds));
  await tx
    .update(leads)
    .set({ mergedIntoId: keep.id, updatedBy: input.actor.id })
    .where(inArray(leads.id, otherIds));
  await tx
    .update(leads)
    .set({
      propertyIds: [...new Set(all.flatMap((l) => l.propertyIds))],
      projectIds: [...new Set(all.flatMap((l) => l.projectIds))],
      requirements,
      tags: [...new Set(all.flatMap((l) => l.tags))],
      firstTouch: earliest(all.map((l) => l.firstTouch)),
      lastTouch: latest(all.map((l) => l.lastTouch)),
      visitorId: keep.visitorId ?? others.find((o) => o.visitorId)?.visitorId ?? null,
      agentId: keep.agentId ?? others.find((o) => o.agentId)?.agentId ?? null,
      firstResponseAt: firstResponse ?? null,
      ...(firstResponse ? { responseDueAt: null } : {}),
      lastActivityAt: input.now,
      updatedBy: input.actor.id,
    })
    .where(eq(leads.id, keep.id));
  await refreshNextTask(tx, keep.id);
  await tx.insert(leadEvents).values({
    leadId: keep.id,
    type: "merged",
    body: `${others.length} ${others.length === 1 ? "lead" : "leads"} merged into this one`,
    meta: { mergedLeadIds: otherIds },
    ...timelineActor(input.actor),
    createdAt: input.now,
  });
  await writeAudit(tx, {
    actor: input.actor,
    action: "lead.merge",
    entityType: "lead",
    entityId: keep.id,
    after: { merged: otherIds },
  });
  return others.length;
}
