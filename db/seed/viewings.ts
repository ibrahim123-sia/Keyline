import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { currentAgencyId } from "../schema/_common";
import { leadEvents, leads, viewings } from "../schema/crm";
import { properties } from "../schema/properties";
import { manageTokenFor, manageTokenHash } from "@/features/viewings/book";
import { zonedDate, zonedTime } from "@/features/viewings/slots";
import { newId } from "@/lib/ids";
import { rng } from "./rng";

const feedback = [
  { rating: 5, text: "Brighter than the photos, and the view from the terrace is lovely." },
  { rating: 4, text: "Good layout. The second bedroom is a little small for us." },
  { rating: 3, text: "Nice building, but the road is louder than we expected." },
  { rating: 5, text: "Exactly what we were looking for. We would like to make an offer." },
];

/**
 * Viewings for the demo leads (16 §1): done ones with feedback over the past weeks, a no-show,
 * and confirmed ones in the coming days, inside working hours in the agency's time zone.
 */
export async function seedViewings(
  db: Db,
  options: { now: Date; timeZone: string },
): Promise<number> {
  const r = rng(20261115);
  const agency = currentAgencyId();
  const rows = await db
    .select({
      id: leads.id,
      contactId: leads.contactId,
      agentId: leads.agentId,
      propertyIds: leads.propertyIds,
    })
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, agency),
        isNotNull(leads.agentId),
        sql`cardinality(${leads.propertyIds}) > 0`,
      ),
    )
    .orderBy(asc(leads.createdAt))
    .limit(14);
  if (rows.length === 0) return 0;
  const homes = await db
    .select({ id: properties.id, agentId: properties.agentId })
    .from(properties)
    .where(
      inArray(
        properties.id,
        rows.map((l) => l.propertyIds[0]!),
      ),
    );
  const agentOf = new Map(homes.map((h) => [h.id, h.agentId]));
  const today = zonedDate(options.now, options.timeZone);
  const day = (offset: number) => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10);
  };

  let made = 0;
  for (const [i, lead] of rows.entries()) {
    // The first eight already happened; the rest are coming up.
    const past = i < 8;
    const offset = past ? -(3 + i * 3) : 1 + (i - 8) * 2;
    const minutes = r.int(10, 16) * 60 + (r.next() < 0.5 ? 0 : 30);
    const startsAt = zonedTime(day(offset), minutes, options.timeZone);
    const propertyId = lead.propertyIds[0]!;
    const status = past ? (i === 5 ? "no_show" : "done") : "confirmed";
    const fb = status === "done" && i % 2 === 0 ? feedback[(i / 2) % feedback.length]! : null;
    const id = newId();
    await db.insert(viewings).values({
      id,
      leadId: lead.id,
      contactId: lead.contactId,
      propertyId,
      agentId: agentOf.get(propertyId) ?? lead.agentId,
      type: i % 4 === 3 ? "video" : "in_person",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status,
      notes: i % 3 === 0 ? "Parking at the building's visitor bays." : null,
      feedbackRating: fb?.rating ?? null,
      feedbackText: fb?.text ?? null,
      feedbackRequestedAt: status === "done" ? new Date(startsAt.getTime() + 2 * 3_600_000) : null,
      manageTokenHash: await manageTokenHash(await manageTokenFor(id)),
      source: i % 2 === 0 ? "site" : "admin",
      createdAt: new Date(startsAt.getTime() - 4 * 86_400_000),
    });
    await db.insert(leadEvents).values({
      leadId: lead.id,
      type: status === "done" ? "viewing_done" : "viewing_booked",
      meta: { viewingId: id, startsAt: startsAt.toISOString() },
      actorType: "system",
      createdAt: past
        ? new Date(startsAt.getTime() + 3_600_000)
        : new Date(options.now.getTime() - 86_400_000),
    });
    made++;
  }
  return made;
}
