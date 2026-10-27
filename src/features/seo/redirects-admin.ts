import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { notFoundLog } from "@/db/schema/content";
import { seoRedirects } from "@/db/schema/seo";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import type { TableParams } from "@/lib/table-params";
import {
  analyzeRedirects,
  normalizePath,
  splitQuery,
  type CsvRedirectRow,
  type RedirectData,
} from "./redirect-schema";

export const redirectSortable = ["from", "hits", "lastHit", "created"] as const;
export type RedirectSort = (typeof redirectSortable)[number];

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  type: 301 | 302;
  hits: number;
  lastHitAt: string | null;
  isAuto: boolean;
  source: string | null;
  createdAt: string;
  chain: boolean;
  loop: boolean;
  finalTo: string;
};

async function allRedirects(db: DbOrTx) {
  return db.select().from(seoRedirects).where(eq(seoRedirects.agencyId, currentAgencyId()));
}

/**
 * The redirects list (08 §6): every rule with its hits and whether it chains or loops.
 * Views: kind=auto|manual, warn=1 (chains and loops). Small table: filtered in memory.
 */
export async function listRedirects(
  db: DbOrTx,
  params: TableParams<RedirectSort>,
): Promise<{ rows: RedirectRow[]; total: number; warnings: number; chains: number }> {
  const all = await allRedirects(db);
  const flags = analyzeRedirects(all);
  let rows: RedirectRow[] = all.map((r) => {
    const f = flags.get(r.fromPath)!;
    return {
      id: r.id,
      fromPath: r.fromPath,
      toPath: r.toPath,
      type: r.type === 302 ? 302 : 301,
      hits: r.hits,
      lastHitAt: r.lastHitAt?.toISOString() ?? null,
      isAuto: r.isAuto,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      chain: f.chain,
      loop: f.loop,
      finalTo: f.finalTo,
    };
  });
  const warnings = rows.filter((r) => r.chain || r.loop).length;
  const chains = rows.filter((r) => r.chain).length;
  const kind = params.get("kind");
  if (kind === "auto") rows = rows.filter((r) => r.isAuto);
  if (kind === "manual") rows = rows.filter((r) => !r.isAuto);
  if (params.get("warn") === "1") rows = rows.filter((r) => r.chain || r.loop);
  const q = params.q.toLowerCase();
  if (q) rows = rows.filter((r) => r.fromPath.includes(q) || r.toPath.toLowerCase().includes(q));
  const key: Record<RedirectSort, (r: RedirectRow) => string | number> = {
    from: (r) => r.fromPath,
    hits: (r) => r.hits,
    lastHit: (r) => r.lastHitAt ?? "",
    created: (r) => r.createdAt,
  };
  const get = key[params.sort.id];
  rows.sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const c =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return params.sort.desc ? -c : c;
  });
  const start = (params.page - 1) * params.pageSize;
  return { rows: rows.slice(start, start + params.pageSize), total: rows.length, warnings, chains };
}

/** 404 log entries for these addresses are done once a redirect covers them. */
export async function resolveNotFound(db: DbOrTx, paths: string[]): Promise<void> {
  const bare = paths.map((p) => splitQuery(p)[0]);
  const all = [...new Set([...paths, ...bare])];
  if (all.length === 0) return;
  await db
    .update(notFoundLog)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(notFoundLog.agencyId, currentAgencyId()),
        inArray(notFoundLog.path, all),
        isNull(notFoundLog.resolvedAt),
      ),
    );
}

const snapshot = (r: typeof seoRedirects.$inferSelect) => ({
  fromPath: r.fromPath,
  toPath: r.toPath,
  type: r.type,
});

/** Creates or edits one manual redirect; refuses duplicates and loops. */
export async function writeRedirect(
  tx: Tx,
  id: string | null,
  data: RedirectData,
  actor: AuditActor,
): Promise<typeof seoRedirects.$inferSelect> {
  const all = await allRedirects(tx);
  const clash = all.find((r) => r.fromPath === data.fromPath && r.id !== id);
  if (clash)
    throw new ActionError("There is already a redirect from this address.", "VALIDATION", {
      fromPath: [`Already redirected to ${clash.toPath}`],
    });
  const edges = [
    ...all.filter((r) => r.id !== id),
    { fromPath: data.fromPath, toPath: data.toPath },
  ];
  if (analyzeRedirects(edges).get(data.fromPath)?.loop)
    throw new ActionError("This redirect would send visitors round in a circle.", "VALIDATION", {
      toPath: ["This address leads back to the old one: visitors would go round in a circle"],
    });

  const before = id ? all.find((r) => r.id === id) : undefined;
  if (id && !before) throw new ActionError("This redirect no longer exists.", "NOT_FOUND");
  let row: typeof seoRedirects.$inferSelect;
  if (before) {
    [row] = (await tx
      .update(seoRedirects)
      .set({ ...data, isAuto: false, updatedBy: actor.id })
      .where(eq(seoRedirects.id, before.id))
      .returning()) as [typeof seoRedirects.$inferSelect];
    await auditChange(tx, {
      actor,
      action: "redirect.update",
      entityType: "redirect",
      entityId: row.id,
      before: snapshot(before),
      after: snapshot(row),
    });
  } else {
    [row] = (await tx
      .insert(seoRedirects)
      .values({
        ...data,
        isAuto: false,
        source: "manual",
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning()) as [typeof seoRedirects.$inferSelect];
    await writeAudit(tx, {
      actor,
      action: "redirect.create",
      entityType: "redirect",
      entityId: row.id,
      before: null,
      after: snapshot(row),
    });
  }
  await resolveNotFound(tx, [row.fromPath]);
  return row;
}

export async function removeRedirects(tx: Tx, ids: string[], actor: AuditActor): Promise<number> {
  const rows = await tx
    .delete(seoRedirects)
    .where(and(eq(seoRedirects.agencyId, currentAgencyId()), inArray(seoRedirects.id, ids)))
    .returning();
  for (const r of rows)
    await writeAudit(tx, {
      actor,
      action: "redirect.delete",
      entityType: "redirect",
      entityId: r.id,
      before: snapshot(r),
      after: null,
    });
  return rows.length;
}

/**
 * Imports CSV rows: new addresses are added, known ones get the new target; a row that
 * would close a loop is skipped and reported.
 */
export async function importRedirectRows(
  tx: Tx,
  rows: CsvRedirectRow[],
  actor: AuditActor,
): Promise<{
  created: number;
  updated: number;
  skipped: Array<{ line: number; message: string }>;
}> {
  const all = await allRedirects(tx);
  const byFrom = new Map(all.map((r) => [r.fromPath, r]));
  const edges = new Map(all.map((r) => [r.fromPath, r.toPath]));
  let created = 0;
  let updated = 0;
  const skipped: Array<{ line: number; message: string }> = [];
  for (const row of rows) {
    const trial = new Map(edges).set(row.fromPath, row.toPath);
    const flags = analyzeRedirects([...trial].map(([fromPath, toPath]) => ({ fromPath, toPath })));
    if (flags.get(row.fromPath)?.loop) {
      skipped.push({ line: row.line, message: "Leads back to itself (a redirect loop)" });
      continue;
    }
    edges.set(row.fromPath, row.toPath);
    const existing = byFrom.get(row.fromPath);
    if (existing) {
      if (existing.toPath === row.toPath && existing.type === row.type) continue;
      await tx
        .update(seoRedirects)
        .set({ toPath: row.toPath, type: row.type, isAuto: false, updatedBy: actor.id })
        .where(eq(seoRedirects.id, existing.id));
      updated++;
    } else {
      await tx.insert(seoRedirects).values({
        fromPath: row.fromPath,
        toPath: row.toPath,
        type: row.type,
        isAuto: false,
        source: "import",
        createdBy: actor.id,
        updatedBy: actor.id,
      });
      created++;
    }
  }
  if (created || updated)
    await writeAudit(tx, {
      actor,
      action: "redirect.import",
      entityType: "redirect",
      entityId: null,
      before: null,
      after: { created, updated, skipped: skipped.length },
    });
  await resolveNotFound(
    tx,
    rows.map((r) => r.fromPath),
  );
  return { created, updated, skipped };
}

/** Points every chained redirect straight at where it finally lands (loops are left). */
export async function fixChains(tx: Tx, actor: AuditActor): Promise<number> {
  const all = await allRedirects(tx);
  const flags = analyzeRedirects(all);
  let fixed = 0;
  for (const r of all) {
    const f = flags.get(r.fromPath);
    if (!f?.chain) continue;
    await tx
      .update(seoRedirects)
      .set({ toPath: f.finalTo, updatedBy: actor.id })
      .where(eq(seoRedirects.id, r.id));
    await auditChange(tx, {
      actor,
      action: "redirect.update",
      entityType: "redirect",
      entityId: r.id,
      before: { toPath: r.toPath },
      after: { toPath: f.finalTo },
    });
    fixed++;
  }
  return fixed;
}

/** Old address -> redirect row, trying the address with its query first. */
export async function lookupRedirect(db: DbOrTx, rawPath: string) {
  const full = normalizePath(rawPath);
  const [bare, query] = splitQuery(full);
  const candidates = query ? [full, bare] : [full];
  const rows = await db
    .select()
    .from(seoRedirects)
    .where(
      and(eq(seoRedirects.agencyId, currentAgencyId()), inArray(seoRedirects.fromPath, candidates)),
    );
  const row = candidates.map((c) => rows.find((r) => r.fromPath === c)).find(Boolean);
  if (!row) return null;
  await db
    .update(seoRedirects)
    .set({ hits: sql`${seoRedirects.hits} + 1`, lastHitAt: new Date() })
    .where(eq(seoRedirects.id, row.id));
  // A rule for the bare address keeps the visitor's query (campaign tags and the like).
  const original = splitQuery(rawPath.trim())[1];
  const keepQuery = row.fromPath === bare && original && !row.toPath.includes("?");
  return { row, to: keepQuery ? `${row.toPath}?${original}` : row.toPath };
}
