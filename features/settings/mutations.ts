import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { settings, type SettingGroup } from "@/db/schema/system";
import { settingsMediaIds, syncMediaUsage } from "@/features/media/usage";
import { auditChange, type AuditActor } from "@/lib/audit";
import { loadSettings } from "./queries";
import { settingsSchemas, type SettingsOf } from "./schema";

/**
 * Validates and stores one settings group, with an audit entry holding only the changed keys.
 * The caller revalidates `tags.settings(group)` (updateTag in actions, revalidateTag in jobs).
 */
export async function saveSettings<G extends SettingGroup>(
  db: DbOrTx,
  group: G,
  value: SettingsOf<G>,
  actor: AuditActor,
): Promise<SettingsOf<G>> {
  const parsed = settingsSchemas[group].parse(value) as SettingsOf<G>;
  const before = await loadSettings(group, db);
  await db
    .insert(settings)
    .values({
      agencyId: currentAgencyId(),
      group,
      value: parsed as Record<string, unknown>,
      createdBy: actor.id,
      updatedBy: actor.id,
    })
    .onConflictDoUpdate({
      target: [settings.agencyId, settings.group],
      set: { value: parsed as Record<string, unknown>, updatedBy: actor.id, updatedAt: sql`now()` },
    });
  await auditChange(db, {
    actor,
    action: "settings.update",
    entityType: "settings",
    entityId: group,
    before,
    after: parsed,
  });
  const mediaIds = [...settingsMediaIds(group, before), ...settingsMediaIds(group, parsed)];
  if (mediaIds.length) await syncMediaUsage(db, mediaIds);
  return parsed;
}

/** Merge a partial update into the stored group (used by seeds and small toggles). */
export async function patchSettings<G extends SettingGroup>(
  db: DbOrTx,
  group: G,
  patch: Partial<SettingsOf<G>>,
  actor: AuditActor,
): Promise<SettingsOf<G>> {
  const current = await loadSettings(group, db);
  return saveSettings(db, group, { ...current, ...patch }, actor);
}
