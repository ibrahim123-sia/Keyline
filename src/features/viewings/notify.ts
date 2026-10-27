import "server-only";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, viewings } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { agencyInbox, leadAdminUrl, sendTemplate } from "@/features/leads/process";
import type { TemplateKey } from "@/features/messages/defaults";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { manageTokenFor } from "./book";

export const viewingEvents = [
  "booked",
  "rescheduled",
  "cancelled",
  "reminder",
  "feedback",
] as const;
export type ViewingEvent = (typeof viewingEvents)[number];

const cityOf = (timeZone: string) => timeZone.split("/").at(-1)!.replace(/_/g, " ");

/**
 * "Saturday 24 October, 10:00" in the visitor's own time zone, with the agency's time in
 * brackets when it differs (09 §5).
 */
export function viewingTimes(
  start: Date,
  visitorTimeZone: string | null,
  agencyTimeZone: string,
): { when: string; agencyTime: string } {
  const format = (timeZone: string, long = true) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      ...(long ? { weekday: "long", day: "numeric", month: "long" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(start);
  let tz = agencyTimeZone;
  try {
    if (visitorTimeZone) {
      format(visitorTimeZone);
      tz = visitorTimeZone;
    }
  } catch {
    /* unknown zone from the browser: the agency's */
  }
  const when = format(tz);
  const differs = tz !== agencyTimeZone && format(tz) !== format(agencyTimeZone);
  return {
    when,
    agencyTime: differs ? ` (${format(agencyTimeZone, false)} ${cityOf(agencyTimeZone)} time)` : "",
  };
}

async function loadViewing(db: DbOrTx, viewingId: string) {
  const [v] = await db
    .select({
      viewing: viewings,
      contact: { name: contacts.name, email: contacts.email, phone: contacts.phone },
      agent: { name: agents.name, email: agents.email, isActive: agents.isActive },
      property: { reference: properties.reference, title: properties.title, slug: properties.slug },
      project: { name: projects.name, slug: projects.slug },
    })
    .from(viewings)
    .innerJoin(contacts, eq(contacts.id, viewings.contactId))
    .leftJoin(agents, eq(agents.id, viewings.agentId))
    .leftJoin(properties, eq(properties.id, viewings.propertyId))
    .leftJoin(projects, eq(projects.id, viewings.projectId))
    .where(and(eq(viewings.id, viewingId), eq(viewings.agencyId, currentAgencyId())));
  return v ?? null;
}

/** Emails for a viewing event (13 §3): the visitor, and the agent and lead inbox. */
export async function notifyViewing(db: DbOrTx, viewingId: string, event: ViewingEvent) {
  const row = await loadViewing(db, viewingId);
  if (!row) return { skipped: "missing" };
  const { viewing: v, contact, agent, property, project } = row;
  const [general, notifications] = [
    await loadSettings("general", db),
    await loadSettings("notifications", db),
  ];
  const token = await manageTokenFor(v.id);
  const manageUrl = siteUrl(`/viewings/${token}`);
  const icsUrl = siteUrl(`/api/viewings/${token}/ics`);
  const pageUrl = property
    ? siteUrl(`/property/${property.slug}`)
    : project
      ? siteUrl(`/projects/${project.slug}`)
      : siteUrl("/");
  const what = property
    ? `${property.reference} · ${property.title}`
    : (project?.name ?? "the home");
  const { when, agencyTime } = viewingTimes(v.startsAt, v.visitorTimeZone, general.timeZone);
  const how =
    v.type === "video"
      ? v.meetingUrl
        ? `Video tour: ${v.meetingUrl}`
        : "Video tour: we will call you at that time."
      : null;
  const agentName = agent?.isActive ? agent.name.split(/\s+/)[0]! : general.agencyName;
  const firstName = contact.name.split(/\s+/)[0] ?? contact.name;
  const related = { type: "viewing", id: `${v.id}:${event}:${v.startsAt.toISOString()}` };
  const customer: Partial<Record<ViewingEvent, { key: TemplateKey; link: string }>> = {
    booked: { key: "viewing.confirmed", link: icsUrl },
    rescheduled: { key: "viewing.rescheduled", link: icsUrl },
    cancelled: { key: "viewing.cancelled", link: pageUrl },
    reminder: { key: "viewing.reminder", link: manageUrl },
    feedback: { key: "viewing.feedback", link: siteUrl(`/viewings/${token}/feedback`) },
  };
  const sent: string[] = [];
  const toCustomer = customer[event];
  if (toCustomer && contact.email)
    sent.push(
      ...(await sendTemplate(
        db,
        toCustomer.key,
        [contact.email],
        {
          name: firstName,
          what,
          when,
          agencyTime,
          how,
          agent: agentName,
          agency: general.agencyName,
          manageUrl,
          bookUrl: pageUrl,
          feedbackUrl: siteUrl(`/viewings/${token}/feedback`),
        },
        toCustomer.link,
        related,
      )),
    );

  // The team hears about new, moved and cancelled viewings (Settings -> Notifications).
  if (event === "booked" || event === "rescheduled" || event === "cancelled") {
    const toggle = event === "booked" ? "newViewing" : "viewingCancelled";
    const to: string[] = [];
    if (notifications.admins[toggle].email) to.push(...(await agencyInbox(db)));
    if (notifications.agents[toggle].email && agent?.isActive && agent.email) to.push(agent.email);
    const teamWhen = viewingTimes(v.startsAt, null, general.timeZone).when;
    const leadUrl = v.leadId ? leadAdminUrl(v.leadId) : siteUrl("/admin");
    sent.push(
      ...(await sendTemplate(
        db,
        event === "booked" ? "viewing.booked" : "viewing.changed",
        to,
        {
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          what,
          when: teamWhen,
          how: v.type === "video" ? "Video tour" : "In person",
          notes: v.notes,
          change: event === "cancelled" ? "cancelled" : "moved",
          url: leadUrl,
        },
        leadUrl,
        related,
        contact.email,
      )),
    );
  }
  return { sent: sent.length };
}

export const viewingNotifyJob = defineJob({
  name: "viewing.notify",
  payload: z.object({ viewingId: z.uuid(), event: z.enum(viewingEvents) }),
  maxAttempts: 5,
  run: ({ viewingId, event }, { db }) => notifyViewing(db, viewingId, event),
});

/**
 * Every 10 minutes (13 §2): reminders to visitors before confirmed viewings, at the hours in
 * Settings -> Viewings (24 h and 2 h by default; the two largest are used).
 */
export async function queueViewingReminders(db: DbOrTx, now = new Date()): Promise<number> {
  const settings = await loadSettings("viewings", db);
  if (!settings.reminders.customerEmail) return 0;
  const [first, second] = [...settings.reminders.customerHoursBefore].sort((a, b) => b - a);
  let queued = 0;
  const due = async (
    hours: number | undefined,
    column: "reminderDaySentAt" | "reminderHoursSentAt",
  ) => {
    if (!hours) return;
    const rows = await db
      .update(viewings)
      .set({ [column]: now })
      .where(
        and(
          eq(viewings.agencyId, currentAgencyId()),
          eq(viewings.status, "confirmed"),
          gt(viewings.startsAt, now),
          lte(viewings.startsAt, new Date(now.getTime() + hours * 3_600_000)),
          isNull(viewings[column]),
          // A viewing booked inside the window gets no "day before" reminder after its
          // confirmation; the later one still comes.
          sql`${viewings.createdAt} < ${viewings.startsAt} - make_interval(hours => ${hours})`,
        ),
      )
      .returning({ id: viewings.id });
    for (const r of rows) {
      await enqueue(
        "viewing.notify",
        { viewingId: r.id, event: "reminder" },
        { db, dedupeKey: `viewing.reminder:${r.id}:${column}` },
      );
      queued++;
    }
  };
  await due(first, "reminderDaySentAt");
  await due(second, "reminderHoursSentAt");
  return queued;
}
