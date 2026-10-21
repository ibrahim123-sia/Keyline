import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  sql,
} from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { notFoundLog } from "@/db/schema/content";
import type { TableParams } from "@/lib/table-params";
import { normalizePath, splitQuery } from "./redirect-schema";

/** Files and app addresses are not pages: their misses are left out of the 404 monitor. */
const SKIP =
  /^\/(_next|api|admin|account|media|\.well-known)(\/|$)|\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|txt|xml|json|webmanifest)$/i;

/** Only the address of the page that linked here (no query: it may hold personal data). */
function cleanReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

/** Counts one visit to an address that does not exist (08 §6 404 monitor). */
export async function recordNotFound(
  db: DbOrTx,
  rawPath: string,
  referrer: string | null,
): Promise<boolean> {
  const path = splitQuery(normalizePath(rawPath))[0].slice(0, 500);
  if (path === "/" || SKIP.test(path)) return false;
  const ref = cleanReferrer(referrer);
  await db
    .insert(notFoundLog)
    .values({ path, lastReferrer: ref })
    .onConflictDoUpdate({
      target: [notFoundLog.agencyId, notFoundLog.path],
      set: {
        hits: sql`${notFoundLog.hits} + 1`,
        lastSeenAt: sql`now()`,
        lastReferrer: sql`coalesce(excluded.last_referrer, ${notFoundLog.lastReferrer})`,
      },
    });
  return true;
}

export const notFoundSortable = ["hits", "lastSeen", "firstSeen", "path"] as const;
export type NotFoundSort = (typeof notFoundSortable)[number];

export type NotFoundRow = {
  id: string;
  path: string;
  hits: number;
  lastReferrer: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

/** The 404 monitor list: open entries by default, `status=resolved` for the done ones. */
export async function listNotFound(
  db: DbOrTx,
  params: TableParams<NotFoundSort>,
): Promise<{ rows: NotFoundRow[]; total: number; open: number }> {
  const agency = currentAgencyId();
  const resolved = params.get("status") === "resolved";
  const where = and(
    eq(notFoundLog.agencyId, agency),
    resolved ? isNotNull(notFoundLog.resolvedAt) : isNull(notFoundLog.resolvedAt),
    params.q ? ilike(notFoundLog.path, `%${params.q.replace(/[%_]/g, "")}%`) : undefined,
  );
  const column = {
    hits: notFoundLog.hits,
    lastSeen: notFoundLog.lastSeenAt,
    firstSeen: notFoundLog.firstSeenAt,
    path: notFoundLog.path,
  }[params.sort.id];
  const rows = await db
    .select()
    .from(notFoundLog)
    .where(where)
    .orderBy(params.sort.desc ? desc(column) : asc(column), asc(notFoundLog.path))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notFoundLog)
    .where(where);
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notFoundLog)
    .where(and(eq(notFoundLog.agencyId, agency), isNull(notFoundLog.resolvedAt)));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      path: r.path,
      hits: r.hits,
      lastReferrer: r.lastReferrer,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
    total: count?.n ?? 0,
    open: open?.n ?? 0,
  };
}

/** Open entries, for the badge on the 404 monitor tab. */
export async function countOpenNotFound(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notFoundLog)
    .where(and(eq(notFoundLog.agencyId, currentAgencyId()), isNull(notFoundLog.resolvedAt)));
  return row?.n ?? 0;
}

/** Dismiss (done without a redirect) or reopen entries. */
export async function setNotFoundResolved(
  db: DbOrTx,
  ids: string[],
  resolved: boolean,
): Promise<number> {
  const rows = await db
    .update(notFoundLog)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(and(eq(notFoundLog.agencyId, currentAgencyId()), inArray(notFoundLog.id, ids)))
    .returning({ id: notFoundLog.id });
  return rows.length;
}

export const NOT_FOUND_KEEP_DAYS = 90;
export const NOT_FOUND_MAX_ROWS = 5000;

/**
 * Daily clean-up: addresses nobody asked for in 90 days go, and the log keeps at most the
 * 5,000 most-hit addresses (scanners can try thousands).
 */
export async function pruneNotFound(db: DbOrTx, now = new Date()): Promise<number> {
  const agency = currentAgencyId();
  const old = await db
    .delete(notFoundLog)
    .where(
      and(
        eq(notFoundLog.agencyId, agency),
        lt(notFoundLog.lastSeenAt, new Date(now.getTime() - NOT_FOUND_KEEP_DAYS * 86_400_000)),
      ),
    )
    .returning({ id: notFoundLog.id });
  const keep = db
    .select({ id: notFoundLog.id })
    .from(notFoundLog)
    .where(eq(notFoundLog.agencyId, agency))
    .orderBy(desc(notFoundLog.hits), desc(notFoundLog.lastSeenAt))
    .limit(NOT_FOUND_MAX_ROWS);
  const extra = await db
    .delete(notFoundLog)
    .where(and(eq(notFoundLog.agencyId, agency), notInArray(notFoundLog.id, keep)))
    .returning({ id: notFoundLog.id });
  return old.length + extra.length;
}
