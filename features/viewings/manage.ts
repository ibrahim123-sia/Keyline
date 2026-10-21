import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadEvents, viewings } from "@/db/schema/crm";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { busyTimes, slotRulesFor } from "./availability";
import { manageTokenHash } from "./book";
import { isFreeSlot } from "./slots";

/** The viewing a reschedule / cancel link points to, with what it is about. */
export async function viewingByToken(db: DbOrTx, token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const hash = await manageTokenHash(token);
  const [row] = await db
    .select({
      viewing: viewings,
      property: { title: properties.title, reference: properties.reference, slug: properties.slug },
      project: { name: projects.name, slug: projects.slug },
    })
    .from(viewings)
    .leftJoin(properties, eq(properties.id, viewings.propertyId))
    .leftJoin(projects, eq(projects.id, viewings.projectId))
    .where(and(eq(viewings.manageTokenHash, hash), eq(viewings.agencyId, currentAgencyId())));
  return row ?? null;
}

const changeable = (status: string, startsAt: Date, now: Date) =>
  (status === "confirmed" || status === "requested") && startsAt.getTime() > now.getTime();

/** The visitor moves their viewing to another free time with the same agent. */
export async function rescheduleViewing(db: Db, token: string, start: Date, now = new Date()) {
  const row = await viewingByToken(db, token);
  if (!row) throw new ActionError("This link is no longer valid.", "NOT_FOUND");
  const v = row.viewing;
  if (!changeable(v.status, v.startsAt, now))
    throw new ActionError(
      "This viewing can no longer be changed online. Please call us.",
      "LOCKED",
    );
  const rules = await slotRulesFor(db, v.agentId);
  const windowEnd = new Date(now.getTime() + (rules.bookingWindowDays + 1) * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`viewing:${v.agentId ?? "agency"}`}))`,
    );
    const busy = await busyTimes(tx, v.agentId, now, windowEnd, v.id);
    if (!isFreeSlot(rules, busy, now, start))
      throw new ActionError("That time was just taken. Please pick another one.", "SLOT_TAKEN");
    await tx
      .update(viewings)
      .set({
        startsAt: start,
        endsAt: new Date(start.getTime() + rules.lengthMin * 60_000),
        // A moved viewing gets its reminders again.
        reminderDaySentAt: null,
        reminderHoursSentAt: null,
      })
      .where(eq(viewings.id, v.id));
    if (v.leadId)
      await tx.insert(leadEvents).values({
        leadId: v.leadId,
        type: "viewing_booked",
        body: null,
        meta: {
          viewingId: v.id,
          startsAt: start.toISOString(),
          movedFrom: v.startsAt.toISOString(),
        },
        actorType: "customer",
        createdAt: now,
      });
  });
  await enqueue(
    "viewing.notify",
    { viewingId: v.id, event: "rescheduled" },
    { db, dedupeKey: `viewing.notify:rescheduled:${v.id}:${start.toISOString()}` },
  );
}

export async function cancelViewing(db: Db, token: string, now = new Date()) {
  const row = await viewingByToken(db, token);
  if (!row) throw new ActionError("This link is no longer valid.", "NOT_FOUND");
  const v = row.viewing;
  if (v.status === "cancelled") return;
  if (!changeable(v.status, v.startsAt, now))
    throw new ActionError(
      "This viewing can no longer be changed online. Please call us.",
      "LOCKED",
    );
  await db.transaction(async (tx) => {
    await tx.update(viewings).set({ status: "cancelled" }).where(eq(viewings.id, v.id));
    if (v.leadId)
      await tx.insert(leadEvents).values({
        leadId: v.leadId,
        type: "note",
        body: "The visitor cancelled the viewing.",
        meta: { viewingId: v.id, startsAt: v.startsAt.toISOString(), cancelled: true },
        actorType: "customer",
        createdAt: now,
      });
  });
  await enqueue(
    "viewing.notify",
    { viewingId: v.id, event: "cancelled" },
    { db, dedupeKey: `viewing.notify:cancelled:${v.id}` },
  );
}

/** After a viewing: the visitor's rating and words (09 §5), kept on the viewing and the lead. */
export async function saveViewingFeedback(
  db: Db,
  token: string,
  rating: number,
  text: string,
  now = new Date(),
) {
  const row = await viewingByToken(db, token);
  if (!row) throw new ActionError("This link is no longer valid.", "NOT_FOUND");
  const v = row.viewing;
  if (v.startsAt.getTime() > now.getTime() || v.status === "cancelled")
    throw new ActionError("Feedback opens after the viewing.", "LOCKED");
  await db.transaction(async (tx) => {
    await tx
      .update(viewings)
      .set({ feedbackRating: rating, feedbackText: text || null })
      .where(eq(viewings.id, v.id));
    if (v.leadId)
      await tx.insert(leadEvents).values({
        leadId: v.leadId,
        type: "note",
        body: text || null,
        meta: { viewingId: v.id, feedbackRating: rating },
        actorType: "customer",
        createdAt: now,
      });
  });
}
