import "server-only";
import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  contacts,
  leadEvents,
  leads,
  leadTasks,
  visitors,
  type leadEventTypes,
  type LeadSource,
  type Requirements,
  type Touch,
} from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import { projects } from "@/db/schema/projects";
import { normalizeVisitorPhone } from "@/features/inquiries/schema";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { ActionError } from "@/lib/actions";
import { localDateString } from "@/lib/local-date";
import { chooseAgent } from "./assign";
import { enrichRequirements, mergeRequirements } from "./requirements";

export type LeadEventType = (typeof leadEventTypes)[number];

export type LeadContactInput = {
  name: string;
  email?: string | null;
  /** As typed: normalised to E.164 here with the market's country code. */
  phone?: string | null;
  whatsapp?: string | null;
  preferredContact?: "whatsapp" | "call" | "email" | null;
  language?: string | null;
  marketingConsent?: boolean;
  userId?: string | null;
};

export type LeadCapture = {
  source: LeadSource;
  /** e.g. the form ("listing", "contact"), the portal, "walk-in". */
  sourceDetail?: string | null;
  /** A lead type from Settings -> Leads; worked out from the source and listing when left out. */
  type?: string | null;
  contact: LeadContactInput;
  propertyId?: string | null;
  projectId?: string | null;
  message?: string | null;
  requirements?: Requirements;
  /** Form fields worth keeping on the timeline (preferred time, topic, …). */
  details?: Record<string, unknown>;
  /** The visitor cookie value: its first and last touch are copied onto a new lead. */
  visitorKey?: string | null;
  /** Campaign data that came with the lead itself (social lead forms, portals, imports). */
  touch?: Touch | null;
  task?: { title: string; dueAt: Date | null } | null;
  actor?: { type: "admin" | "system" | "customer" | "ai"; id?: string | null };
  /** The timeline entry for this contact (default: "created" for a new lead, else "form"). */
  eventType?: LeadEventType;
  /** Webhooks and imports keep an unreadable phone in the details instead of failing. */
  lenientPhone?: boolean;
  now?: Date;
};

export type CaptureResult = {
  leadId: string;
  contactId: string;
  isNew: boolean;
  agentId: string | null;
  eventId: string;
};

const ownerSources = new Set<LeadSource>(["valuation", "listing_request"]);

function defaultType(
  input: LeadCapture,
  requirements: Requirements,
  listingPurpose: "sale" | "rent" | null,
  allowed: readonly string[],
): string {
  const pick = (t: string) => (allowed.includes(t) ? t : (allowed[0] ?? t));
  if (input.type) return pick(input.type);
  const purpose = requirements.purpose ?? listingPurpose;
  if (ownerSources.has(input.source)) return pick(purpose === "rent" ? "landlord" : "seller");
  return pick(purpose === "rent" ? "tenant" : "buyer");
}

const unionIds = (a: readonly string[], b: Array<string | null | undefined>) => [
  ...new Set([...a, ...b.filter((x): x is string => Boolean(x))]),
];

/**
 * Every lead source comes through here (09 §3): normalise, find the contact (by email and/or
 * phone, Settings -> Leads), add to their open lead of the same type or start a new one,
 * enrich requirements from the listing, copy the visitor's first and last touch, assign an
 * agent, start the response timer and write the timeline. Notifications, the auto-reply and
 * scoring run after commit in the `lead.process` job.
 */
export async function captureLead(db: Db, input: LeadCapture): Promise<CaptureResult> {
  const now = input.now ?? new Date();
  const agency = currentAgencyId();
  const [market, leadSettings, general] = [
    await loadSettings("market", db),
    await loadSettings("leads", db),
    await loadSettings("general", db),
  ];

  const email = input.contact.email?.trim().toLowerCase() || null;
  const rawPhone = input.contact.phone?.trim() || null;
  const phone = rawPhone ? normalizeVisitorPhone(rawPhone, market.phoneCountryCode) : null;
  if (rawPhone && !phone && !input.lenientPhone)
    throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
      phone: ["Enter the number with the country code, for example +44 20 7946 0000"],
    });
  const rawWhatsapp = input.contact.whatsapp?.trim() || null;
  const whatsapp = rawWhatsapp ? normalizeVisitorPhone(rawWhatsapp, market.phoneCountryCode) : null;
  const details = {
    ...input.details,
    ...(rawPhone && !phone ? { phoneAsGiven: rawPhone } : {}),
  };
  const name = input.contact.name.trim().slice(0, 120) || email || phone || "Unknown";

  const result = await db.transaction(async (tx) => {
    // The listing or project asked about.
    const [listing] = input.propertyId
      ? await tx
          .select({
            id: properties.id,
            agentId: properties.agentId,
            purpose: properties.purpose,
            locationId: properties.locationId,
            propertyTypeId: properties.propertyTypeId,
            beds: properties.beds,
            price: properties.price,
            currency: properties.currency,
            projectId: properties.projectId,
          })
          .from(properties)
          .where(and(eq(properties.id, input.propertyId), eq(properties.agencyId, agency)))
      : [];
    const projectId = input.projectId ?? listing?.projectId ?? null;
    const [project] = projectId
      ? await tx
          .select({ id: projects.id, locationId: projects.locationId })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.agencyId, agency)))
      : [];
    const requirements = enrichRequirements(
      input.requirements ?? {},
      listing ?? null,
      project?.locationId ?? null,
    );
    const type = defaultType(input, requirements, listing?.purpose ?? null, leadSettings.leadTypes);

    // 1. The contact: the same person by email and/or phone (09 §3.2).
    const match: SQL[] = [];
    if (email && leadSettings.duplicateMatching !== "phone") match.push(eq(contacts.email, email));
    if (phone && leadSettings.duplicateMatching !== "email") match.push(eq(contacts.phone, phone));
    const [found] = match.length
      ? await tx
          .select()
          .from(contacts)
          .where(and(eq(contacts.agencyId, agency), isNull(contacts.mergedIntoId), or(...match)))
          .orderBy(asc(contacts.createdAt))
          .limit(1)
      : [];
    let contactId: string;
    if (found) {
      contactId = found.id;
      await tx
        .update(contacts)
        .set({
          email: found.email ?? email,
          phone: found.phone ?? phone,
          whatsapp: found.whatsapp ?? whatsapp,
          preferredContact: found.preferredContact ?? input.contact.preferredContact ?? null,
          preferredLanguage: found.preferredLanguage ?? input.contact.language ?? null,
          userId: found.userId ?? input.contact.userId ?? null,
          ...(input.contact.marketingConsent && !found.marketingConsent
            ? { marketingConsent: true, marketingConsentAt: now }
            : {}),
        })
        .where(eq(contacts.id, found.id));
    } else {
      const [created] = await tx
        .insert(contacts)
        .values({
          name,
          email,
          phone,
          whatsapp,
          preferredContact: input.contact.preferredContact ?? null,
          preferredLanguage: input.contact.language ?? null,
          userId: input.contact.userId ?? null,
          marketingConsent: Boolean(input.contact.marketingConsent),
          marketingConsentAt: input.contact.marketingConsent ? now : null,
        })
        .returning({ id: contacts.id });
      contactId = created!.id;
    }

    const eventMeta = {
      source: input.source,
      sourceDetail: input.sourceDetail ?? null,
      propertyId: listing?.id ?? null,
      projectId: project?.id ?? null,
      ...(Object.keys(details).length ? { details } : {}),
    };
    const actorType = input.actor?.type ?? "customer";
    const actorId = input.actor?.id ?? null;

    // 2. Their open lead of the same type gets this as a new timeline entry.
    const [open] = found
      ? await tx
          .select({
            id: leads.id,
            agentId: leads.agentId,
            propertyIds: leads.propertyIds,
            projectIds: leads.projectIds,
            requirements: leads.requirements,
          })
          .from(leads)
          .where(
            and(
              eq(leads.agencyId, agency),
              eq(leads.contactId, contactId),
              eq(leads.status, "open"),
              eq(leads.type, type),
              isNull(leads.mergedIntoId),
            ),
          )
          .orderBy(desc(leads.lastActivityAt))
          .limit(1)
      : [];

    // The visitor (if any) is linked to the lead; later events keep attaching to it.
    const [visitor] = input.visitorKey
      ? await tx
          .select({
            id: visitors.id,
            leadId: visitors.leadId,
            firstTouch: visitors.firstTouch,
            lastTouch: visitors.lastTouch,
          })
          .from(visitors)
          .where(and(eq(visitors.agencyId, agency), eq(visitors.visitorKey, input.visitorKey)))
      : [];

    let leadId: string;
    let agentId: string | null;
    let isNew: boolean;
    if (open) {
      leadId = open.id;
      isNew = false;
      // Still unassigned (e.g. the rule was "manual" then): try again now.
      const assignment = open.agentId
        ? null
        : await chooseAgent(tx, {
            rule: leadSettings.assignmentRule,
            listingAgentId: listing?.agentId ?? null,
            locationIds: requirements.locationIds ?? [],
            now,
          });
      agentId = open.agentId ?? assignment?.agentId ?? null;
      await tx
        .update(leads)
        .set({
          propertyIds: unionIds(open.propertyIds, [listing?.id]),
          projectIds: unionIds(open.projectIds, [project?.id]),
          requirements: mergeRequirements(open.requirements, requirements),
          lastActivityAt: now,
          ...(assignment ? { agentId: assignment.agentId } : {}),
        })
        .where(eq(leads.id, open.id));
      if (assignment)
        await tx.insert(leadEvents).values({
          leadId,
          type: "assigned",
          meta: { agentId: assignment.agentId, rule: assignment.how },
          actorType: "system",
          createdAt: now,
        });
    } else {
      const [stage] = await tx
        .select({ id: leadStages.id })
        .from(leadStages)
        .where(and(eq(leadStages.agencyId, agency), eq(leadStages.kind, "open")))
        .orderBy(asc(leadStages.sortOrder))
        .limit(1);
      const assignment = await chooseAgent(tx, {
        rule: leadSettings.assignmentRule,
        listingAgentId: listing?.agentId ?? null,
        locationIds: requirements.locationIds ?? [],
        now,
      });
      agentId = assignment?.agentId ?? null;
      isNew = true;
      const [created] = await tx
        .insert(leads)
        .values({
          contactId,
          type,
          stageId: stage?.id ?? null,
          source: input.source,
          sourceDetail: input.sourceDetail ?? null,
          firstTouch: visitor?.firstTouch ?? input.touch ?? null,
          lastTouch: visitor?.lastTouch ?? input.touch ?? null,
          visitorId: visitor?.id ?? null,
          propertyIds: unionIds([], [listing?.id]),
          projectIds: unionIds([], [project?.id]),
          requirements,
          agentId,
          responseDueAt: new Date(now.getTime() + leadSettings.responseAlertMinutes * 60_000),
          lastActivityAt: now,
          createdAt: now,
          createdBy: actorType === "admin" ? actorId : null,
        })
        .returning({ id: leads.id });
      leadId = created!.id;
      if (assignment)
        await tx.insert(leadEvents).values({
          leadId,
          type: "assigned",
          meta: { agentId: assignment.agentId, rule: assignment.how },
          actorType: "system",
          createdAt: now,
        });
    }

    const [event] = await tx
      .insert(leadEvents)
      .values({
        leadId,
        type: input.eventType ?? (isNew ? "created" : "form"),
        body: input.message?.trim() || null,
        meta: eventMeta,
        actorType,
        actorId,
        // A moment after "assigned", so the timeline reads in order.
        createdAt: new Date(now.getTime() + 1),
      })
      .returning({ id: leadEvents.id });

    if (visitor && !visitor.leadId)
      await tx.update(visitors).set({ leadId }).where(eq(visitors.id, visitor.id));

    if (input.task) {
      await tx.insert(leadTasks).values({
        leadId,
        title: input.task.title,
        dueAt: input.task.dueAt,
        agentId,
        createdByKind: "rule",
      });
      if (input.task.dueAt) {
        const due = sql`${input.task.dueAt.toISOString()}::timestamptz`;
        await tx
          .update(leads)
          .set({ nextTaskAt: sql`least(coalesce(${leads.nextTaskAt}, ${due}), ${due})` })
          .where(eq(leads.id, leadId));
      }
    }

    if (listing)
      await tx.execute(sql`
        insert into property_daily_stats (property_id, date, inquiries)
        values (${listing.id}, ${localDateString(now, general.timeZone)}::date, 1)
        on conflict (property_id, date)
        do update set inquiries = property_daily_stats.inquiries + 1`);

    return { leadId, contactId, isNew, agentId, eventId: event!.id };
  });

  await enqueue(
    "lead.process",
    { leadId: result.leadId, eventId: result.eventId, isNew: result.isNew },
    { db, dedupeKey: `lead.process:${result.eventId}` },
  );
  return result;
}
