import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers, locations } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { loadSettings } from "@/features/settings/queries";
import type { SettingsOf } from "@/features/settings/schema";
import type { SettingGroup } from "@/db/schema/system";

/**
 * Where each file is used (07 §8 "used-in list"), for the library, safe delete and the
 * `used_count` column. Later phases add their tables (listings, pages, posts...) here.
 */
export type MediaUse = { mediaId: string; label: string; href: string | null };

type Source = (db: DbOrTx, ids: string[]) => Promise<MediaUse[]>;

const agentUses: Source = async (db, ids) => {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      photoId: agents.photoId,
      ogImageId: agents.ogImageId,
    })
    .from(agents)
    .where(
      and(
        eq(agents.agencyId, currentAgencyId()),
        or(inArray(agents.photoId, ids), inArray(agents.ogImageId, ids)),
      ),
    );
  return rows.flatMap((r) => {
    const href = `/admin/setup/agents?id=${r.id}`;
    const uses: MediaUse[] = [];
    if (r.photoId && ids.includes(r.photoId)) {
      uses.push({ mediaId: r.photoId, label: `Agent ${r.name}: photo`, href });
    }
    if (r.ogImageId && ids.includes(r.ogImageId)) {
      uses.push({ mediaId: r.ogImageId, label: `Agent ${r.name}: share image`, href });
    }
    return uses;
  });
};

const developerUses: Source = async (db, ids) => {
  const rows = await db
    .select({
      id: developers.id,
      name: developers.name,
      logoId: developers.logoId,
      ogImageId: developers.ogImageId,
    })
    .from(developers)
    .where(
      and(
        eq(developers.agencyId, currentAgencyId()),
        or(inArray(developers.logoId, ids), inArray(developers.ogImageId, ids)),
      ),
    );
  return rows.flatMap((r) => {
    const href = `/admin/setup/developers?id=${r.id}`;
    const uses: MediaUse[] = [];
    if (r.logoId && ids.includes(r.logoId)) {
      uses.push({ mediaId: r.logoId, label: `Developer ${r.name}: logo`, href });
    }
    if (r.ogImageId && ids.includes(r.ogImageId)) {
      uses.push({ mediaId: r.ogImageId, label: `Developer ${r.name}: share image`, href });
    }
    return uses;
  });
};

const locationUses: Source = async (db, ids) => {
  const rows = await db
    .select({ id: locations.id, name: locations.name, ogImageId: locations.ogImageId })
    .from(locations)
    .where(and(eq(locations.agencyId, currentAgencyId()), inArray(locations.ogImageId, ids)));
  return rows.map((r) => ({
    mediaId: r.ogImageId!,
    label: `Location ${r.name}: share image`,
    href: `/admin/setup/locations?id=${r.id}`,
  }));
};

/** Media ids a settings group points at (logos, favicon, share image). */
export function settingsMediaIds<G extends SettingGroup>(group: G, value: SettingsOf<G>): string[] {
  if (group === "general") {
    const b = value as SettingsOf<"general">;
    return [b.logoLightId, b.logoDarkId, b.faviconId, b.appIconId].filter((x): x is string => !!x);
  }
  if (group === "seo") {
    const s = value as SettingsOf<"seo">;
    return [s.defaultOgImageId, s.organisation.logoId].filter((x): x is string => !!x);
  }
  return [];
}

const settingsUses: Source = async (db, ids) => {
  const general = await loadSettings("general", db);
  const seo = await loadSettings("seo", db);
  const refs: Array<[string | null, string, string]> = [
    [general.logoLightId, "Settings: logo for light backgrounds", "/admin/settings/general"],
    [general.logoDarkId, "Settings: logo for dark backgrounds", "/admin/settings/general"],
    [general.faviconId, "Settings: favicon", "/admin/settings/general"],
    [general.appIconId, "Settings: app icon", "/admin/settings/general"],
    [seo.defaultOgImageId, "SEO: default share image", "/admin/settings/seo"],
    [seo.organisation.logoId, "SEO: organisation logo", "/admin/settings/seo"],
  ];
  return refs
    .filter(([id]) => id !== null && ids.includes(id))
    .map(([id, label, href]) => ({ mediaId: id!, label, href }));
};

const sources: Source[] = [settingsUses, agentUses, developerUses, locationUses];

/** id -> where it is used. Ids that are not used anywhere map to an empty list. */
export async function mediaUsage(db: DbOrTx, ids: string[]): Promise<Map<string, MediaUse[]>> {
  const result = new Map<string, MediaUse[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return result;
  // One after another: `db` is often a transaction, and a transaction is a single connection.
  for (const source of sources) {
    for (const use of await source(db, ids)) result.get(use.mediaId)?.push(use);
  }
  return result;
}

/**
 * Recounts `used_count` for these files. Call it inside the transaction that changes a
 * reference, with both the old and the new ids (nulls are ignored).
 */
export async function syncMediaUsage(db: DbOrTx, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
  if (unique.length === 0) return;
  const usage = await mediaUsage(db, unique);
  for (const [id, uses] of usage) {
    await db
      .update(media)
      .set({ usedCount: uses.length, updatedAt: sql`${media.updatedAt}` })
      .where(and(eq(media.id, id), eq(media.agencyId, currentAgencyId())));
  }
}

/** Nightly repair: recount every file (cheap at library sizes; keeps the column honest). */
export async function recountAllMediaUsage(db: DbOrTx): Promise<{ files: number }> {
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.agencyId, currentAgencyId()));
  for (let i = 0; i < rows.length; i += 500) {
    await syncMediaUsage(
      db,
      rows.slice(i, i + 500).map((r) => r.id),
    );
  }
  return { files: rows.length };
}
