import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  leadEvents,
  leads,
  visitorEvents,
  visitors,
  type Touch,
  type VisitorEventType,
} from "@/db/schema/crm";
import { nextTouches, touchFrom } from "./touch";

/**
 * Kept even without analytics consent: the visitor reaching out to the agency, which the
 * lead needs (WhatsApp clicks carry the ref code that matches the chat). Everything else in
 * the journey is kept only with consent (06 §2).
 */
const contactEvents = new Set<VisitorEventType>(["form_submit", "whatsapp_click", "call_click"]);

/** Listing counters without any visitor id, kept whatever the consent (aggregate only). */
const listingCounters: Partial<
  Record<VisitorEventType, "views" | "shares" | "brochure_downloads">
> = {
  listing_view: "views",
  share: "shares",
  brochure: "brochure_downloads",
};

export type TrackInput = {
  visitorKey: string;
  consent: { analytics: boolean; marketing: boolean; at: string | null };
  type: VisitorEventType;
  path: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  /** Only on the first page view of a page load. */
  landing?: { search: string; referrer: string | null } | null;
  device: string | null;
  country: string | null;
  siteHost: string;
  portals: readonly string[];
  now: Date;
  /** The agency's calendar date, for the daily listing counters. */
  today: string;
};

type VisitorRow = {
  id: string;
  leadId: string | null;
  firstTouch: Touch | null;
  lastTouch: Touch | null;
};

const visitorColumns = {
  id: visitors.id,
  leadId: visitors.leadId,
  firstTouch: visitors.firstTouch,
  lastTouch: visitors.lastTouch,
};

/** Finds or creates the visitor and applies this visit's touch (first touch is never replaced). */
export async function touchVisitor(
  db: DbOrTx,
  input: Pick<
    TrackInput,
    "visitorKey" | "consent" | "landing" | "device" | "country" | "siteHost" | "portals" | "now"
  > & { landingPath: string },
): Promise<VisitorRow> {
  const agencyId = currentAgencyId();
  const touch = input.landing
    ? touchFrom({
        search: input.landing.search,
        referrer: input.landing.referrer,
        landingPath: input.landingPath,
        siteHost: input.siteHost,
        portals: input.portals,
        at: input.now,
      })
    : null;
  const where = and(eq(visitors.agencyId, agencyId), eq(visitors.visitorKey, input.visitorKey));
  let [row] = await db.select(visitorColumns).from(visitors).where(where);
  if (!row) {
    [row] = await db
      .insert(visitors)
      .values({
        visitorKey: input.visitorKey,
        firstSeenAt: input.now,
        lastSeenAt: input.now,
        firstTouch: touch,
        lastTouch: touch,
        consent: input.consent,
        device: input.device,
        country: input.country,
      })
      .onConflictDoNothing()
      .returning(visitorColumns);
    if (row) return row;
    // Another request created it first.
    [row] = await db.select(visitorColumns).from(visitors).where(where);
    if (!row) throw new Error("visitor row missing after insert");
  }
  const touches = touch ? nextTouches({ first: row.firstTouch, last: row.lastTouch }, touch) : null;
  await db
    .update(visitors)
    .set({
      lastSeenAt: input.now,
      consent: input.consent,
      ...(touches ? { firstTouch: touches.first, lastTouch: touches.last } : {}),
      ...(input.device ? { device: input.device } : {}),
      ...(input.country ? { country: input.country } : {}),
    })
    .where(eq(visitors.id, row.id));
  return touches ? { ...row, firstTouch: touches.first, lastTouch: touches.last } : row;
}

/** One beacon from the site (09 §2 "Journey"). */
export async function recordTrack(db: DbOrTx, input: TrackInput): Promise<void> {
  const agencyId = currentAgencyId();
  const visitor = await touchVisitor(db, { ...input, landingPath: input.path });

  if (input.consent.analytics || contactEvents.has(input.type))
    await db.insert(visitorEvents).values({
      visitorId: visitor.id,
      type: input.type,
      path: input.path,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      meta: input.meta ?? {},
      createdAt: input.now,
    });

  const counter = listingCounters[input.type];
  if (counter && input.entityType === "property" && input.entityId)
    await db.execute(sql`
      insert into property_daily_stats (property_id, date, ${sql.identifier(counter)})
      select id, ${input.today}::date, 1 from properties
      where id = ${input.entityId} and agency_id = ${agencyId}
      on conflict (property_id, date)
      do update set ${sql.identifier(counter)} = property_daily_stats.${sql.identifier(counter)} + 1`);

  // 09 §1 #8: a known lead tapping "Call" may be phoning in; the agent sees a note.
  if (input.type === "call_click" && visitor.leadId) {
    await db.insert(leadEvents).values({
      leadId: visitor.leadId,
      type: "possible_call",
      body: null,
      meta: { path: input.path, entityType: input.entityType, entityId: input.entityId },
      actorType: "customer",
      createdAt: input.now,
    });
    await db
      .update(leads)
      .set({ lastActivityAt: input.now })
      .where(and(eq(leads.id, visitor.leadId), eq(leads.agencyId, agencyId)));
  }
}
