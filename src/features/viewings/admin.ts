import "server-only";
import { and, asc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  agentAvailabilityOverrides,
  contacts,
  leadEvents,
  leads,
  viewings,
  type viewingStatuses,
} from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { captureLead } from "@/features/leads/capture";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { busyTimes, slotRulesFor } from "./availability";
import { manageTokenFor, manageTokenHash } from "./book";
import { queueCalendarSync } from "./calendar-sync";
import type { ViewingEvent } from "./notify";
import { isFreeSlot, zonedDate, zonedTime } from "./slots";

/** Admin -> Viewings (09 §5 "Admin"): the calendar, status changes, moves and new viewings. */

export type ViewingStatus = (typeof viewingStatuses)[number];

export type CalendarView = "day" | "week" | "agents";

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
};

/** The days a calendar view shows and their instants, in the agency's time zone. */
export function calendarRange(
  view: CalendarView,
  date: string,
  timeZone: string,
  firstDayOfWeek: number,
): { from: Date; to: Date; days: string[] } {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(date, i - ((weekday - firstDayOfWeek + 7) % 7)))
      : [date];
  return {
    from: zonedTime(days[0]!, 0, timeZone),
    to: zonedTime(addDays(days.at(-1)!, 1), 0, timeZone),
    days,
  };
}

export type CalendarViewing = {
  id: string;
  status: ViewingStatus;
  type: "in_person" | "video";
  startsAt: string;
  endsAt: string;
  agentId: string | null;
  agentName: string | null;
  leadId: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  what: string;
  propertyId: string | null;
  projectId: string | null;
  notes: string | null;
  source: string;
  feedbackRating: number | null;
  feedbackText: string | null;
  meetingUrl: string | null;
};

export async function listCalendarViewings(
  db: DbOrTx,
  input: {
    from: Date;
    to: Date;
    agentId?: string | null;
    status?: ViewingStatus | null;
    type?: "in_person" | "video" | null;
  },
): Promise<CalendarViewing[]> {
  const where: SQL[] = [
    eq(viewings.agencyId, currentAgencyId()),
    lt(viewings.startsAt, input.to),
    gte(viewings.endsAt, input.from),
  ];
  if (input.agentId) where.push(eq(viewings.agentId, input.agentId));
  if (input.status) where.push(eq(viewings.status, input.status));
  if (input.type) where.push(eq(viewings.type, input.type));
  const rows = await db
    .select({
      v: viewings,
      agentName: agents.name,
      contact: { name: contacts.name, phone: contacts.phone, email: contacts.email },
      propertyRef: properties.reference,
      propertyTitle: properties.title,
      projectName: projects.name,
    })
    .from(viewings)
    .innerJoin(contacts, eq(contacts.id, viewings.contactId))
    .leftJoin(agents, eq(agents.id, viewings.agentId))
    .leftJoin(properties, eq(properties.id, viewings.propertyId))
    .leftJoin(projects, eq(projects.id, viewings.projectId))
    .where(and(...where))
    .orderBy(asc(viewings.startsAt));
  return rows.map((r) => ({
    id: r.v.id,
    status: r.v.status,
    type: r.v.type,
    startsAt: r.v.startsAt.toISOString(),
    endsAt: r.v.endsAt.toISOString(),
    agentId: r.v.agentId,
    agentName: r.agentName,
    leadId: r.v.leadId,
    contactName: r.contact.name,
    contactPhone: r.contact.phone,
    contactEmail: r.contact.email,
    what: r.propertyRef
      ? `${r.propertyRef} · ${r.propertyTitle}`
      : (r.projectName ?? "No home chosen"),
    propertyId: r.v.propertyId,
    projectId: r.v.projectId,
    notes: r.v.notes,
    source: r.v.source,
    feedbackRating: r.v.feedbackRating,
    feedbackText: r.v.feedbackText,
    meetingUrl: r.v.meetingUrl,
  }));
}

async function findViewing(db: DbOrTx, id: string) {
  const [v] = await db
    .select()
    .from(viewings)
    .where(and(eq(viewings.id, id), eq(viewings.agencyId, currentAgencyId())));
  if (!v) throw new ActionError("This viewing no longer exists.", "NOT_FOUND");
  return v;
}

async function notify(db: DbOrTx, viewingId: string, event: ViewingEvent, key: string) {
  await enqueue("viewing.notify", { viewingId, event }, { db, dedupeKey: `viewing.notify:${key}` });
}

const statusNotes: Partial<Record<ViewingStatus, string>> = {
  confirmed: "The viewing was confirmed.",
  no_show: "The visitor did not come to the viewing.",
  cancelled: "The team cancelled the viewing.",
};

/** Confirm, done, no-show or cancel (09 §5 viewing panel). */
export async function setViewingStatus(
  db: Db,
  input: { id: string; status: "confirmed" | "done" | "no_show" | "cancelled"; actor: AuditActor },
) {
  const now = new Date();
  const before = await findViewing(db, input.id);
  if (before.status === input.status) return before;
  const after = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(viewings)
      .set({
        status: input.status,
        ...(input.status === "done" ? { feedbackRequestedAt: now } : {}),
      })
      .where(eq(viewings.id, input.id))
      .returning();
    if (before.leadId) {
      await tx.insert(leadEvents).values({
        leadId: before.leadId,
        type: input.status === "done" ? "viewing_done" : "note",
        body: input.status === "done" ? null : (statusNotes[input.status] ?? null),
        meta: {
          viewingId: before.id,
          status: input.status,
          startsAt: before.startsAt.toISOString(),
        },
        actorType: "admin",
        actorId: input.actor.id,
        createdAt: now,
      });
      await tx.update(leads).set({ lastActivityAt: now }).where(eq(leads.id, before.leadId));
    }
    await auditChange(tx, {
      actor: input.actor,
      action: "viewing.status",
      entityType: "viewing",
      entityId: input.id,
      before: { status: before.status },
      after: { status: input.status },
    });
    return row!;
  });
  // Done asks the visitor how it was; a cancelled viewing tells them; a confirmed request
  // sends the confirmation.
  if (input.status === "done") await notify(db, before.id, "feedback", `feedback:${before.id}`);
  if (input.status === "cancelled")
    await notify(db, before.id, "cancelled", `cancelled:${before.id}`);
  if (input.status === "confirmed" && before.status === "requested")
    await notify(db, before.id, "booked", `booked:${before.id}`);
  await queueCalendarSync(db, before.id);
  return after;
}

/** Is `start` (for `lengthMin`) inside the agent's free times, ignoring this viewing? */
async function fitsFreeTimes(
  db: DbOrTx,
  agentId: string | null,
  start: Date,
  exceptViewingId?: string,
): Promise<boolean> {
  const now = new Date();
  const rules = await slotRulesFor(db, agentId);
  const to = new Date(now.getTime() + (rules.bookingWindowDays + 1) * 86_400_000);
  const busy = await busyTimes(db, agentId, now, to, exceptViewingId);
  // The team may book any minute: compare against a rule set with one-minute steps.
  return isFreeSlot({ ...rules, minNoticeHours: 0, stepMin: 5 }, busy, now, start);
}

/**
 * Moves a viewing (drag on the calendar or the panel). Outside the agent's free times it is
 * refused unless the admin confirmed (`force`).
 */
export async function moveViewing(
  db: Db,
  input: { id: string; start: Date; agentId?: string | null; force: boolean; actor: AuditActor },
) {
  const before = await findViewing(db, input.id);
  if (before.status === "cancelled" || before.status === "done")
    throw new ActionError("A finished or cancelled viewing cannot move.", "LOCKED");
  const agentId = input.agentId === undefined ? before.agentId : input.agentId;
  if (!input.force && !(await fitsFreeTimes(db, agentId, input.start, before.id)))
    throw new ActionError(
      "That time is outside the agent's free times or clashes with another viewing.",
      "OUTSIDE_FREE_TIMES",
    );
  const end = new Date(
    input.start.getTime() + (before.endsAt.getTime() - before.startsAt.getTime()),
  );
  const agentChanged = agentId !== before.agentId;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(viewings)
      .set({
        startsAt: input.start,
        endsAt: end,
        agentId,
        reminderDaySentAt: null,
        reminderHoursSentAt: null,
        ...(agentChanged ? { googleEventId: null } : {}),
      })
      .where(eq(viewings.id, before.id));
    if (before.leadId)
      await tx.insert(leadEvents).values({
        leadId: before.leadId,
        type: "viewing_booked",
        meta: {
          viewingId: before.id,
          startsAt: input.start.toISOString(),
          movedFrom: before.startsAt.toISOString(),
          ...(agentChanged ? { agentId } : {}),
        },
        actorType: "admin",
        actorId: input.actor.id,
        createdAt: now,
      });
    await auditChange(tx, {
      actor: input.actor,
      action: "viewing.move",
      entityType: "viewing",
      entityId: before.id,
      before: { startsAt: before.startsAt.toISOString(), agentId: before.agentId },
      after: { startsAt: input.start.toISOString(), agentId },
    });
  });
  if (input.start.getTime() !== before.startsAt.getTime())
    await notify(
      db,
      before.id,
      "rescheduled",
      `rescheduled:${before.id}:${input.start.toISOString()}`,
    );
  await queueCalendarSync(
    db,
    before.id,
    agentChanged && before.agentId && before.googleEventId
      ? { agentId: before.agentId, eventId: before.googleEventId }
      : null,
  );
}

export async function saveViewingNotes(
  db: Db,
  input: { id: string; notes: string; actor: AuditActor },
) {
  const before = await findViewing(db, input.id);
  await db.transaction(async (tx) => {
    await tx
      .update(viewings)
      .set({ notes: input.notes || null })
      .where(eq(viewings.id, input.id));
    await auditChange(tx, {
      actor: input.actor,
      action: "viewing.notes",
      entityType: "viewing",
      entityId: input.id,
      before: { notes: before.notes },
      after: { notes: input.notes || null },
    });
  });
  await queueCalendarSync(db, input.id);
}

export type AdminViewingInput = {
  leadId?: string | null;
  contact?: { name: string; email: string; phone: string } | null;
  propertyId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  type: "in_person" | "video";
  start: Date;
  notes: string;
  force: boolean;
};

/** A viewing the team books (source "admin"): for a lead, or a new contact as a new lead. */
export async function createAdminViewing(db: Db, input: AdminViewingInput, actor: AuditActor) {
  const agency = currentAgencyId();
  const [listing] = input.propertyId
    ? await db
        .select({ id: properties.id, agentId: properties.agentId })
        .from(properties)
        .where(and(eq(properties.id, input.propertyId), eq(properties.agencyId, agency)))
    : [];
  if (input.propertyId && !listing)
    throw new ActionError("This home no longer exists.", "NOT_FOUND");
  const [project] = input.projectId
    ? await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.agencyId, agency)))
    : [];
  if (input.projectId && !project)
    throw new ActionError("This project no longer exists.", "NOT_FOUND");

  let leadId: string | null = null;
  let contactId: string;
  let leadAgentId: string | null = null;
  if (input.leadId) {
    const [lead] = await db
      .select({ id: leads.id, contactId: leads.contactId, agentId: leads.agentId })
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.agencyId, agency)));
    if (!lead) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
    leadId = lead.id;
    contactId = lead.contactId;
    leadAgentId = lead.agentId;
  } else {
    if (!input.contact?.name.trim())
      throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
        "contact.name": ["Enter who is coming"],
      });
    const captured = await captureLead(db, {
      source: "manual",
      sourceDetail: "viewing",
      contact: {
        name: input.contact.name,
        email: input.contact.email || null,
        phone: input.contact.phone || null,
      },
      propertyId: listing?.id ?? null,
      projectId: project?.id ?? null,
      actor: { type: "admin", id: actor.id },
    });
    leadId = captured.leadId;
    contactId = captured.contactId;
    leadAgentId = captured.agentId;
  }
  const agentId = input.agentId ?? listing?.agentId ?? leadAgentId ?? null;
  if (!input.force && !(await fitsFreeTimes(db, agentId, input.start)))
    throw new ActionError(
      "That time is outside the agent's free times or clashes with another viewing.",
      "OUTSIDE_FREE_TIMES",
    );
  const settings = await loadSettings("viewings", db);
  const id = newId();
  const hash = await manageTokenHash(await manageTokenFor(id));
  const meetingUrl =
    input.type === "video" && settings.videoTool === "zoom" && settings.zoomLink
      ? settings.zoomLink
      : null;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(viewings).values({
      id,
      leadId,
      contactId,
      propertyId: listing?.id ?? null,
      projectId: project?.id ?? null,
      agentId,
      type: input.type,
      startsAt: input.start,
      endsAt: new Date(input.start.getTime() + settings.defaultLengthMin * 60_000),
      status: "confirmed",
      meetingUrl,
      notes: input.notes || null,
      manageTokenHash: hash,
      source: "admin",
      createdBy: actor.id,
    });
    if (leadId) {
      await tx.insert(leadEvents).values({
        leadId,
        type: "viewing_booked",
        meta: { viewingId: id, startsAt: input.start.toISOString(), type: input.type },
        actorType: "admin",
        actorId: actor.id,
        createdAt: now,
      });
      await tx.update(leads).set({ lastActivityAt: now }).where(eq(leads.id, leadId));
    }
    await writeAudit(tx, {
      actor,
      action: "viewing.create",
      entityType: "viewing",
      entityId: id,
      after: {
        startsAt: input.start.toISOString(),
        agentId,
        leadId,
        propertyId: listing?.id ?? null,
      },
    });
  });
  await notify(db, id, "booked", `booked:${id}`);
  await queueCalendarSync(db, id);
  return { id, leadId };
}

/** Converts the admin's date and time (agency time zone) into an instant. */
export async function agencyInstant(db: DbOrTx, date: string, time: string): Promise<Date> {
  const general = await loadSettings("general", db);
  const [h, m] = time.split(":").map(Number);
  return zonedTime(date, (h ?? 0) * 60 + (m ?? 0), general.timeZone);
}

/* ---------------------------- days off and hours ---------------------------- */

export type OverrideRow = {
  id: string;
  agentId: string;
  agentName: string;
  date: string;
  blocked: boolean;
  hours: Array<{ from: string; to: string }> | null;
  note: string | null;
};

export async function listOverrides(db: DbOrTx): Promise<OverrideRow[]> {
  const general = await loadSettings("general", db);
  const today = zonedDate(new Date(), general.timeZone);
  const rows = await db
    .select({
      id: agentAvailabilityOverrides.id,
      agentId: agentAvailabilityOverrides.agentId,
      agentName: agents.name,
      date: agentAvailabilityOverrides.date,
      blocked: agentAvailabilityOverrides.blocked,
      hours: agentAvailabilityOverrides.hours,
      note: agentAvailabilityOverrides.note,
    })
    .from(agentAvailabilityOverrides)
    .innerJoin(agents, eq(agents.id, agentAvailabilityOverrides.agentId))
    .where(
      and(
        eq(agentAvailabilityOverrides.agencyId, currentAgencyId()),
        gte(agentAvailabilityOverrides.date, today),
      ),
    )
    .orderBy(asc(agentAvailabilityOverrides.date), asc(agents.name));
  return rows;
}

export async function saveOverride(
  db: Db,
  input: {
    agentId: string;
    date: string;
    blocked: boolean;
    hours: Array<{ from: string; to: string }> | null;
    note: string;
    actor: AuditActor;
  },
) {
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.agentId), eq(agents.agencyId, currentAgencyId())));
  if (!agent) throw new ActionError("This agent no longer exists.", "NOT_FOUND");
  const values = {
    blocked: input.blocked,
    hours: input.blocked ? null : input.hours,
    note: input.note || null,
  };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agentAvailabilityOverrides)
      .values({ agentId: input.agentId, date: input.date, ...values })
      .onConflictDoUpdate({
        target: [agentAvailabilityOverrides.agentId, agentAvailabilityOverrides.date],
        set: values,
      })
      .returning();
    await writeAudit(tx, {
      actor: input.actor,
      action: "agent.availability_override",
      entityType: "agent",
      entityId: input.agentId,
      after: { date: input.date, ...values },
    });
    return row!;
  });
}

export async function deleteOverride(db: Db, id: string, actor: AuditActor) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(agentAvailabilityOverrides)
      .where(
        and(
          eq(agentAvailabilityOverrides.id, id),
          eq(agentAvailabilityOverrides.agencyId, currentAgencyId()),
        ),
      )
      .returning();
    if (!row) throw new ActionError("This day is no longer set.", "NOT_FOUND");
    await writeAudit(tx, {
      actor,
      action: "agent.availability_override_delete",
      entityType: "agent",
      entityId: row.agentId,
      before: { date: row.date, blocked: row.blocked, hours: row.hours },
    });
  });
}

/** Active agents, for the calendar's columns and pickers. */
export async function activeAgents(db: DbOrTx) {
  return db
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(and(eq(agents.agencyId, currentAgencyId()), eq(agents.isActive, true)))
    .orderBy(asc(agents.sortOrder), asc(agents.name));
}

/** Live listings and published projects, for the "new viewing" picker. */
export async function bookableTargets(db: DbOrTx) {
  const agency = currentAgencyId();
  const homes = await db
    .select({
      id: properties.id,
      label: sql<string>`${properties.reference} || ' · ' || ${properties.title}`,
    })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, agency),
        sql`${properties.deletedAt} is null`,
        inArray(properties.status, [...liveStatuses]),
      ),
    )
    .orderBy(asc(properties.reference))
    .limit(500);
  const projectRows = await db
    .select({ id: projects.id, label: projects.name })
    .from(projects)
    .where(and(eq(projects.agencyId, agency), eq(projects.isPublished, true)))
    .orderBy(asc(projects.name));
  return { homes, projects: projectRows };
}
