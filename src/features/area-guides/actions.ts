"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuides } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { fieldError } from "@/features/content/checks";
import { publishingSchema } from "@/features/content/schema";
import { adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { guideSlug, revalidateGuide } from "./load";
import { deleteGuideRecord, saveGuideRecord, setGuidePublishingRecord } from "./save";
import { guideInputSchema, newGuideSchema } from "./schema";

/** "New area guide" (08 §4): one per area; a draft named after it opens in the editor. */
export const createGuide = adminAction(newGuideSchema, { write: true }, async (input, ctx) => {
  const db = await getDb();
  const created = await db.transaction(async (tx) => {
    const [loc] = await tx
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.agencyId, currentAgencyId())));
    if (!loc) return fieldError("locationId", "This area no longer exists.");
    const [taken] = await tx
      .select({ id: areaGuides.id })
      .from(areaGuides)
      .where(and(eq(areaGuides.agencyId, currentAgencyId()), eq(areaGuides.locationId, loc.id)));
    if (taken) fieldError("locationId", "This area already has a guide.");
    const [row] = await tx
      .insert(areaGuides)
      .values({
        locationId: loc.id,
        title: loc.name,
        slug: await guideSlug(tx, loc.name, null),
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning();
    await writeAudit(tx, {
      actor: ctx.actor,
      action: "area_guide.create",
      entityType: "area_guide",
      entityId: row!.id,
      after: { title: row!.title, locationId: row!.locationId },
    });
    return row!;
  });
  revalidateGuide(created.id);
  return { id: created.id };
});

export const saveGuide = adminAction(
  z.object({ id: z.uuid(), data: guideInputSchema, expectedUpdatedAt: z.iso.datetime() }),
  { write: true },
  async ({ id, data, expectedUpdatedAt }, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      saveGuideRecord(tx, { id, data, expectedUpdatedAt, actor: ctx.actor, userId: ctx.user.id }),
    );
    revalidateGuide(id);
    return result;
  },
);

export const setGuidePublishing = adminAction(
  publishingSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      setGuidePublishingRecord(tx, input, { actor: ctx.actor, userId: ctx.user.id }),
    );
    revalidateGuide(input.id);
    return result;
  },
);

export const deleteGuide = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => deleteGuideRecord(tx, id, { actor: ctx.actor }));
    revalidateGuide(id);
    return { id };
  },
);
