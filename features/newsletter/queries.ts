import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { newsletterSubscribers as ns } from "@/db/schema/crm";

export const subscriberStatuses = ["confirmed", "pending", "unsubscribed"] as const;
export type SubscriberStatus = (typeof subscriberStatuses)[number];

export type SubscriberRow = {
  id: string;
  email: string;
  source: string | null;
  status: SubscriberStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

const statusOf = (r: {
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}): SubscriberStatus =>
  r.unsubscribedAt ? "unsubscribed" : r.confirmedAt ? "confirmed" : "pending";

function conditions(filter: { q: string; status: SubscriberStatus | null }): SQL {
  const parts: SQL[] = [eq(ns.agencyId, currentAgencyId())];
  if (filter.q) parts.push(ilike(ns.email, `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`));
  if (filter.status === "unsubscribed") parts.push(isNotNull(ns.unsubscribedAt));
  if (filter.status === "confirmed")
    parts.push(isNotNull(ns.confirmedAt), isNull(ns.unsubscribedAt));
  if (filter.status === "pending") parts.push(isNull(ns.confirmedAt), isNull(ns.unsubscribedAt));
  return and(...parts)!;
}

/** Campaigns -> Newsletter: subscribers, newest first, with counts per status. */
export async function listSubscribers(
  db: DbOrTx,
  filter: { q: string; status: SubscriberStatus | null; page: number; pageSize: number },
): Promise<{ rows: SubscriberRow[]; total: number; counts: Record<SubscriberStatus, number> }> {
  const rows = await db
    .select()
    .from(ns)
    .where(conditions(filter))
    .orderBy(desc(ns.createdAt))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ns)
    .where(conditions(filter));
  const [c] = await db
    .select({
      confirmed: sql<number>`(count(*) filter (where ${ns.confirmedAt} is not null and ${ns.unsubscribedAt} is null))::int`,
      pending: sql<number>`(count(*) filter (where ${ns.confirmedAt} is null and ${ns.unsubscribedAt} is null))::int`,
      unsubscribed: sql<number>`(count(*) filter (where ${ns.unsubscribedAt} is not null))::int`,
    })
    .from(ns)
    .where(eq(ns.agencyId, currentAgencyId()));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      source: r.source,
      status: statusOf(r),
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
      unsubscribedAt: r.unsubscribedAt,
    })),
    total: count?.n ?? 0,
    counts: {
      confirmed: c?.confirmed ?? 0,
      pending: c?.pending ?? 0,
      unsubscribed: c?.unsubscribed ?? 0,
    },
  };
}

/** Every subscriber matching the filter, for the CSV export. */
export async function subscribersForExport(
  db: DbOrTx,
  filter: { q: string; status: SubscriberStatus | null },
): Promise<SubscriberRow[]> {
  const rows = await db.select().from(ns).where(conditions(filter)).orderBy(desc(ns.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    source: r.source,
    status: statusOf(r),
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    unsubscribedAt: r.unsubscribedAt,
  }));
}

export const parseStatus = (v: unknown): SubscriberStatus | null =>
  typeof v === "string" && (subscriberStatuses as readonly string[]).includes(v)
    ? (v as SubscriberStatus)
    : null;
