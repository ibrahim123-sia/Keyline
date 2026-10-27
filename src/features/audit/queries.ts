import { and, asc, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { auditLog } from "@/db/schema/system";
import type { TableParams } from "@/lib/table-params";

export const auditSortable = ["newest"] as const;
export type AuditSort = (typeof auditSortable)[number];

export type AuditRow = {
  id: string;
  createdAt: string;
  actorType: "admin" | "ai" | "system";
  actorName: string | null;
  confirmedByName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  changedKeys: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Keys that differ between before and after (both are stored already narrowed to changes). */
function changedKeys(before: unknown, after: unknown): string[] {
  if (!isRecord(before) && !isRecord(after)) return [];
  const keys = new Set([
    ...Object.keys(isRecord(before) ? before : {}),
    ...Object.keys(isRecord(after) ? after : {}),
  ]);
  return [...keys].sort();
}

/** Audit log (04 §12): newest first, filtered by admin, module, action and date range. */
export async function listAuditEntries(
  params: TableParams<AuditSort>,
  db?: DbOrTx,
): Promise<{ rows: AuditRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const actor = alias(users, "actor");
  const confirmer = alias(users, "confirmer");
  const where: SQL[] = [eq(auditLog.agencyId, currentAgencyId())];
  const who = params.get("actor");
  if (who === "system") where.push(eq(auditLog.actorType, "system"));
  else if (who === "ai") where.push(eq(auditLog.actorType, "ai"));
  else if (who && /^[0-9a-f-]{36}$/i.test(who)) where.push(eq(auditLog.actorId, who));
  const moduleFilter = params.get("module");
  if (moduleFilter) where.push(eq(auditLog.entityType, moduleFilter));
  if (params.q) where.push(ilike(auditLog.action, `%${params.q.replace(/[\\%_]/g, "\\$&")}%`));
  const from = params.get("from");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from))
    where.push(gte(auditLog.createdAt, new Date(`${from}T00:00:00Z`)));
  const to = params.get("to");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    // Inclusive: everything before the next day.
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    where.push(lt(auditLog.createdAt, end));
  }
  const entity = params.get("entity");
  if (entity) where.push(eq(auditLog.entityId, entity));

  const [rows, [count]] = await Promise.all([
    conn
      .select({ entry: auditLog, actorName: actor.name, confirmedByName: confirmer.name })
      .from(auditLog)
      .leftJoin(actor, eq(actor.id, auditLog.actorId))
      .leftJoin(confirmer, eq(confirmer.id, auditLog.confirmedBy))
      .where(and(...where))
      .orderBy(
        params.sort.desc ? asc(auditLog.createdAt) : desc(auditLog.createdAt),
        desc(auditLog.id),
      )
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(...where)),
  ]);
  return {
    total: count?.n ?? 0,
    rows: rows.map(({ entry: e, actorName, confirmedByName }) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      actorType: e.actorType,
      actorName,
      confirmedByName,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: e.before,
      after: e.after,
      ip: e.ip,
      userAgent: e.userAgent,
      changedKeys: changedKeys(e.before, e.after),
    })),
  };
}

/** Values for the filters: modules seen in the log, and every admin who appears in it. */
export async function auditFilterOptions(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [modules, actors] = await Promise.all([
    conn
      .selectDistinct({ entityType: auditLog.entityType })
      .from(auditLog)
      .where(eq(auditLog.agencyId, currentAgencyId()))
      .orderBy(asc(auditLog.entityType)),
    conn
      .selectDistinct({ id: users.id, name: users.name })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(eq(auditLog.agencyId, currentAgencyId()))
      .orderBy(asc(users.name)),
  ]);
  return { modules: modules.map((m) => m.entityType), actors };
}
