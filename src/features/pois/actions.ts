"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois } from "@/db/schema/master-data";
import { getMapsProvider, MapsNotConfiguredError } from "@/features/integrations/google-maps";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { lngLatSchema as lngLat, poiInputSchema } from "./schema";

export const savePoi = adminAction(
  z.object({ id: z.uuid().nullable(), data: poiInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const values = {
      ...data,
      address: data.address || null,
      googlePlaceId: data.googlePlaceId || null,
      website: data.website || null,
      ratingNote: data.ratingNote || null,
      updatedBy: ctx.user.id,
    };
    return db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx
          .select()
          .from(pois)
          .where(and(eq(pois.id, id), eq(pois.agencyId, currentAgencyId())));
        if (!before) throw new ActionError("This place no longer exists.", "NOT_FOUND");
        const [after] = await tx.update(pois).set(values).where(eq(pois.id, id)).returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "poi.update",
          entityType: "poi",
          entityId: id,
          before,
          after,
        });
        return { id };
      }
      const [created] = await tx
        .insert(pois)
        .values({ ...values, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "poi.create",
        entityType: "poi",
        entityId: created!.id,
        after: created,
      });
      return { id: created!.id };
    });
  },
);

export const setPoisActive = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500), active: z.boolean() }),
  { write: true },
  async ({ ids, active }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(pois)
        .set({ isActive: active, updatedBy: ctx.user.id })
        .where(and(inArray(pois.id, ids), eq(pois.agencyId, currentAgencyId())));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: active ? "poi.activate" : "poi.deactivate",
        entityType: "poi",
        after: { ids },
      });
    });
    return { count: ids.length };
  },
);

/** Hard delete. Listing distances that used a place are removed with it (re-computed later). */
export const deletePois = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(pois)
        .where(and(inArray(pois.id, ids), eq(pois.agencyId, currentAgencyId())))
        .returning({ id: pois.id, name: pois.name });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "poi.delete",
        entityType: "poi",
        before: { removed },
      });
    });
    return { count: ids.length };
  },
);

/** "Import from Google" step 1: nearby places of one type around a point (07 §1). */
/** Settings -> Integrations "Allow Import from Google for places" (04 §8). */
async function assertImportAllowed(db: Db) {
  const integrations = await loadSettings("integrations", db);
  if (!integrations.googleMaps.importPlaces)
    throw new ActionError(
      "Import from Google is turned off in Settings -> Integrations.",
      "DISABLED",
    );
}

export const searchGooglePlaces = adminAction(
  z.object({
    poiTypeId: z.uuid(),
    center: lngLat,
    radiusM: z.number().int().min(100).max(50_000),
  }),
  { write: true },
  async ({ poiTypeId, center, radiusM }) => {
    const db = await getDb();
    await assertImportAllowed(db);
    const [type] = await db
      .select()
      .from(poiTypes)
      .where(and(eq(poiTypes.id, poiTypeId), eq(poiTypes.agencyId, currentAgencyId())));
    if (!type) throw new ActionError("Choose a POI type.", "VALIDATION");
    if (!type.googlePlaceType) {
      throw new ActionError(
        `Set a Google Places type on "${type.name}" first (Setup -> POI types).`,
        "VALIDATION",
      );
    }
    try {
      const provider = await getMapsProvider(db);
      const results = await provider.nearby({ type: type.googlePlaceType, center, radiusM });
      const existing = results.length
        ? await db
            .select({ id: pois.googlePlaceId })
            .from(pois)
            .where(
              and(
                eq(pois.agencyId, currentAgencyId()),
                isNotNull(pois.googlePlaceId),
                inArray(
                  pois.googlePlaceId,
                  results.map((r) => r.googlePlaceId),
                ),
              ),
            )
        : [];
      const have = new Set(existing.map((e) => e.id));
      return results.map((r) => ({ ...r, alreadyImported: have.has(r.googlePlaceId) }));
    } catch (err) {
      if (err instanceof MapsNotConfiguredError)
        throw new ActionError(err.message, "NOT_CONFIGURED");
      throw new ActionError(`Google Places did not answer: ${(err as Error).message}`, "PROVIDER");
    }
  },
);

/** Step 2: add the chosen places (skips ones already imported). */
export const importGooglePlaces = adminAction(
  z.object({
    poiTypeId: z.uuid(),
    places: z
      .array(
        z.object({
          googlePlaceId: z.string().min(1).max(200),
          name: z.string().trim().min(1).max(150),
          address: z.string().max(300),
          point: lngLat,
          website: z.string().url().nullable(),
        }),
      )
      .min(1)
      .max(60),
  }),
  { write: true },
  async ({ poiTypeId, places }, ctx) => {
    const db = await getDb();
    await assertImportAllowed(db);
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(pois)
        .values(
          places.map((p) => ({
            poiTypeId,
            name: p.name,
            address: p.address || null,
            point: p.point,
            googlePlaceId: p.googlePlaceId,
            website: p.website,
            createdBy: ctx.user.id,
            updatedBy: ctx.user.id,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: pois.id, name: pois.name });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "poi.import_google",
        entityType: "poi",
        after: { poiTypeId, imported: rows.map((r) => r.name) },
      });
      return rows;
    });
    return { imported: inserted.length, skipped: places.length - inserted.length };
  },
);
