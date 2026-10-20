import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { seoRedirects } from "@/db/schema/seo";

/**
 * Automatic 301s when a slug changes (01 §4, 08 §6). Keeps the table free of chains
 * (A->B, B->C becomes A->C, B->C) and loops (a redirect back to the new path is removed).
 */
export async function addRedirect(
  db: DbOrTx,
  input: {
    from: string;
    to: string;
    type?: 301 | 302;
    isAuto?: boolean;
    source?: string;
    actorId?: string | null;
  },
): Promise<void> {
  const from = normalizePath(input.from);
  const to = normalizePath(input.to);
  if (from === to) return;
  const agencyId = currentAgencyId();

  // The new target must not itself redirect back to `from` (loop): drop that old rule.
  await db
    .delete(seoRedirects)
    .where(and(eq(seoRedirects.agencyId, agencyId), eq(seoRedirects.fromPath, to)));
  // Everything that pointed at `from` now points straight at `to` (no chains).
  await db
    .update(seoRedirects)
    .set({ toPath: to, updatedBy: input.actorId ?? null })
    .where(and(eq(seoRedirects.agencyId, agencyId), eq(seoRedirects.toPath, from)));
  await db
    .insert(seoRedirects)
    .values({
      fromPath: from,
      toPath: to,
      type: input.type ?? 301,
      isAuto: input.isAuto ?? true,
      source: input.source ?? null,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
    })
    .onConflictDoUpdate({
      target: [seoRedirects.agencyId, seoRedirects.fromPath],
      set: {
        toPath: to,
        type: input.type ?? 301,
        isAuto: input.isAuto ?? true,
        source: input.source ?? null,
      },
    });
}

/** Public URL patterns per entity, used to create redirects when a slug changes. */
export const publicPaths: Record<string, (slug: string) => string[]> = {
  location: (s) => [`/buy/${s}`, `/rent/${s}`],
  developer: (s) => [`/developers/${s}`],
  agent: (s) => [`/agents/${s}`],
  project: (s) => [`/projects/${s}`],
  property: (s) => [`/property/${s}`],
  page: (s) => [`/${s}`],
  post: (s) => [`/insights/${s}`],
  postCategory: (s) => [`/insights/category/${s}`],
  areaGuide: (s) => [`/areas/${s}`],
};

export async function redirectSlugChange(
  db: DbOrTx,
  input: {
    entity: keyof typeof publicPaths;
    entityId: string;
    oldSlug: string;
    newSlug: string;
    actorId?: string | null;
  },
): Promise<void> {
  if (!input.oldSlug || input.oldSlug === input.newSlug) return;
  const paths = publicPaths[input.entity];
  if (!paths) return;
  const olds = paths(input.oldSlug);
  const news = paths(input.newSlug);
  for (let i = 0; i < olds.length; i++) {
    await addRedirect(db, {
      from: olds[i]!,
      to: news[i]!,
      source: `${input.entity}:${input.entityId}`,
      actorId: input.actorId,
    });
  }
}

export function normalizePath(path: string): string {
  let p = path.trim();
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep as typed */
  }
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.toLowerCase();
}

export async function findRedirect(db: DbOrTx, path: string) {
  const [row] = await db
    .select()
    .from(seoRedirects)
    .where(
      and(
        eq(seoRedirects.agencyId, currentAgencyId()),
        inArray(seoRedirects.fromPath, [normalizePath(path)]),
      ),
    )
    .limit(1);
  return row ?? null;
}
