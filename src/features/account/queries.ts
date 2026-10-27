import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, leadEvents, leads, messages, viewings } from "@/db/schema/crm";
import { savedHomes, savedLists, savedSearches } from "@/db/schema/customer";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { statusLabels } from "@/features/properties/status";
import { searchLabels } from "@/features/search/page-data";
import { searchConditions } from "@/features/search/query";
import { searchHref } from "@/features/search/params";
import { loadSettings } from "@/features/settings/queries";
import { manageTokenFor } from "@/features/viewings/book";
import { customerContactIds } from "./link";
import { filtersSummary, storedToFilters, type StoredFilters } from "./searches";
import { compareIds, listsOf } from "./store";

/** The customer area's pages (12 §2). Every query is for the signed-in customer only. */

export type SavedHomeView = {
  id: string;
  listId: string;
  note: string | null;
  savedAt: Date;
  card: ListingCardData | null;
  project: { id: string; name: string; slug: string } | null;
  /** "Price dropped by …" or "Now reserved": what changed since it was saved. */
  change: { kind: "price_down" | "price_up" | "status"; amount?: number; status?: string } | null;
};

export async function savedHomesOf(db: Db, userId: string) {
  const lists = await listsOf(db, userId);
  const rows = await db
    .select({
      id: savedHomes.id,
      listId: savedHomes.listId,
      note: savedHomes.note,
      savedAt: savedHomes.createdAt,
      propertyId: savedHomes.propertyId,
      projectId: savedHomes.projectId,
      priceWhenSaved: savedHomes.priceWhenSaved,
      statusWhenSaved: savedHomes.statusWhenSaved,
      price: properties.price,
      status: properties.status,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(savedHomes)
    .leftJoin(properties, eq(properties.id, savedHomes.propertyId))
    .leftJoin(projects, eq(projects.id, savedHomes.projectId))
    .where(eq(savedHomes.userId, userId))
    .orderBy(desc(savedHomes.createdAt));
  const cards = new Map(
    (
      await loadListingCards(
        db,
        rows.map((r) => r.propertyId).filter((x): x is string => !!x),
      )
    ).map((c) => [c.id, c]),
  );
  const homes: SavedHomeView[] = rows.map((r) => {
    let change: SavedHomeView["change"] = null;
    if (r.status && r.statusWhenSaved && r.status !== r.statusWhenSaved)
      change = { kind: "status", status: statusLabels[r.status] ?? r.status };
    else if (r.price != null && r.priceWhenSaved != null && r.price !== r.priceWhenSaved)
      change = {
        kind: r.price < r.priceWhenSaved ? "price_down" : "price_up",
        amount: Math.abs(r.priceWhenSaved - r.price),
      };
    return {
      id: r.id,
      listId: r.listId,
      note: r.note,
      savedAt: r.savedAt,
      card: r.propertyId ? (cards.get(r.propertyId) ?? null) : null,
      project:
        r.projectId && r.projectName && r.projectSlug
          ? { id: r.projectId, name: r.projectName, slug: r.projectSlug }
          : null,
      change,
    };
  });
  return { lists, homes };
}

export type SavedSearchView = {
  id: string;
  name: string;
  summary: string;
  href: string;
  frequency: "instant" | "daily" | "weekly" | "off";
  /** The drawn area's outline, for a small thumbnail. */
  ring: Array<[number, number]> | null;
  newMatches: number;
};

export async function savedSearchesOf(db: Db, userId: string): Promise<SavedSearchView[]> {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
  if (rows.length === 0) return [];
  const market = await loadSettings("market", db);
  const units = { currency: market.baseCurrency, areaUnit: market.areaUnit };
  const out: SavedSearchView[] = [];
  for (const r of rows) {
    const f = storedToFilters(r.filters as StoredFilters);
    const since = r.lastSentAt ?? r.createdAt;
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(...searchConditions(f, market), gt(properties.publishedAt, since)));
    out.push({
      id: r.id,
      name: r.name,
      summary: filtersSummary(f, await searchLabels(f), units),
      href: searchHref(f),
      frequency: r.alertFrequency,
      ring: f.poly,
      newMatches: count?.n ?? 0,
    });
  }
  return out;
}

export type TourView = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  type: "in_person" | "video";
  status: string;
  what: string;
  href: string | null;
  token: string;
  feedbackRating: number | null;
};

/** The customer's viewings (12 §2 Tours), by their linked contacts. */
export async function toursOf(db: Db, userId: string, now = new Date()) {
  const contactIds = await customerContactIds(db, userId);
  if (contactIds.length === 0) return { upcoming: [] as TourView[], past: [] as TourView[] };
  const rows = await db
    .select({
      id: viewings.id,
      startsAt: viewings.startsAt,
      endsAt: viewings.endsAt,
      type: viewings.type,
      status: viewings.status,
      feedbackRating: viewings.feedbackRating,
      reference: properties.reference,
      title: properties.title,
      slug: properties.slug,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(viewings)
    .leftJoin(properties, eq(properties.id, viewings.propertyId))
    .leftJoin(projects, eq(projects.id, viewings.projectId))
    .where(inArray(viewings.contactId, contactIds))
    .orderBy(asc(viewings.startsAt));
  const views: TourView[] = [];
  for (const r of rows)
    views.push({
      id: r.id,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      type: r.type,
      status: r.status,
      what: r.title ? `${r.reference} · ${r.title}` : (r.projectName ?? ""),
      href: r.slug ? `/property/${r.slug}` : r.projectSlug ? `/projects/${r.projectSlug}` : null,
      token: await manageTokenFor(r.id),
      feedbackRating: r.feedbackRating,
    });
  return {
    upcoming: views.filter((v) => v.endsAt >= now && v.status !== "cancelled"),
    past: views.filter((v) => v.endsAt < now || v.status === "cancelled").reverse(),
  };
}

/** Upcoming tours only, for the overview. */
export async function upcomingTours(db: Db, userId: string, now = new Date()) {
  const contactIds = await customerContactIds(db, userId);
  if (contactIds.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(viewings)
    .where(
      and(
        inArray(viewings.contactId, contactIds),
        gte(viewings.endsAt, now),
        inArray(viewings.status, ["requested", "confirmed"]),
      ),
    );
  return row?.n ?? 0;
}

/** What they asked the agency (12 §2 Inquiries): their leads and their own messages. */
export async function inquiriesOf(db: Db, userId: string) {
  const contactIds = await customerContactIds(db, userId);
  if (contactIds.length === 0) return [];
  const rows = await db
    .select({
      id: leads.id,
      source: leads.source,
      status: leads.status,
      createdAt: leads.createdAt,
      propertyIds: leads.propertyIds,
    })
    .from(leads)
    .where(and(inArray(leads.contactId, contactIds), sql`${leads.mergedIntoId} is null`))
    .orderBy(desc(leads.createdAt));
  const out = [];
  for (const r of rows) {
    const events = await db
      .select({ body: leadEvents.body, at: leadEvents.createdAt, meta: leadEvents.meta })
      .from(leadEvents)
      .where(and(eq(leadEvents.leadId, r.id), eq(leadEvents.actorType, "customer")))
      .orderBy(asc(leadEvents.createdAt));
    const homes = r.propertyIds.length
      ? await db
          .select({
            reference: properties.reference,
            title: properties.title,
            slug: properties.slug,
          })
          .from(properties)
          .where(inArray(properties.id, r.propertyIds))
      : [];
    out.push({ ...r, homes, messages: events.filter((e) => e.body) });
  }
  return out;
}

/** Their website chats (12 §2 Chats), read-only until the assistant arrives. */
export async function chatsOf(db: Db, userId: string) {
  const contactIds = await customerContactIds(db, userId);
  if (contactIds.length === 0) return [];
  const convs = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(and(inArray(conversations.contactId, contactIds), eq(conversations.channel, "web_chat")))
    .orderBy(desc(conversations.createdAt));
  const out = [];
  for (const c of convs) {
    const msgs = await db
      .select({ sender: messages.sender, body: messages.body, at: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(asc(messages.createdAt));
    out.push({ ...c, messages: msgs });
  }
  return out;
}

export async function compareCardsOf(db: Db, userId: string) {
  const ids = await compareIds(db, { userId });
  const cards = await loadListingCards(db, ids);
  return ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is ListingCardData => !!c);
}

/** A shared list's homes (12 §2 "share a list by link"): only live listings, no notes. */
export async function sharedList(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const [list] = await db
    .select({ id: savedLists.id, name: savedLists.name, userId: savedLists.userId })
    .from(savedLists)
    .where(eq(savedLists.shareToken, token));
  if (!list) return null;
  const rows = await db
    .select({ propertyId: savedHomes.propertyId })
    .from(savedHomes)
    .where(and(eq(savedHomes.listId, list.id), sql`${savedHomes.propertyId} is not null`))
    .orderBy(desc(savedHomes.createdAt));
  const cards = await loadListingCards(
    db,
    rows.map((r) => r.propertyId!),
  );
  // Drafts and homes taken off the market are not shown to whoever has the link.
  return {
    name: list.name,
    cards: cards.filter((c) => c.status !== "draft" && c.status !== "off_market"),
  };
}
