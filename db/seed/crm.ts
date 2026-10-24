import { asc, eq, inArray, isNull, and } from "drizzle-orm";
import type { Db } from "../client";
import {
  contacts,
  leadEvents,
  leads,
  leadTasks,
  type LeadSource,
  type Requirements,
  type Touch,
} from "../schema/crm";
import { leadStages } from "../schema/master-data";
import { properties } from "../schema/properties";
import { defaultLeadStages } from "@/features/lead-stages/schema";
import { refreshLeadScore } from "@/features/leads/process";
import { enrichRequirements } from "@/features/leads/requirements";
import { newId } from "@/lib/ids";
import { rng } from "./rng";

/**
 * Demo leads (16 §1): about 40 fictional people and 45 leads from every kind of source over
 * the last 60 days, with first and last touches, stages, agents, timelines, tasks and scores.
 * Deterministic. Emails use example.com.
 */
const firstNames = [
  "Amira",
  "Ben",
  "Chen",
  "Dalia",
  "Elena",
  "Farid",
  "Grace",
  "Hassan",
  "Ines",
  "Jonas",
  "Karim",
  "Leila",
  "Marco",
  "Nadia",
  "Omar",
  "Priya",
  "Rafael",
  "Sara",
  "Tomas",
  "Yusuf",
  "Zara",
  "Aditi",
  "Bilal",
  "Clara",
  "David",
  "Esra",
  "Hana",
  "Ivan",
  "Julia",
  "Kofi",
];
const lastNames = [
  "Haddad",
  "Ortiz",
  "Wei",
  "Mansour",
  "Petrova",
  "Rahimi",
  "Okafor",
  "Saleh",
  "Moreau",
  "Berg",
  "Nasser",
  "Farouk",
  "Rossi",
  "Kapoor",
  "Silva",
  "Novak",
  "Mendes",
  "Khan",
  "Lindqvist",
  "Aziz",
];

const messages = [
  "Is this still available? We would like to see it this week.",
  "Can you send the floor plan and the service charges?",
  "Looking for a two bedroom near the beach, budget is flexible for the right place.",
  "Do you have something similar with a bigger balcony?",
  "We are relocating in three months and need a family home.",
  "What is the payment plan on this one?",
  "Please call me after 6pm.",
  "Interested as an investment. What rent could it get?",
];

const lostReasons = ["Not responsive", "Bought elsewhere", "Budget too low", "Changed plans"];

const DAY = 86_400_000;
const MIN = 60_000;

type Campaign = Omit<Touch, "landing_path" | "at">;
const campaigns: Campaign[] = [
  {
    channel: "paid_search",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "marina-2bed",
    gclid: "demo",
  },
  {
    channel: "paid_search",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "offplan-oct",
    gclid: "demo",
  },
  {
    channel: "paid_social",
    utm_source: "instagram",
    utm_medium: "paid_social",
    utm_campaign: "offplan-oct",
  },
  {
    channel: "paid_social",
    utm_source: "facebook",
    utm_medium: "paid_social",
    utm_campaign: "family-homes",
    fbclid: "demo",
  },
  { channel: "organic_search", referrer: "https://www.google.com/" },
  { channel: "organic_social", referrer: "https://www.instagram.com/" },
  {
    channel: "email",
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "october-picks",
  },
  { channel: "referral", referrer: "https://news.example.org/property" },
  { channel: "direct" },
];

/** Where each lead came from, and how many (45 in all). */
const plan: Array<{ source: LeadSource; detail?: string; n: number; web: boolean }> = [
  { source: "form", detail: "listing", n: 12, web: true },
  { source: "whatsapp", n: 7, web: true },
  { source: "tour", detail: "listing", n: 5, web: true },
  { source: "callback", detail: "listing", n: 4, web: true },
  { source: "portal", detail: "Listings portal", n: 5, web: false },
  { source: "chat", n: 3, web: true },
  { source: "social_form", detail: "Meta lead form", n: 3, web: false },
  { source: "manual", detail: "walk-in", n: 2, web: false },
  { source: "manual", detail: "referral", n: 1, web: false },
  { source: "valuation", n: 2, web: true },
  { source: "listing_request", n: 1, web: true },
];

export async function seedCrm(
  db: Db,
  options: {
    now: Date;
    agentIds: string[];
    /** A demo phone number for person `i`, in the preset's market format. */
    phone: (i: number) => string;
    /** How many leads (default 45, the 16 §1 mix); fewer keeps the first sources of the mix. */
    leads?: number;
  },
): Promise<{ contacts: number; leads: number }> {
  const r = rng(20261101);
  const { now } = options;

  // Pipeline: the default stages when the agency has none yet.
  let stages = await db.select().from(leadStages).orderBy(asc(leadStages.sortOrder));
  if (stages.length === 0) {
    await db.insert(leadStages).values(defaultLeadStages.map((s, i) => ({ ...s, sortOrder: i })));
    stages = await db.select().from(leadStages).orderBy(asc(leadStages.sortOrder));
  }
  const open = stages.filter((s) => s.kind === "open");
  const won = stages.find((s) => s.kind === "won");
  const lost = stages.find((s) => s.kind === "lost");

  const listings = await db
    .select({
      id: properties.id,
      reference: properties.reference,
      purpose: properties.purpose,
      locationId: properties.locationId,
      propertyTypeId: properties.propertyTypeId,
      beds: properties.beds,
      price: properties.price,
      currency: properties.currency,
      agentId: properties.agentId,
    })
    .from(properties)
    .where(
      and(isNull(properties.deletedAt), inArray(properties.status, ["available", "under_offer"])),
    );
  const forSale = listings.filter((l) => l.purpose === "sale");
  const forRent = listings.filter((l) => l.purpose === "rent");

  // People: 40 (or one per lead for a smaller preset), five of whom also sell or let.
  const people = Array.from({ length: Math.min(40, options.leads ?? 40) }, (_, i) => {
    const first = firstNames[i % firstNames.length]!;
    const last = lastNames[(i * 7 + 3) % lastNames.length]!;
    return {
      id: newId(),
      name: `${first} ${last}`,
      email: r.next() < 0.85 ? `${first}.${last}${i}`.toLowerCase() + "@example.com" : null,
      phone: r.next() < 0.75 ? options.phone(i) : null,
      marketingConsent: r.next() < 0.4,
    };
  });
  for (const p of people)
    if (!p.email && !p.phone) p.email = `${p.name.replace(/\s+/g, ".").toLowerCase()}@example.com`;
  await db.insert(contacts).values(
    people.map((p) => ({
      ...p,
      preferredContact: p.phone ? ("whatsapp" as const) : ("email" as const),
      marketingConsentAt: p.marketingConsent ? new Date(now.getTime() - 30 * DAY) : null,
      createdAt: new Date(now.getTime() - 60 * DAY),
    })),
  );

  const stageMix = [
    ...Array(12).fill("new"),
    ...Array(12).fill("contacted"),
    ...Array(8).fill("viewing"),
    ...Array(5).fill("offer"),
    ...Array(4).fill("won"),
    ...Array(4).fill("lost"),
  ] as Array<"new" | "contacted" | "viewing" | "offer" | "won" | "lost">;
  const stageOf = (key: (typeof stageMix)[number]) =>
    key === "won"
      ? won
      : key === "lost"
        ? lost
        : open[Math.min(["new", "contacted", "viewing", "offer"].indexOf(key), open.length - 1)];

  const leadIds: string[] = [];
  // The full mix in order; a smaller preset takes one lead from each source in turn.
  const slots = options.leads
    ? plan
        .flatMap((g) => Array.from({ length: g.n }, (_, k) => ({ g, k })))
        .sort((a, b) => a.k - b.k)
        .slice(0, options.leads)
        .map((x) => x.g)
    : plan.flatMap((g) => Array.from({ length: g.n }, () => g));
  for (const [index, group] of slots.entries()) {
    const person = people[index < 40 ? index : (index - 40) * 7]!;
    const owner = group.source === "valuation" || group.source === "listing_request" || index >= 40;
    const wantsRent = !owner && r.next() < 0.3;
    const pool = wantsRent ? forRent : forSale;
    const listing = !owner && pool.length && group.source !== "chat" ? r.pick(pool) : null;
    const type = owner
      ? r.next() < 0.7
        ? "seller"
        : "landlord"
      : wantsRent
        ? "tenant"
        : r.next() < 0.2
          ? "investor"
          : "buyer";
    // Newest leads are the unanswered "New" ones.
    const stageKey = stageMix[(index * 11) % stageMix.length]!;
    const ageDays = stageKey === "new" ? r.int(0, 4) : r.int(3, 59);
    const createdAt = new Date(now.getTime() - ageDays * DAY - r.int(1, 600) * MIN);
    const campaign = r.pick(campaigns);
    const first: Touch | null = group.web
      ? {
          ...r.pick(campaigns),
          landing_path: "/",
          at: new Date(createdAt.getTime() - r.int(1, 20) * DAY).toISOString(),
        }
      : null;
    const last: Touch | null = group.web
      ? {
          ...campaign,
          landing_path: listing ? `/property/${listing.reference.toLowerCase()}` : "/buy",
          at: new Date(createdAt.getTime() - 5 * MIN).toISOString(),
        }
      : null;
    let requirements: Requirements = owner
      ? { purpose: type === "landlord" ? "rent" : "sale" }
      : {};
    if (!owner && r.next() < 0.5)
      requirements = {
        ...requirements,
        timeline: r.pick(["now", "1_3_months", "3_6_months", "browsing"]),
      };
    if (!owner && r.next() < 0.3)
      requirements = { ...requirements, finance: r.pick(["cash", "mortgage"]) };
    requirements = enrichRequirements(requirements, listing);
    const stage = stageOf(stageKey);
    const answered = stageKey !== "new" || r.next() < 0.4;
    const firstResponseAt = answered ? new Date(createdAt.getTime() + r.int(2, 95) * MIN) : null;
    const agentId = listing?.agentId ?? (options.agentIds.length ? r.pick(options.agentIds) : null);
    const id = newId();
    leadIds.push(id);
    const events: Array<typeof leadEvents.$inferInsert> = [
      {
        leadId: id,
        type: "created",
        body: group.source === "manual" ? null : r.pick(messages),
        meta: {
          source: group.source,
          sourceDetail: group.detail ?? null,
          propertyId: listing?.id ?? null,
        },
        actorType: group.source === "manual" ? "admin" : "customer",
        createdAt,
      },
    ];
    if (agentId)
      events.push({
        leadId: id,
        type: "assigned",
        meta: { agentId, rule: listing ? "listing_agent" : "round_robin" },
        actorType: "system",
        createdAt,
      });
    if (firstResponseAt)
      events.push({
        leadId: id,
        type: r.next() < 0.6 ? "call" : "note",
        body: r.pick([
          "Spoke briefly, will send options.",
          "Left a voicemail.",
          "Asked for budget and timing.",
        ]),
        meta: { outcome: "answered" },
        actorType: "admin",
        createdAt: firstResponseAt,
      });
    let lastActivity = firstResponseAt ?? createdAt;
    if (stage && stageKey !== "new") {
      lastActivity = new Date(
        Math.min(now.getTime() - MIN, lastActivity.getTime() + r.int(1, 6) * DAY),
      );
      events.push({
        leadId: id,
        type: "stage_changed",
        meta: {
          to: { id: stage.id, name: stage.name },
          kind: stage.kind,
          ...(stage.kind === "lost" ? { lostReason: r.pick(lostReasons) } : {}),
        },
        actorType: "admin",
        createdAt: lastActivity,
      });
    }
    const lostEvent = events.find(
      (e) => e.type === "stage_changed" && (e.meta as { kind?: string }).kind === "lost",
    );
    await db.insert(leads).values({
      id,
      contactId: person.id,
      type,
      stageId: stage?.id ?? null,
      status: stage?.kind ?? "open",
      source: group.source,
      sourceDetail: group.detail ?? null,
      firstTouch: first,
      lastTouch: last ?? first,
      propertyIds: listing ? [listing.id] : [],
      requirements,
      agentId,
      firstResponseAt,
      responseDueAt: firstResponseAt ? null : new Date(createdAt.getTime() + 10 * MIN),
      responseAlertSentAt:
        !firstResponseAt && now.getTime() - createdAt.getTime() > 10 * MIN
          ? new Date(createdAt.getTime() + 10 * MIN)
          : null,
      lastActivityAt: lastActivity,
      dealValue: stage?.kind === "won" && listing?.price ? listing.price : null,
      dealCurrency: stage?.kind === "won" && listing?.price ? listing.currency : null,
      wonAt: stage?.kind === "won" ? lastActivity : null,
      lostAt: stage?.kind === "lost" ? lastActivity : null,
      lostReason: lostEvent
        ? ((lostEvent.meta as { lostReason?: string }).lostReason ?? null)
        : null,
      tags: r.next() < 0.15 ? [r.pick(["vip", "cash buyer", "relocating"])] : [],
      createdAt,
    });
    await db.insert(leadEvents).values(events);
    if (stage?.kind === "open" && agentId) {
      const due = new Date(now.getTime() + r.int(-2, 5) * DAY + r.int(0, 8) * 3600_000);
      const title = r.pick([
        "Call back",
        "Send floor plans",
        "Confirm the viewing",
        "Follow up on the offer",
      ]);
      await db
        .insert(leadTasks)
        .values({ leadId: id, title, dueAt: due, agentId, createdByKind: "admin" });
      await db.update(leads).set({ nextTaskAt: due }).where(eq(leads.id, id));
    }
  }
  for (const id of leadIds) await refreshLeadScore(db, id, now);
  return { contacts: people.length, leads: leadIds.length };
}
