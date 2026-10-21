import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadEvents, leadTasks, viewings } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { captureLead } from "@/features/leads/capture";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { bytesToBase64Url, hmacSha256, sha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { busyTimes, slotRulesFor } from "./availability";
import { isFreeSlot } from "./slots";

export type Booking = {
  propertyId?: string | null;
  projectId?: string | null;
  type: "in_person" | "video";
  start: Date;
  name: string;
  email: string;
  phone: string;
  notes: string;
  /** The visitor's own time zone, shown with the agency's in messages. */
  timeZone: string | null;
  visitorKey?: string | null;
  now?: Date;
};

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET || process.env.SECRETS_ENCRYPTION_KEY;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

/**
 * The reschedule / cancel link token for a viewing (09 §5, no login needed): derived from its
 * id with the server secret, so it is never stored anywhere (jobs recompute it); the viewing
 * keeps only its hash to be found by it.
 */
export async function manageTokenFor(viewingId: string): Promise<string> {
  return bytesToBase64Url(await hmacSha256(secret(), `viewing-manage.${viewingId}`)).slice(0, 32);
}

export const manageTokenHash = (token: string) => sha256Hex(token);

/** What is being booked: a live listing (with its agent) or a published project. */
export async function bookingTarget(
  db: Db,
  target: { propertyId?: string | null; projectId?: string | null },
) {
  const agency = currentAgencyId();
  if (target.propertyId) {
    const [row] = await db
      .select({
        id: properties.id,
        reference: properties.reference,
        title: properties.title,
        agentId: properties.agentId,
        agentActive: agents.isActive,
        status: properties.status,
      })
      .from(properties)
      .leftJoin(agents, eq(agents.id, properties.agentId))
      .where(
        and(
          eq(properties.id, target.propertyId),
          eq(properties.agencyId, agency),
          sql`${properties.deletedAt} is null`,
        ),
      );
    if (!row || !(liveStatuses as readonly string[]).includes(row.status))
      throw new ActionError("This home is no longer listed.", "NOT_FOUND");
    return {
      kind: "property" as const,
      id: row.id,
      label: `${row.reference} · ${row.title}`,
      agentId: row.agentId && row.agentActive ? row.agentId : null,
    };
  }
  if (target.projectId) {
    const [row] = await db
      .select({ id: projects.id, name: projects.name, isPublished: projects.isPublished })
      .from(projects)
      .where(and(eq(projects.id, target.projectId), eq(projects.agencyId, agency)));
    if (!row?.isPublished) throw new ActionError("This project is no longer listed.", "NOT_FOUND");
    return { kind: "project" as const, id: row.id, label: row.name, agentId: null };
  }
  throw new ActionError("Choose a home or project to visit.", "VALIDATION");
}

/**
 * A visitor books a viewing on the site (09 §5): the lead comes first (source "tour"), then
 * the slot is checked again under a per-agent lock, so two visitors never get the same time.
 * If the time was just taken, the lead keeps a task to arrange another one.
 */
export async function bookViewing(
  db: Db,
  input: Booking,
): Promise<{ viewingId: string; leadId: string; manageToken: string; agentId: string | null }> {
  const now = input.now ?? new Date();
  const target = await bookingTarget(db, input);
  const rules = await slotRulesFor(db, target.agentId);
  const end = new Date(input.start.getTime() + rules.lengthMin * 60_000);
  const windowEnd = new Date(now.getTime() + (rules.bookingWindowDays + 1) * 86_400_000);
  const slotIsFree = async (conn: Parameters<typeof busyTimes>[0]) =>
    isFreeSlot(rules, await busyTimes(conn, target.agentId, now, windowEnd), now, input.start);
  if (!(await slotIsFree(db)))
    throw new ActionError("That time was just taken. Please pick another one.", "SLOT_TAKEN");

  const lead = await captureLead(db, {
    source: "tour",
    sourceDetail: input.type === "video" ? "video booking" : "booking",
    contact: { name: input.name, email: input.email || null, phone: input.phone || null },
    propertyId: target.kind === "property" ? target.id : null,
    projectId: target.kind === "project" ? target.id : null,
    message: input.notes || null,
    details: { viewingType: input.type, viewingAt: input.start.toISOString() },
    visitorKey: input.visitorKey ?? null,
    now,
  });
  const agentId = target.agentId ?? lead.agentId;
  const settings = await loadSettings("viewings", db);
  const meetingUrl =
    input.type === "video" && settings.videoTool === "zoom" && settings.zoomLink
      ? settings.zoomLink
      : null;
  const id = newId();
  const token = await manageTokenFor(id);
  const hash = await manageTokenHash(token);

  const viewingId = await db.transaction(async (tx) => {
    // One booking at a time per agent (or for the agency's own calendar).
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`viewing:${target.agentId ?? "agency"}`}))`,
    );
    if (!(await slotIsFree(tx))) {
      await tx.insert(leadTasks).values({
        leadId: lead.leadId,
        title: `Arrange another tour time (asked for ${input.start.toISOString()})`,
        dueAt: now,
        agentId,
        createdByKind: "rule",
      });
      return null;
    }
    const [row] = await tx
      .insert(viewings)
      .values({
        id,
        leadId: lead.leadId,
        contactId: lead.contactId,
        propertyId: target.kind === "property" ? target.id : null,
        projectId: target.kind === "project" ? target.id : null,
        agentId: target.agentId,
        type: input.type,
        startsAt: input.start,
        endsAt: end,
        status: "confirmed",
        meetingUrl,
        notes: input.notes || null,
        visitorTimeZone: input.timeZone,
        manageTokenHash: hash,
        source: "site",
      })
      .returning({ id: viewings.id });
    await tx.insert(leadEvents).values({
      leadId: lead.leadId,
      type: "viewing_booked",
      body: null,
      meta: { viewingId: row!.id, startsAt: input.start.toISOString(), type: input.type },
      actorType: "customer",
      createdAt: new Date(now.getTime() + 2),
    });
    return row!.id;
  });
  if (!viewingId)
    throw new ActionError("That time was just taken. Please pick another one.", "SLOT_TAKEN");

  await enqueue(
    "viewing.notify",
    { viewingId, event: "booked" },
    { db, dedupeKey: `viewing.notify:booked:${viewingId}` },
  );
  return { viewingId, leadId: lead.leadId, manageToken: token, agentId: target.agentId };
}
