import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import {
  contacts,
  conversations,
  leadEvents,
  leads,
  leadTasks,
  messages,
  visitorEvents,
  viewings,
} from "@/db/schema/crm";
import { leadStages, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { attributionSentence } from "@/features/attribution/describe";
import { currencyFormats, priceLabel } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import { leadShortlists } from "@/features/shortlists/store";
import type { SettingsOf } from "@/features/settings/schema";
import { matchCriteria } from "./match-criteria";
import { matchingListingIds } from "./matching";
import { suggestNextStep } from "./next-step";
import { leadListOptions } from "./list";

export type ListingBrief = {
  id: string;
  reference: string;
  title: string;
  slug: string;
  status: string;
  price: string;
  beds: number | null;
  locationName: string | null;
};

export type TimelineItem =
  | {
      kind: "event";
      id: string;
      type: string;
      body: string | null;
      meta: Record<string, unknown>;
      actor: string | null;
      actorType: string;
      at: string;
    }
  | {
      kind: "message";
      id: string;
      channel: string;
      direction: "in" | "out";
      sender: string;
      body: string;
      toolCalls: Array<{ tool: string; summary: string }>;
      at: string;
    }
  | {
      kind: "viewing";
      id: string;
      status: string;
      type: string;
      startsAt: string;
      listing: string | null;
      at: string;
    };

async function briefs(db: DbOrTx, ids: string[], market: SettingsOf<"market">) {
  if (ids.length === 0) return [];
  const formats = currencyFormats(market);
  const rows = await db
    .select({
      id: properties.id,
      reference: properties.reference,
      title: properties.title,
      slug: properties.slug,
      status: properties.status,
      price: properties.price,
      currency: properties.currency,
      priceOnRequest: properties.priceOnRequest,
      pricePeriod: properties.pricePeriod,
      purpose: properties.purpose,
      beds: properties.beds,
      locationName: locations.name,
    })
    .from(properties)
    .leftJoin(locations, eq(locations.id, properties.locationId))
    .where(and(inArray(properties.id, ids), eq(properties.agencyId, currentAgencyId())));
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r): ListingBrief => ({
      id: r.id,
      reference: r.reference,
      title: r.title,
      slug: r.slug,
      status: r.status,
      price: priceLabel(r, formats),
      beds: r.beds,
      locationName: r.locationName,
    }));
}

/** Everything the lead page shows (09 §4 "Lead page"), or null when there is no such lead. */
export async function loadLeadPage(db: DbOrTx, id: string, now: Date = new Date()) {
  const agency = currentAgencyId();
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.agencyId, agency)));
  if (!lead) return null;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
  if (!contact) return null;
  const market = await loadSettings("market", db);
  const leadSettings = await loadSettings("leads", db);
  const options = await leadListOptions(db);
  const [stage] = lead.stageId
    ? await db.select().from(leadStages).where(eq(leadStages.id, lead.stageId))
    : [];
  const [agent] = lead.agentId
    ? await db
        .select({ id: agents.id, name: agents.name, phone: agents.phone, email: agents.email })
        .from(agents)
        .where(eq(agents.id, lead.agentId))
    : [];

  // Timeline: events, messages of linked conversations, viewings.
  const events = await db
    .select({
      id: leadEvents.id,
      type: leadEvents.type,
      body: leadEvents.body,
      meta: leadEvents.meta,
      actorType: leadEvents.actorType,
      actorId: leadEvents.actorId,
      at: leadEvents.createdAt,
      actorName: users.name,
    })
    .from(leadEvents)
    .leftJoin(users, eq(users.id, leadEvents.actorId))
    .where(eq(leadEvents.leadId, lead.id))
    .orderBy(desc(leadEvents.createdAt))
    .limit(300);
  const msgs = await db
    .select({
      id: messages.id,
      channel: conversations.channel,
      direction: messages.direction,
      sender: messages.sender,
      body: messages.body,
      toolCalls: messages.toolCalls,
      at: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(eq(conversations.leadId, lead.id))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  const viewingRows = await db
    .select({
      id: viewings.id,
      status: viewings.status,
      type: viewings.type,
      startsAt: viewings.startsAt,
      endsAt: viewings.endsAt,
      createdAt: viewings.createdAt,
      feedbackRating: viewings.feedbackRating,
      propertyId: viewings.propertyId,
      reference: properties.reference,
      title: properties.title,
      projectName: projects.name,
      agentName: agents.name,
    })
    .from(viewings)
    .leftJoin(properties, eq(properties.id, viewings.propertyId))
    .leftJoin(projects, eq(projects.id, viewings.projectId))
    .leftJoin(agents, eq(agents.id, viewings.agentId))
    .where(eq(viewings.leadId, lead.id))
    .orderBy(desc(viewings.startsAt));
  const viewingsLogged = new Set(
    events.map((e) => e.meta.viewingId).filter((v): v is string => typeof v === "string"),
  );
  const listingLabel = (v: {
    reference: string | null;
    title: string | null;
    projectName: string | null;
  }) => (v.reference ? `${v.reference} · ${v.title ?? ""}` : (v.projectName ?? null));
  const timeline: TimelineItem[] = [
    ...events.map((e): TimelineItem => ({
      kind: "event",
      id: e.id,
      type: e.type,
      body: e.body,
      meta: e.meta,
      actor: e.actorType === "admin" ? (e.actorName ?? "A team member") : null,
      actorType: e.actorType,
      at: e.at.toISOString(),
    })),
    ...msgs.map((m): TimelineItem => ({
      kind: "message",
      id: m.id,
      channel: m.channel,
      direction: m.direction,
      sender: m.sender,
      body: m.body,
      toolCalls: m.toolCalls,
      at: m.at.toISOString(),
    })),
    ...viewingRows
      .filter((v) => !viewingsLogged.has(v.id))
      .map((v): TimelineItem => ({
        kind: "viewing",
        id: v.id,
        status: v.status,
        type: v.type,
        startsAt: v.startsAt.toISOString(),
        listing: listingLabel(v),
        at: v.createdAt.toISOString(),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Listings named in the timeline, for "about HD-2041".
  const eventListingIds = [
    ...new Set(
      events.map((e) => e.meta.propertyId).filter((v): v is string => typeof v === "string"),
    ),
  ];
  const eventListings = await briefs(db, eventListingIds, market);

  const tasks = await db
    .select({
      id: leadTasks.id,
      title: leadTasks.title,
      dueAt: leadTasks.dueAt,
      doneAt: leadTasks.doneAt,
      agentName: agents.name,
      createdByKind: leadTasks.createdByKind,
    })
    .from(leadTasks)
    .leftJoin(agents, eq(agents.id, leadTasks.agentId))
    .where(eq(leadTasks.leadId, lead.id))
    .orderBy(sql`${leadTasks.doneAt} is not null`, asc(leadTasks.dueAt), desc(leadTasks.createdAt))
    .limit(50);

  // Journey: what their visitor id did on the site.
  const journeyRows = lead.visitorId
    ? await db
        .select({
          id: visitorEvents.id,
          type: visitorEvents.type,
          path: visitorEvents.path,
          entityType: visitorEvents.entityType,
          entityId: visitorEvents.entityId,
          at: visitorEvents.createdAt,
        })
        .from(visitorEvents)
        .where(eq(visitorEvents.visitorId, lead.visitorId))
        .orderBy(desc(visitorEvents.createdAt))
        .limit(40)
    : [];
  const journeyListingIds = [
    ...new Set(
      journeyRows.filter((j) => j.entityType === "property" && j.entityId).map((j) => j.entityId!),
    ),
  ];
  const journeyListings = new Map(
    (await briefs(db, journeyListingIds, market)).map((b) => [b.id, b]),
  );

  const interest = await briefs(db, lead.propertyIds, market);
  const projectRows = lead.projectIds.length
    ? await db
        .select({ id: projects.id, name: projects.name, slug: projects.slug })
        .from(projects)
        .where(inArray(projects.id, lead.projectIds))
    : [];
  const rates = {
    base: market.baseCurrency,
    others: market.visitorCurrencies.filter((c) => c.code !== market.baseCurrency.code),
  };
  const criteria = matchCriteria(lead.requirements, rates);
  const matchingIds = await matchingListingIds(db, criteria, market, {
    exclude: lead.propertyIds,
    limit: 6,
  });
  const matching = await briefs(db, matchingIds, market);

  // Names for the requirements form.
  const typeRows = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, agency))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));
  const allLocations = await db
    .select({ id: locations.id, name: locations.name, level: locations.level })
    .from(locations)
    .where(eq(locations.agencyId, agency))
    .orderBy(asc(locations.name));

  const shortlistSent = events.some((e) => e.type === "property_sent");
  const openTasks = tasks.filter((x) => !x.doneAt);
  const overdue = openTasks.find((x) => x.dueAt && x.dueAt.getTime() < now.getTime()) ?? null;
  const upcoming = viewingRows
    .filter((v) => ["requested", "confirmed", "rescheduled"].includes(v.status) && v.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  const nextStep = suggestNextStep({
    status: lead.status,
    name: contact.name,
    answered: Boolean(lead.firstResponseAt),
    waitingMinutes: Math.round((now.getTime() - lead.createdAt.getTime()) / 60_000),
    overdueTask: overdue ? { title: overdue.title } : null,
    upcomingViewing: upcoming ? { startsAt: upcoming.startsAt } : null,
    viewingDoneNoFeedback: viewingRows.some(
      (v) => v.status === "done" && v.feedbackRating === null,
    ),
    matchingCount: matching.length,
    shortlistSent,
    daysSinceActivity: Math.floor((now.getTime() - lead.lastActivityAt.getTime()) / 86_400_000),
    followUpAfterDays: leadSettings.followUpAfterDays,
    hasPhone: Boolean(contact.phone || contact.whatsapp),
  });

  // Other open leads of the same person (a buyer who also sells).
  const siblings = await db
    .select({ id: leads.id, type: leads.type, status: leads.status, source: leads.source })
    .from(leads)
    .where(
      and(
        eq(leads.contactId, contact.id),
        isNull(leads.mergedIntoId),
        sql`${leads.id} <> ${lead.id}`,
      ),
    );

  const sent = await leadShortlists(db, lead.id);

  return {
    shortlists: sent,
    /** When the page was built: times on it count from here (no clock reads in render). */
    now: now.toISOString(),
    lead: {
      ...lead,
      createdAt: lead.createdAt.toISOString(),
      lastActivityAt: lead.lastActivityAt.toISOString(),
      firstResponseAt: lead.firstResponseAt?.toISOString() ?? null,
      responseDueAt: lead.responseDueAt?.toISOString() ?? null,
      wonAt: lead.wonAt?.toISOString() ?? null,
      lostAt: lead.lostAt?.toISOString() ?? null,
      aiScoredAt: lead.aiScoredAt?.toISOString() ?? null,
    },
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      nationality: contact.nationality,
      preferredContact: contact.preferredContact,
      preferredLanguage: contact.preferredLanguage,
      marketingConsent: contact.marketingConsent,
      marketingConsentAt: contact.marketingConsentAt?.toISOString() ?? null,
      tags: contact.tags,
    },
    stage: stage ? { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind } : null,
    agent: agent ?? null,
    options,
    attribution: attributionSentence(lead.firstTouch, lead.lastTouch, now),
    timeline,
    eventListings,
    tasks: tasks.map((x) => ({
      ...x,
      dueAt: x.dueAt?.toISOString() ?? null,
      doneAt: x.doneAt?.toISOString() ?? null,
    })),
    viewings: viewingRows.map((v) => ({
      id: v.id,
      status: v.status,
      type: v.type,
      startsAt: v.startsAt.toISOString(),
      listing: listingLabel(v),
      agentName: v.agentName,
    })),
    journey: journeyRows.map((j) => ({
      id: j.id,
      type: j.type,
      path: j.path,
      listing: j.entityId ? (journeyListings.get(j.entityId) ?? null) : null,
      at: j.at.toISOString(),
    })),
    interest,
    projects: projectRows,
    matching,
    nextStep,
    siblings,
    propertyTypes: typeRows,
    locations: allLocations.map((l) => ({ id: l.id, name: l.name })),
  };
}

export type LeadPageData = NonNullable<Awaited<ReturnType<typeof loadLeadPage>>>;
