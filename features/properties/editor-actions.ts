"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { properties } from "@/db/schema/properties";
import { ActionError, adminAction } from "@/lib/actions";
import { propertyInputSchema, statusSchema } from "./schema";
import { saveListing } from "./save";
import { changeStatus } from "./status-change";
import { revalidateListings } from "./write";

/** The property editor's save (autosave every 10 s and the Save button). */
export const saveProperty = adminAction(
  z.object({ id: z.uuid(), data: propertyInputSchema, expectedUpdatedAt: z.iso.datetime() }),
  { write: true },
  async ({ id, data, expectedUpdatedAt }, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      saveListing(tx, { id, data, expectedUpdatedAt, actor: ctx.actor, userId: ctx.user.id }),
    );
    await revalidateListings([id], result.projectIds);
    return { updatedAt: result.updatedAt, slug: result.slug, pointMoved: result.pointMoved };
  },
);

/** Publish, unpublish, sold, rented… from the editor's status panel (07 §3 publish rules). */
export const setPropertyStatus = adminAction(
  z.object({ id: z.uuid(), status: statusSchema }),
  { write: true },
  async ({ id, status }, ctx) => {
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const r = await changeStatus(tx, { id, next: status, actor: ctx.actor, userId: ctx.user.id });
      if (!r.ok) {
        const fieldErrors: Record<string, string[]> = {};
        for (const p of r.problems) (fieldErrors[p.field] ??= []).push(p.message);
        throw new ActionError(
          status === "available" ? "Not ready to publish yet." : "This status cannot be set yet.",
          "PUBLISH_RULES",
          fieldErrors,
        );
      }
      // The new version for the editor's next save.
      const [row] = await tx
        .select({ updatedAt: properties.updatedAt })
        .from(properties)
        .where(eq(properties.id, id));
      return { ...r, updatedAt: row!.updatedAt.toISOString() };
    });
    await revalidateListings([id], [res.projectId]);
    return { status, updatedAt: res.updatedAt, firstPublish: res.firstPublish };
  },
);
