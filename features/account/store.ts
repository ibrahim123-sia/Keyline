import "server-only";
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { compareSets, savedHomes, savedLists, savedSearches } from "@/db/schema/customer";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { ActionError } from "@/lib/actions";
import { bytesToBase64Url } from "@/lib/crypto";
import {
  MAX_COMPARE,
  MAX_SAVED_HOMES,
  MAX_SAVED_SEARCHES,
  polygonOf,
  storedToFilters,
  type StoredFilters,
} from "./searches";

/**
 * Saved homes and lists, saved searches and the compare set (12 §2). Every function takes the
 * customer's id and only ever touches their rows (12 §4 "customers only see their own data").
 */

export type SaveTarget = { propertyId?: string | null; projectId?: string | null };

const notFound = () => new ActionError("This home is no longer listed.", "NOT_FOUND");

/** The customer's default "Saved" list, made on first use. */
export async function defaultListId(db: DbOrTx, userId: string): Promise<string> {
  const [found] = await db
    .select({ id: savedLists.id })
    .from(savedLists)
    .where(and(eq(savedLists.userId, userId), eq(savedLists.isDefault, true)))
    .limit(1);
  if (found) return found.id;
  const [created] = await db
    .insert(savedLists)
    .values({ userId, name: "Saved", isDefault: true })
    .returning({ id: savedLists.id });
  return created!.id;
}

async function ownList(db: DbOrTx, userId: string, listId: string) {
  const [list] = await db
    .select()
    .from(savedLists)
    .where(and(eq(savedLists.id, listId), eq(savedLists.userId, userId)));
  if (!list) throw new ActionError("This list no longer exists.", "NOT_FOUND");
  return list;
}

/** Saves a listing or project (the heart); saving again changes nothing. */
export async function saveHome(
  db: DbOrTx,
  userId: string,
  target: SaveTarget & { listId?: string | null },
): Promise<{ id: string; listId: string }> {
  const agency = currentAgencyId();
  let price: number | null = null;
  let status: string | null = null;
  if (target.propertyId) {
    const [p] = await db
      .select({ price: properties.price, status: properties.status })
      .from(properties)
      .where(
        and(
          eq(properties.id, target.propertyId),
          eq(properties.agencyId, agency),
          isNull(properties.deletedAt),
          isNotNull(properties.publishedAt),
        ),
      );
    if (!p) throw notFound();
    price = p.price;
    status = p.status;
  } else if (target.projectId) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, target.projectId),
          eq(projects.agencyId, agency),
          eq(projects.isPublished, true),
        ),
      );
    if (!p) throw notFound();
  } else throw new ActionError("Choose a home to save.", "VALIDATION");

  const listId = target.listId
    ? (await ownList(db, userId, target.listId)).id
    : await defaultListId(db, userId);
  const sameTarget = target.propertyId
    ? eq(savedHomes.propertyId, target.propertyId)
    : eq(savedHomes.projectId, target.projectId!);
  const [existing] = await db
    .select({ id: savedHomes.id })
    .from(savedHomes)
    .where(and(eq(savedHomes.listId, listId), sameTarget));
  if (existing) return { id: existing.id, listId };

  const [{ n }] = (await db
    .select({ n: count() })
    .from(savedHomes)
    .where(eq(savedHomes.userId, userId))) as [{ n: number }];
  if (n >= MAX_SAVED_HOMES)
    throw new ActionError(
      `You can keep up to ${MAX_SAVED_HOMES} saved homes. Remove some to save more.`,
      "LIMIT",
    );
  const [row] = await db
    .insert(savedHomes)
    .values({
      userId,
      listId,
      propertyId: target.propertyId ?? null,
      projectId: target.projectId ?? null,
      priceWhenSaved: price,
      statusWhenSaved: status,
    })
    .returning({ id: savedHomes.id });
  return { id: row!.id, listId };
}

/** Unsaves a listing or project from every list (the heart, tapped again). */
export async function unsaveHome(db: DbOrTx, userId: string, target: SaveTarget): Promise<void> {
  const same = target.propertyId
    ? eq(savedHomes.propertyId, target.propertyId)
    : target.projectId
      ? eq(savedHomes.projectId, target.projectId)
      : sql`false`;
  await db.delete(savedHomes).where(and(eq(savedHomes.userId, userId), same));
}

async function ownHome(db: DbOrTx, userId: string, savedHomeId: string) {
  const [home] = await db
    .select()
    .from(savedHomes)
    .where(and(eq(savedHomes.id, savedHomeId), eq(savedHomes.userId, userId)));
  if (!home) throw new ActionError("This saved home no longer exists.", "NOT_FOUND");
  return home;
}

/** Moves a saved home to another of the customer's lists (already there: the copy goes). */
export async function moveHome(db: DbOrTx, userId: string, savedHomeId: string, listId: string) {
  const home = await ownHome(db, userId, savedHomeId);
  const list = await ownList(db, userId, listId);
  if (home.listId === list.id) return;
  const same = home.propertyId
    ? eq(savedHomes.propertyId, home.propertyId)
    : eq(savedHomes.projectId, home.projectId!);
  const [dupe] = await db
    .select({ id: savedHomes.id })
    .from(savedHomes)
    .where(and(eq(savedHomes.listId, list.id), same));
  if (dupe) await db.delete(savedHomes).where(eq(savedHomes.id, home.id));
  else await db.update(savedHomes).set({ listId: list.id }).where(eq(savedHomes.id, home.id));
}

export async function setHomeNote(db: DbOrTx, userId: string, savedHomeId: string, note: string) {
  await ownHome(db, userId, savedHomeId);
  await db
    .update(savedHomes)
    .set({ note: note.trim() || null })
    .where(eq(savedHomes.id, savedHomeId));
}

export async function createList(db: DbOrTx, userId: string, name: string): Promise<string> {
  await defaultListId(db, userId);
  const [{ n }] = (await db
    .select({ n: count() })
    .from(savedLists)
    .where(eq(savedLists.userId, userId))) as [{ n: number }];
  if (n >= 20) throw new ActionError("You can have up to 20 lists.", "LIMIT");
  const [row] = await db
    .insert(savedLists)
    .values({ userId, name: name.trim(), sortOrder: n })
    .returning({ id: savedLists.id });
  return row!.id;
}

export async function renameList(db: DbOrTx, userId: string, listId: string, name: string) {
  await ownList(db, userId, listId);
  await db.update(savedLists).set({ name: name.trim() }).where(eq(savedLists.id, listId));
}

/** Deletes a list of the customer's own; its homes go back to "Saved". */
export async function deleteList(db: DbOrTx, userId: string, listId: string) {
  const list = await ownList(db, userId, listId);
  if (list.isDefault) throw new ActionError("The Saved list stays.", "LOCKED");
  const target = await defaultListId(db, userId);
  const homes = await db.select().from(savedHomes).where(eq(savedHomes.listId, list.id));
  for (const h of homes) await moveHome(db, userId, h.id, target);
  await db.delete(savedLists).where(eq(savedLists.id, list.id));
}

/** Share a list by link (12 §2): a random token; sharing again keeps the same link. */
export async function shareList(db: DbOrTx, userId: string, listId: string): Promise<string> {
  const list = await ownList(db, userId, listId);
  if (list.shareToken) return list.shareToken;
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  await db.update(savedLists).set({ shareToken: token }).where(eq(savedLists.id, list.id));
  return token;
}

export async function unshareList(db: DbOrTx, userId: string, listId: string) {
  await ownList(db, userId, listId);
  await db.update(savedLists).set({ shareToken: null }).where(eq(savedLists.id, listId));
}

/** Which listings and projects the customer has saved (for the hearts). */
export async function savedIds(db: DbOrTx, userId: string) {
  const rows = await db
    .select({ propertyId: savedHomes.propertyId, projectId: savedHomes.projectId })
    .from(savedHomes)
    .where(eq(savedHomes.userId, userId));
  return {
    properties: [...new Set(rows.map((r) => r.propertyId).filter((x): x is string => !!x))],
    projects: [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))],
  };
}

/* Saved searches ----------------------------------------------------------------------- */

export type Frequency = "instant" | "daily" | "weekly" | "off";

export async function saveSearch(
  db: DbOrTx,
  userId: string,
  input: { name: string; filters: StoredFilters; frequency: Frequency },
): Promise<string> {
  const [{ n }] = (await db
    .select({ n: count() })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))) as [{ n: number }];
  if (n >= MAX_SAVED_SEARCHES)
    throw new ActionError(
      `You can keep up to ${MAX_SAVED_SEARCHES} saved searches. Delete one to save another.`,
      "LIMIT",
    );
  const [row] = await db
    .insert(savedSearches)
    .values({
      userId,
      name: input.name.trim(),
      filters: input.filters,
      polygon: polygonOf(storedToFilters(input.filters)),
      alertFrequency: input.frequency,
    })
    .returning({ id: savedSearches.id });
  return row!.id;
}

async function ownSearch(db: DbOrTx, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  if (!row) throw new ActionError("This saved search no longer exists.", "NOT_FOUND");
  return row;
}

export async function updateSearch(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: { name?: string; frequency?: Frequency },
) {
  await ownSearch(db, userId, id);
  await db
    .update(savedSearches)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.frequency ? { alertFrequency: patch.frequency } : {}),
    })
    .where(eq(savedSearches.id, id));
}

/** Deleting a saved search stops its alerts at once (12 §4): its row and sent log go. */
export async function deleteSearch(db: DbOrTx, userId: string, id: string) {
  await ownSearch(db, userId, id);
  await db.delete(savedSearches).where(eq(savedSearches.id, id));
}

/* Compare ------------------------------------------------------------------------------ */

export type CompareOwner = { userId: string } | { visitorKey: string };

const ownerWhere = (owner: CompareOwner) =>
  "userId" in owner
    ? eq(compareSets.userId, owner.userId)
    : and(
        eq(compareSets.agencyId, currentAgencyId()),
        eq(compareSets.visitorKey, owner.visitorKey),
      );

export async function compareIds(db: DbOrTx, owner: CompareOwner): Promise<string[]> {
  const [row] = await db
    .select({ ids: compareSets.propertyIds })
    .from(compareSets)
    .where(ownerWhere(owner));
  return row?.ids ?? [];
}

async function writeCompare(db: DbOrTx, owner: CompareOwner, ids: string[]) {
  const [row] = await db.select({ id: compareSets.id }).from(compareSets).where(ownerWhere(owner));
  if (row)
    await db
      .update(compareSets)
      .set({ propertyIds: ids, updatedAt: new Date() })
      .where(eq(compareSets.id, row.id));
  else
    await db.insert(compareSets).values({
      ...("userId" in owner ? { userId: owner.userId } : { visitorKey: owner.visitorKey }),
      propertyIds: ids,
    });
}

/** Adds or removes a listing in the compare set (up to 4). */
export async function toggleCompare(
  db: DbOrTx,
  owner: CompareOwner,
  propertyId: string,
): Promise<string[]> {
  const ids = await compareIds(db, owner);
  if (ids.includes(propertyId)) {
    const next = ids.filter((id) => id !== propertyId);
    await writeCompare(db, owner, next);
    return next;
  }
  if (ids.length >= MAX_COMPARE)
    throw new ActionError(`Compare up to ${MAX_COMPARE} homes at a time.`, "LIMIT");
  const [p] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        isNotNull(properties.publishedAt),
      ),
    );
  if (!p) throw notFound();
  const next = [...ids, propertyId];
  await writeCompare(db, owner, next);
  return next;
}

/** A guest's compare set joins the customer's when they sign in (12 §1). */
export async function mergeGuestCompare(db: DbOrTx, userId: string, visitorKey: string) {
  const guest = await compareIds(db, { visitorKey });
  if (guest.length === 0) return;
  const mine = await compareIds(db, { userId });
  const merged = [...new Set([...mine, ...guest])].slice(0, MAX_COMPARE);
  await writeCompare(db, { userId }, merged);
  await db
    .delete(compareSets)
    .where(
      and(eq(compareSets.agencyId, currentAgencyId()), eq(compareSets.visitorKey, visitorKey)),
    );
}

/** The customer's lists with their homes count, default first. */
export async function listsOf(db: DbOrTx, userId: string) {
  await defaultListId(db, userId);
  return db
    .select({
      id: savedLists.id,
      name: savedLists.name,
      isDefault: savedLists.isDefault,
      shareToken: savedLists.shareToken,
      homes: sql<number>`(select count(*)::int from ${savedHomes} where ${savedHomes.listId} = ${savedLists.id})`,
    })
    .from(savedLists)
    .where(eq(savedLists.userId, userId))
    .orderBy(
      sql`${savedLists.isDefault} desc`,
      asc(savedLists.sortOrder),
      asc(savedLists.createdAt),
    );
}
