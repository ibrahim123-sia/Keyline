"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { projectPois, projects } from "@/db/schema/projects";
import { pendingProjectPoiJob, queueProjectPoiCompute } from "@/features/pois/distances";
import { listProjectPois } from "@/features/pois/nearby-queries";
import { runJob } from "@/jobs/runner";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";

/** The project editor's "Nearby" section (07 §6, same rules as listings, 07 §4.5). */

export const recalculateProjectPois = adminAction(
  z.object({ projectId: z.uuid() }),
  { write: true },
  async ({ projectId }, ctx) => {
    const db = await getDb();
    const [project] = await db
      .select({ id: projects.id, point: projects.point })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.agencyId, currentAgencyId())));
    if (!project) throw new ActionError("This project no longer exists.", "NOT_FOUND");
    if (!project.point)
      throw new ActionError("Drop the pin on the map first, then recalculate.", "NO_PIN");
    const jobId =
      (await queueProjectPoiCompute(db, projectId)) ?? (await pendingProjectPoiJob(db, projectId));
    // Run it here so the admin sees the result; a queue worker that gets it later skips it.
    if (jobId) await runJob(jobId);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "project.pois_recalculate",
      entityType: "project",
      entityId: projectId,
    });
    updateTag(tags.project(projectId));
    return listProjectPois(db, projectId);
  },
);

export const updateProjectPoi = adminAction(
  z
    .object({
      id: z.uuid(),
      isShown: z.boolean().optional(),
      /** Shown on the site instead of the measured time; empty removes it. */
      overrideText: z.string().trim().max(120, "Use at most 120 characters").optional(),
    })
    .strict()
    .refine((v) => v.isShown !== undefined || v.overrideText !== undefined, "Nothing to change"),
  { write: true },
  async ({ id, isShown, overrideText }, ctx) => {
    const db = await getDb();
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(projectPois)
        .where(and(eq(projectPois.id, id), eq(projectPois.agencyId, currentAgencyId())));
      if (!before) throw new ActionError("This place is no longer on the project.", "NOT_FOUND");
      const [after] = await tx
        .update(projectPois)
        .set({
          ...(isShown !== undefined ? { isShown } : {}),
          ...(overrideText !== undefined
            ? { overrideText: overrideText || null, isManualOverride: overrideText.length > 0 }
            : {}),
        })
        .where(eq(projectPois.id, id))
        .returning();
      const pick = (r: typeof before) => ({
        poiId: r.poiId,
        isShown: r.isShown,
        overrideText: r.overrideText,
      });
      await auditChange(tx, {
        actor: ctx.actor,
        action: "project.poi_update",
        entityType: "project",
        entityId: before.projectId,
        before: pick(before),
        after: pick(after!),
      });
      updateTag(tags.project(before.projectId));
      return {
        id,
        isShown: after!.isShown,
        overrideText: after!.overrideText,
        isManualOverride: after!.isManualOverride,
      };
    });
  },
);

/** Drag to order: `ids` is every place on the project, in the new order. */
export const reorderProjectPois = adminAction(
  z.object({ projectId: z.uuid(), ids: z.array(z.uuid()).min(1).max(300) }).strict(),
  { write: true },
  async ({ projectId, ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: projectPois.id })
        .from(projectPois)
        .where(
          and(eq(projectPois.projectId, projectId), eq(projectPois.agencyId, currentAgencyId())),
        );
      const have = new Set(rows.map((r) => r.id));
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== have.size ||
        ids.some((i) => !have.has(i))
      )
        throw new ActionError("The list changed in the meantime. Reload and try again.", "STALE");
      for (const [i, id] of ids.entries())
        await tx.update(projectPois).set({ sortOrder: i }).where(eq(projectPois.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "project.pois_reorder",
        entityType: "project",
        entityId: projectId,
        after: { order: ids },
      });
    });
    updateTag(tags.project(projectId));
    return { ids };
  },
);
