import { and, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { secrets } from "@/db/schema/system";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { secretKeys, type SecretKey } from "./schema";

/**
 * Integration keys, encrypted at rest (04 §8, 14 §2). Values are only ever decrypted on the
 * server, right before use, and never cached (cache keys/values are stored in plain text).
 */

export async function getSecret(key: SecretKey, db?: DbOrTx): Promise<string | null> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select({ encryptedValue: secrets.encryptedValue })
    .from(secrets)
    .where(and(eq(secrets.agencyId, currentAgencyId()), eq(secrets.key, key)))
    .limit(1);
  if (!row) return null;
  try {
    return await decryptSecret(row.encryptedValue);
  } catch (err) {
    console.error(`[secrets] could not decrypt ${key}:`, (err as Error).message);
    return null;
  }
}

export async function setSecret(
  db: DbOrTx,
  key: SecretKey,
  value: string,
  actor: AuditActor,
): Promise<void> {
  const encryptedValue = await encryptSecret(value);
  const existing = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.agencyId, currentAgencyId()), eq(secrets.key, key)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(secrets)
      .set({ encryptedValue, updatedBy: actor.id, lastError: null, lastTestedAt: null })
      .where(eq(secrets.id, existing[0].id));
  } else {
    await db
      .insert(secrets)
      .values({ key, encryptedValue, createdBy: actor.id, updatedBy: actor.id });
  }
  await writeAudit(db, {
    actor,
    action: existing[0] ? "secret.update" : "secret.create",
    entityType: "secret",
    entityId: key,
    // The value itself is never logged.
    after: { key, value: "[redacted]" },
  });
}

export async function deleteSecret(db: DbOrTx, key: SecretKey, actor: AuditActor): Promise<void> {
  const removed = await db
    .delete(secrets)
    .where(and(eq(secrets.agencyId, currentAgencyId()), eq(secrets.key, key)))
    .returning({ id: secrets.id });
  if (removed.length > 0) {
    await writeAudit(db, { actor, action: "secret.delete", entityType: "secret", entityId: key });
  }
}

export async function recordSecretTest(
  key: SecretKey,
  error: string | null,
  db?: DbOrTx,
): Promise<void> {
  const conn = db ?? (await getDb());
  await conn
    .update(secrets)
    .set({ lastTestedAt: new Date(), lastError: error })
    .where(and(eq(secrets.agencyId, currentAgencyId()), eq(secrets.key, key)));
}

export type SecretStatus = {
  key: SecretKey;
  isSet: boolean;
  masked: string;
  lastTestedAt: Date | null;
  lastError: string | null;
};

/** Masked view for the Settings -> Integrations screen. */
export async function listSecretStatus(db?: DbOrTx): Promise<SecretStatus[]> {
  const conn = db ?? (await getDb());
  const rows = await conn.select().from(secrets).where(eq(secrets.agencyId, currentAgencyId()));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return Promise.all(
    secretKeys.map(async (key) => {
      const row = byKey.get(key);
      if (!row) return { key, isSet: false, masked: "", lastTestedAt: null, lastError: null };
      let masked = "••••••••";
      try {
        masked = maskSecret(await decryptSecret(row.encryptedValue));
      } catch {
        masked = "(cannot decrypt: check SECRETS_ENCRYPTION_KEY)";
      }
      return { key, isSet: true, masked, lastTestedAt: row.lastTestedAt, lastError: row.lastError };
    }),
  );
}
