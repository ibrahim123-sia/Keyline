"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers, locations } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { syncMediaUsage } from "@/features/media/usage";
import { deletePlan } from "@/features/payment-plans/store";
import { planProblem } from "@/features/payment-plans/schema";
import { revalidateListings } from "@/features/properties/write";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { loadProject, projectMediaIds } from "./load";
import { libraryAltFor, saveProjectRecord } from "./save";
import {
  createListingsSchema,
  newProjectSchema,
  projectInputSchema,
  projectPublishProblems,
} from "./schema";
import { createUnitListings } from "./unit-listings";
import { projectSlug, revalidateProject } from "./write";

/** "New project" (07 §6): name, developer and location; it opens in the editor next. */
export const createProject = adminAction(newProjectSchema, { write: true }, async (input, ctx) => {
  const db = await getDb();
  const created = await db.transaction(async (tx) => {
    const [developer] = await tx
      .select({ id: developers.id })
      .from(developers)
      .where(
        and(
          eq(developers.id, input.developerId),
          eq(developers.agencyId, currentAgencyId()),
          isNull(developers.deletedAt),
        ),
      );
    if (!developer)
      throw new ActionError("Choose the developer.", "VALIDATION", {
        developerId: ["This developer no longer exists."],
      });
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.agencyId, currentAgencyId())));
    if (!location)
      throw new ActionError("Choose the location.", "VALIDATION", {
        locationId: ["This location no longer exists."],
      });
    const market = await loadSettings("market", tx);
    const [row] = await tx
      .insert(projects)
      .values({
        name: input.name,
        slug: await projectSlug(tx, input.name, null),
        developerId: developer.id,
        locationId: location.id,
        currency: market.baseCurrency.code,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning();
    await writeAudit(tx, {
      actor: ctx.actor,
      action: "project.create",
      entityType: "project",
      entityId: row!.id,
      after: { name: row!.name, developerId: row!.developerId, locationId: row!.locationId },
    });
    return row!;
  });
  revalidateProject(created.id);
  return { id: created.id, slug: created.slug };
});

/** The project editor's save (autosave every 10 s and the Save button). */
export const saveProject = adminAction(
  z.object({ id: z.uuid(), data: projectInputSchema, expectedUpdatedAt: z.iso.datetime() }),
  { write: true },
  async ({ id, data, expectedUpdatedAt }, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      saveProjectRecord(tx, { id, data, expectedUpdatedAt, actor: ctx.actor, userId: ctx.user.id }),
    );
    revalidateProject(id);
    return { updatedAt: result.updatedAt, slug: result.slug };
  },
);

/** Publish or unpublish (07 §6). Publishing checks the rules against the saved project. */
export const setProjectPublished = adminAction(
  z.object({ id: z.uuid(), published: z.boolean() }),
  { write: true },
  async ({ id, published }, ctx) => {
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const loaded = await loadProject(tx, id);
      if (!loaded || loaded.row.deletedAt)
        throw new ActionError("This project no longer exists.", "NOT_FOUND");
      const { row, input } = loaded;
      if (row.isPublished === published)
        return { updatedAt: row.updatedAt.toISOString(), firstPublish: false };
      if (published) {
        const problems = projectPublishProblems(input, {
          libraryAlt: await libraryAltFor(tx, input),
          planProblem: input.paymentPlan ? planProblem(input.paymentPlan.steps) : null,
        });
        if (problems.length) {
          const fieldErrors: Record<string, string[]> = {};
          for (const p of problems) (fieldErrors[p.field] ??= []).push(p.message);
          throw new ActionError("Not ready to publish yet.", "PUBLISH_RULES", fieldErrors);
        }
      }
      const firstPublish = published && row.publishedAt === null;
      const [after] = await tx
        .update(projects)
        .set({
          isPublished: published,
          ...(firstPublish ? { publishedAt: new Date() } : {}),
          updatedBy: ctx.user.id,
        })
        .where(eq(projects.id, id))
        .returning();
      await auditChange(tx, {
        actor: ctx.actor,
        action: published ? "project.publish" : "project.unpublish",
        entityType: "project",
        entityId: id,
        before: { isPublished: row.isPublished, publishedAt: row.publishedAt },
        after: { isPublished: after!.isPublished, publishedAt: after!.publishedAt },
      });
      return { updatedAt: after!.updatedAt.toISOString(), firstPublish };
    });
    revalidateProject(id);
    return { published, ...res };
  },
);

/** Safe delete: only an unpublished project that no listing belongs to. */
export const deleteProject = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const loaded = await loadProject(tx, id);
      if (!loaded || loaded.row.deletedAt)
        throw new ActionError("This project no longer exists.", "NOT_FOUND");
      if (loaded.row.isPublished)
        throw new ActionError("Unpublish this project before deleting it.", "PUBLISHED");
      const [linked] = await tx
        .select({ n: count() })
        .from(properties)
        .where(eq(properties.projectId, id));
      const n = Number(linked?.n ?? 0);
      if (n > 0)
        throw new ActionError(
          `${n} ${n === 1 ? "listing belongs" : "listings belong"} to this project. Link them elsewhere or delete them first.`,
          "IN_USE",
        );
      if (loaded.row.paymentPlanId) await deletePlan(tx, loaded.row.paymentPlanId, ctx.actor);
      await tx.delete(projects).where(eq(projects.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "project.delete",
        entityType: "project",
        entityId: id,
        before: { name: loaded.row.name, slug: loaded.row.slug },
      });
      await syncMediaUsage(tx, projectMediaIds(loaded.input));
    });
    revalidateProject(id);
    return { id };
  },
);

/** "Create listings from unit types" (07 §6). */
export const createListingsFromUnitTypes = adminAction(
  createListingsSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const created = await db.transaction((tx) =>
      createUnitListings(tx, { ...input, actor: ctx.actor, userId: ctx.user.id }),
    );
    await revalidateListings(
      created.map((c) => c.id),
      [input.projectId],
    );
    return { created };
  },
);
