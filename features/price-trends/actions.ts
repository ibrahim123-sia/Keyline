"use server";

import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { areaPriceStats } from "@/db/schema/stats";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { toMajor, toMinor } from "@/lib/money";
import { perAreaFromSqm, perAreaToSqm } from "@/lib/units";
import { priceFigureSchema, type PriceFigureRow } from "./schema";

/** Typed figure -> stored minor units per m², rents per year. */
async function toStored(median: number, purpose: "sale" | "rent") {
  const market = await loadSettings("market");
  const perUnit = toMinor(median, market.baseCurrency.decimals);
  const yearly = purpose === "rent" && market.rentPeriod === "month" ? perUnit * 12 : perUnit;
  return {
    value: Math.round(perAreaToSqm(yearly, market.areaUnit)),
    currency: market.baseCurrency.code,
  };
}

/** Every figure for a location, newest first, in the market's units (Setup -> Locations). */
export const listPriceFigures = adminAction(
  z.strictObject({ locationId: z.uuid() }),
  {},
  async ({ locationId }): Promise<PriceFigureRow[]> => {
    const db = await getDb();
    const market = await loadSettings("market", db);
    const rows = await db
      .select()
      .from(areaPriceStats)
      .where(
        and(
          eq(areaPriceStats.agencyId, currentAgencyId()),
          eq(areaPriceStats.locationId, locationId),
        ),
      )
      .orderBy(desc(areaPriceStats.period), areaPriceStats.purpose)
      .limit(500);
    return rows.map((r) => {
      const perUnit = perAreaFromSqm(r.medianPricePerArea, market.areaUnit);
      const shown = r.purpose === "rent" && market.rentPeriod === "month" ? perUnit / 12 : perUnit;
      return {
        id: r.id,
        month: r.period.slice(0, 7),
        purpose: r.purpose,
        propertyTypeId: r.propertyTypeId,
        source: r.source,
        median: Math.round(toMajor(shown, market.baseCurrency.decimals) * 100) / 100,
        listingsCount: r.listingsCount,
        dealsCount: r.dealsCount,
        sourceNote: r.sourceNote,
      };
    });
  },
);

/** Adds or changes an admin-entered monthly figure (audited). */
export const savePriceFigure = adminAction(
  priceFigureSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const agency = currentAgencyId();
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.agencyId, agency)));
    if (!loc) throw new ActionError("This location no longer exists.", "NOT_FOUND");
    if (input.propertyTypeId) {
      const [type] = await db
        .select({ id: propertyTypes.id })
        .from(propertyTypes)
        .where(and(eq(propertyTypes.id, input.propertyTypeId), eq(propertyTypes.agencyId, agency)));
      if (!type)
        throw new ActionError("Choose a property type.", "VALIDATION", {
          propertyTypeId: ["This property type no longer exists."],
        });
    }
    const { value, currency } = await toStored(input.median, input.purpose);
    const period = `${input.month}-01`;
    const values = {
      locationId: input.locationId,
      period,
      purpose: input.purpose,
      propertyTypeId: input.propertyTypeId,
      medianPricePerArea: value,
      currency,
      listingsCount: input.listingsCount ?? 0,
      source: "admin_entered" as const,
      sourceNote: input.sourceNote,
      updatedBy: ctx.user.id,
    };
    const id = await db.transaction(async (tx) => {
      // One entered figure per month, purpose and type: a second one for the same slot is refused.
      const [clash] = await tx
        .select({ id: areaPriceStats.id })
        .from(areaPriceStats)
        .where(
          and(
            eq(areaPriceStats.agencyId, agency),
            eq(areaPriceStats.locationId, input.locationId),
            eq(areaPriceStats.period, period),
            eq(areaPriceStats.purpose, input.purpose),
            eq(areaPriceStats.source, "admin_entered"),
            input.propertyTypeId
              ? eq(areaPriceStats.propertyTypeId, input.propertyTypeId)
              : isNull(areaPriceStats.propertyTypeId),
            input.id ? ne(areaPriceStats.id, input.id) : undefined,
          ),
        );
      if (clash)
        throw new ActionError("There is already a figure for this month.", "VALIDATION", {
          month: ["There is already a figure for this month, purpose and type. Edit that one."],
        });
      if (input.id) {
        const [before] = await tx
          .select()
          .from(areaPriceStats)
          .where(
            and(
              eq(areaPriceStats.id, input.id),
              eq(areaPriceStats.agencyId, agency),
              eq(areaPriceStats.source, "admin_entered"),
            ),
          );
        if (!before) throw new ActionError("This figure no longer exists.", "NOT_FOUND");
        const [after] = await tx
          .update(areaPriceStats)
          .set(values)
          .where(eq(areaPriceStats.id, input.id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "price_stat.update",
          entityType: "area_price_stat",
          entityId: input.id,
          before,
          after: after!,
        });
        return input.id;
      }
      const [row] = await tx
        .insert(areaPriceStats)
        .values({ ...values, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "price_stat.create",
        entityType: "area_price_stat",
        entityId: row!.id,
        after: row,
      });
      return row!.id;
    });
    updateTag(tags.priceStats);
    return { id };
  },
);

/** Deletes an admin-entered figure (agency data comes back with the next monthly run). */
export const deletePriceFigure = adminAction(
  z.strictObject({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(areaPriceStats)
        .where(
          and(
            eq(areaPriceStats.id, id),
            eq(areaPriceStats.agencyId, currentAgencyId()),
            eq(areaPriceStats.source, "admin_entered"),
          ),
        )
        .returning();
      if (!row) throw new ActionError("This figure no longer exists.", "NOT_FOUND");
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "price_stat.delete",
        entityType: "area_price_stat",
        entityId: id,
        before: row,
      });
    });
    updateTag(tags.priceStats);
    return { id };
  },
);
