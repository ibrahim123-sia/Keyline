"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { embedAfterChange } from "@/features/ai/embeddings";
import { z } from "zod";
import { getDb, type Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers } from "@/db/schema/master-data";
import { syncMediaUsage } from "@/features/media/usage";
import { addRedirect, publicPaths, redirectSlugChange } from "@/features/seo/redirects";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";
import { getDeveloperForAdmin } from "./queries";
import { developerInputSchema } from "./schema";
import { developerRefs, developerUsage } from "./usage";

async function findDeveloper(tx: Tx, id: string) {
  const row = await getDeveloperForAdmin(id, tx);
  if (!row) throw new ActionError("This developer no longer exists.", "NOT_FOUND");
  return row;
}

function revalidate(id: string) {
  embedAfterChange("developer", [id]);
  updateTag(tags.developers);
  updateTag(tags.developer(id));
  updateTag(tags.redirects);
}

export const saveDeveloper = adminAction(
  z.object({ id: z.uuid().nullable(), data: developerInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      // Slugs stay reserved by every row (the unique index covers them all).
      const slug = await uniqueSlug(data.slug || data.name, async (candidates) => {
        const rows = await tx
          .select({ slug: developers.slug })
          .from(developers)
          .where(
            and(
              eq(developers.agencyId, currentAgencyId()),
              inArray(developers.slug, candidates),
              id ? sql`${developers.id} <> ${id}` : sql`true`,
            ),
          );
        return new Set(rows.map((r) => r.slug));
      });
      const values = {
        name: data.name,
        slug,
        logoId: data.logoId,
        description: data.description || null,
        website: data.website || null,
        establishedYear: data.establishedYear,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        canonicalUrl: data.canonicalUrl || null,
        noindex: data.noindex,
        ogImageId: data.ogImageId,
        updatedBy: ctx.user.id,
      };

      if (id) {
        const before = await findDeveloper(tx, id);
        const [after] = await tx
          .update(developers)
          .set(values)
          .where(eq(developers.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "developer.update",
          entityType: "developer",
          entityId: id,
          before,
          after,
        });
        await redirectSlugChange(tx, {
          entity: "developer",
          entityId: id,
          oldSlug: before.slug,
          newSlug: slug,
          actorId: ctx.user.id,
        });
        await syncMediaUsage(tx, [
          before.logoId,
          before.ogImageId,
          after!.logoId,
          after!.ogImageId,
        ]);
        return after!;
      }
      const [created] = await tx
        .insert(developers)
        .values({ ...values, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "developer.create",
        entityType: "developer",
        entityId: created!.id,
        after: created,
      });
      await syncMediaUsage(tx, [created!.logoId, created!.ogImageId]);
      return created!;
    });
    revalidate(saved.id);
    return { id: saved.id, slug: saved.slug };
  },
);

/** Safe delete (07 §1): refused while projects use the developer. */
export const deleteDeveloper = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await findDeveloper(tx, id);
      const usage = (await developerUsage(tx, [id])).get(id)!;
      if (usage.total > 0) {
        const parts = usage.parts.map((p) => `${p.count} ${p.label}`).join(" and ");
        throw new ActionError(
          `Still used by ${parts}. Merge it into another developer instead.`,
          "IN_USE",
        );
      }
      await tx.delete(developers).where(eq(developers.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "developer.delete",
        entityType: "developer",
        entityId: id,
        before,
      });
      await syncMediaUsage(tx, [before.logoId, before.ogImageId]);
    });
    revalidate(id);
    return { id };
  },
);

/**
 * "Merge into…" (07 §1): moves every reference to the target, deletes the duplicate and sends
 * its public page to the target's page with a 301.
 */
export const mergeDeveloper = adminAction(
  z.object({ fromId: z.uuid(), intoId: z.uuid() }),
  { write: true },
  async ({ fromId, intoId }, ctx) => {
    if (fromId === intoId) throw new ActionError("Choose a different developer.", "VALIDATION");
    const db = await getDb();
    const moved = await db.transaction(async (tx) => {
      const from = await findDeveloper(tx, fromId);
      const into = await findDeveloper(tx, intoId);
      const usage = (await developerUsage(tx, [fromId])).get(fromId)!;
      for (const ref of developerRefs()) {
        // A reference that cannot be re-pointed would be left dangling: a programming error.
        if (!ref.merge) throw new Error(`Developer usage "${ref.label}" has no merge`);
        await ref.merge(tx, fromId, intoId);
      }
      await tx.delete(developers).where(eq(developers.id, fromId));
      const [oldPath] = publicPaths.developer!(from.slug);
      const [newPath] = publicPaths.developer!(into.slug);
      await addRedirect(tx, {
        from: oldPath!,
        to: newPath!,
        source: `developer:${intoId}`,
        actorId: ctx.user.id,
      });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "developer.merge",
        entityType: "developer",
        entityId: intoId,
        before: { merged: { id: from.id, name: from.name, slug: from.slug } },
        after: { into: { id: into.id, name: into.name }, moved: usage.parts },
      });
      await syncMediaUsage(tx, [from.logoId, from.ogImageId]);
      return usage.total;
    });
    revalidate(fromId);
    updateTag(tags.developer(intoId));
    embedAfterChange("developer", [intoId]);
    return { moved };
  },
);
