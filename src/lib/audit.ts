import { auditLog, type ActorType } from "@/db/schema/system";
import type { DbOrTx } from "@/db/client";
import { newId } from "@/lib/ids";
import { currentRequestMeta, type RequestMeta } from "@/lib/request";

export type AuditActor = {
  type: ActorType;
  /** Admin user id for admin/AI actions; null for system jobs. */
  id: string | null;
  /** For AI actions: the admin who confirmed it. */
  confirmedBy?: string | null;
};

export type AuditEntry = {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta;
};

/** Keys never written to the audit log in clear (passwords, tokens, secret values). */
const REDACTED_KEYS = /password|secret|token|apikey|api_key|encrypted/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACTED_KEYS.test(k) ? (v == null ? v : "[redacted]") : redact(v);
    }
    return out;
  }
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Before/after with only the changed top-level keys, so entries stay small but still show
 * exactly what changed. Nested objects (settings groups) are diffed one level deeper.
 */
export function diffForAudit(
  before: unknown,
  after: unknown,
): { before: unknown; after: unknown; changed: boolean } {
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return { before, after, changed: !same(before, after) };
  }
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "updatedAt" || key === "updatedBy") continue;
    const bv = before[key];
    const av = after[key];
    if (same(bv, av)) continue;
    if (isPlainObject(bv) && isPlainObject(av)) {
      const inner = diffForAudit(bv, av);
      b[key] = inner.before;
      a[key] = inner.after;
    } else {
      b[key] = bv;
      a[key] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 || Object.keys(b).length > 0 };
}

function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(redact(value)));
}

/**
 * Writes one audit entry (01 §1.11: every admin change, who/what/when/before/after).
 * Call it inside the same transaction as the change so both commit or neither does.
 */
export async function writeAudit(db: DbOrTx, entry: AuditEntry): Promise<string> {
  const meta = entry.meta ?? (await currentRequestMeta());
  const id = newId();
  await db.insert(auditLog).values({
    id,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    confirmedBy: entry.actor.confirmedBy ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: toJson(entry.before),
    after: toJson(entry.after),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return id;
}

/** Diff + write in one call; skips the write when nothing changed. */
export async function auditChange(
  db: DbOrTx,
  entry: Omit<AuditEntry, "before" | "after"> & { before: unknown; after: unknown },
): Promise<string | null> {
  const d = diffForAudit(entry.before, entry.after);
  if (!d.changed) return null;
  return writeAudit(db, { ...entry, before: d.before, after: d.after });
}
