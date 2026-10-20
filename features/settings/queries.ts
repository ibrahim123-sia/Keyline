import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { settings, type SettingGroup } from "@/db/schema/system";
import { tags } from "@/lib/cache-tags";
import { readGroup, type SettingsOf } from "./schema";

/**
 * Uncached read. Use in Server Actions, route handlers and jobs (always fresh; pass a
 * transaction to read inside it).
 */
export async function loadSettings<G extends SettingGroup>(
  group: G,
  db?: DbOrTx,
): Promise<SettingsOf<G>> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.agencyId, currentAgencyId()), eq(settings.group, group)))
    .limit(1);
  const { value, invalidKeys } = readGroup(group, row?.value);
  if (invalidKeys.length > 0) {
    console.warn(
      `[settings] ${group}: stored keys fell back to defaults: ${invalidKeys.join(", ")}`,
    );
  }
  return value;
}

/**
 * Cached read for rendering (part of the static shell). Saving a group revalidates its tag,
 * so a change in the admin shows on the site without a deploy.
 */
export async function getSettings<G extends SettingGroup>(group: G): Promise<SettingsOf<G>> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.settings(group), tags.allSettings);
  return loadSettings(group);
}

/** Raw stored row (admin editor shows "last updated by"). */
export async function loadSettingsRow(group: SettingGroup, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(settings)
    .where(and(eq(settings.agencyId, currentAgencyId()), eq(settings.group, group)))
    .limit(1);
  return row ?? null;
}
