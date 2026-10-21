"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { redirectSlugChange } from "@/features/seo/redirects";
import { geocode as geocodeQuery } from "@/features/locations/geocode";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { syncMediaUsage } from "@/features/media/usage";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";
import { getLocationForAdmin, listLocationNodes, locationUsage } from "./queries";
import { locationInputSchema, validParentLevel, wouldCycle } from "./schema";

export const saveLocation = adminAction(
  z.object({ id: z.uuid().nullable(), data: locationInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const nodes = await listLocationNodes(db);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parent = data.parentId ? byId.get(data.parentId) : null;
    if (data.parentId && !parent)
      throw new ActionError("The parent location no longer exists.", "VALIDATION");
    if (!validParentLevel(parent?.level ?? null, data.level)) {
      throw new ActionError("A location must be a smaller level than its parent.", "VALIDATION", {
        level: [`A ${data.level} cannot sit under a ${parent!.level}.`],
      });
    }
    if (id && wouldCycle(id, data.parentId, new Map(nodes.map((n) => [n.id, n.parentId])))) {
      throw new ActionError("A location cannot be moved inside itself.", "VALIDATION", {
        parentId: ["Choose a parent outside this location."],
      });
    }

    const slug = await uniqueSlug(data.slug || data.name, async (candidates) => {
      const rows = await db
        .select({ slug: locations.slug })
        .from(locations)
        .where(
          and(
            eq(locations.agencyId, currentAgencyId()),
            inArray(locations.slug, candidates),
            id ? sql`${locations.id} <> ${id}` : sql`true`,
          ),
        );
      return new Set(rows.map((r) => r.slug));
    });

    const values = {
      parentId: data.parentId,
      level: data.level,
      name: data.name,
      slug,
      center: data.center,
      geom: data.geom,
      description: data.description || null,
      isFeatured: data.isFeatured,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      canonicalUrl: data.canonicalUrl || null,
      noindex: data.noindex,
      ogImageId: data.ogImageId,
      updatedBy: ctx.user.id,
    };

    const saved = await db.transaction(async (tx) => {
      if (id) {
        const before = await getLocationForAdmin(id, tx);
        if (!before) throw new ActionError("This location no longer exists.", "NOT_FOUND");
        const [after] = await tx
          .update(locations)
          .set(values)
          .where(eq(locations.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "location.update",
          entityType: "location",
          entityId: id,
          before: { ...before, geom: before.geom ? "[shape]" : null },
          after: { ...after, geom: after!.geom ? "[shape]" : null },
        });
        await redirectSlugChange(tx, {
          entity: "location",
          entityId: id,
          oldSlug: before.slug,
          newSlug: slug,
          actorId: ctx.user.id,
        });
        await syncMediaUsage(tx, [before.ogImageId, after!.ogImageId]);
        return after!;
      }
      const siblings = nodes.filter((n) => n.parentId === data.parentId);
      const [created] = await tx
        .insert(locations)
        .values({
          ...values,
          sortOrder: siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0,
          createdBy: ctx.user.id,
        })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "location.create",
        entityType: "location",
        entityId: created!.id,
        after: { ...created, geom: created!.geom ? "[shape]" : null },
      });
      await syncMediaUsage(tx, [created!.ogImageId]);
      return created!;
    });
    updateTag(tags.locations);
    updateTag(tags.redirects);
    return { id: saved.id, slug: saved.slug };
  },
);

export const deleteLocation = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const before = await getLocationForAdmin(id, db);
    if (!before) throw new ActionError("This location no longer exists.", "NOT_FOUND");
    const usage = await locationUsage(id, db);
    if (usage.total > 0) {
      const parts = [
        usage.children ? `${usage.children} sub-locations` : "",
        usage.agents ? `${usage.agents} agent profiles` : "",
        usage.listings ? `${usage.listings} listings` : "",
        usage.projects ? `${usage.projects} projects` : "",
        usage.guides ? "its area guide" : "",
      ].filter(Boolean);
      throw new ActionError(
        `Still used by ${parts.join(" and ")}. Move or remove those first.`,
        "IN_USE",
      );
    }
    await db.transaction(async (tx) => {
      await tx.delete(locations).where(eq(locations.id, id));
      await syncMediaUsage(tx, [before.ogImageId]);
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "location.delete",
        entityType: "location",
        entityId: id,
        before: { ...before, geom: before.geom ? "[shape]" : null },
      });
    });
    updateTag(tags.locations);
    return { id };
  },
);

export const reorderLocations = adminAction(
  z.object({ parentId: z.uuid().nullable(), ids: z.array(z.uuid()).min(1).max(1000) }),
  { write: true },
  async ({ parentId, ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(locations)
          .set({ sortOrder: index })
          .where(
            and(
              eq(locations.id, id),
              eq(locations.agencyId, currentAgencyId()),
              parentId ? eq(locations.parentId, parentId) : sql`${locations.parentId} is null`,
            ),
          );
      }
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "location.reorder",
        entityType: "location",
        after: { parentId, order: ids },
      });
    });
    updateTag(tags.locations);
    return { count: ids.length };
  },
);

/** Address search for the pin picker (Google Geocoding when a key is configured). */
export const geocodeAddress = adminAction(z.string().trim().min(2).max(200), {}, async (query) =>
  geocodeQuery(query),
);

/** Full record for the editor (geometry included), loaded when a node is selected. */
export const getLocationDetail = adminAction(z.uuid(), {}, async (id) => {
  const db = await getDb();
  const row = await getLocationForAdmin(id, db);
  if (!row) throw new ActionError("This location no longer exists.", "NOT_FOUND");
  const usage = await locationUsage(id, db);
  return { ...row, usage };
});
