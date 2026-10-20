"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { propertyTypes } from "@/db/schema/master-data";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";
import { masterKinds, masterSchemas, type MasterKind } from "./config";
import { genericTable, type AnyMasterRow } from "./tables";
import { describeUsage, usageCounts, usageRefs } from "./usage";

const kindSchema = z.enum(masterKinds);

const entityTypes: Record<MasterKind, string> = {
  "property-types": "property_type",
  facilities: "facility",
  badges: "badge",
  "poi-types": "poi_type",
};

function entityType(kind: MasterKind): string {
  return entityTypes[kind];
}

async function findRow(
  kind: MasterKind,
  id: string,
  db?: DbOrTx,
): Promise<AnyMasterRow | undefined> {
  db ??= await getDb();
  const table = genericTable(kind);
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.agencyId, currentAgencyId())))
    .limit(1);
  return row as AnyMasterRow | undefined;
}

/** Create or update one item. Slugs (property types) are generated and kept unique. */
export const saveMasterItem = adminAction(
  z.object({ kind: kindSchema, id: z.uuid().nullable(), data: z.unknown() }),
  { write: true },
  async ({ kind, id, data }, ctx) => {
    const parsed = masterSchemas[kind].safeParse(data);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ActionError("Please check the highlighted fields.", "VALIDATION", fieldErrors);
    }
    const values: Record<string, unknown> = { ...parsed.data };
    const db = await getDb();
    const table = genericTable(kind);

    if (kind === "property-types") {
      // Slug from: what the admin typed, else the plural name ("apartments"), else the name.
      const wanted =
        (values.slug as string) || (values.pluralName as string) || (values.name as string);
      values.slug = await uniqueSlug(wanted, async (candidates) => {
        const rows = await db
          .select({ slug: propertyTypes.slug })
          .from(propertyTypes)
          .where(
            and(
              eq(propertyTypes.agencyId, currentAgencyId()),
              inArray(propertyTypes.slug, candidates),
              id ? sql`${propertyTypes.id} <> ${id}` : sql`true`,
            ),
          );
        return new Set(rows.map((r) => r.slug));
      });
      values.pluralName = (values.pluralName as string) || null;
    }

    return db.transaction(async (tx) => {
      if (id) {
        // Inside a transaction, read through `tx`: another connection would wait on this one.
        const before = await findRow(kind, id, tx);
        if (!before) throw new ActionError("This item no longer exists.", "NOT_FOUND");
        const [after] = await tx
          .update(table)
          .set({ ...values, updatedBy: ctx.user.id } as never)
          .where(eq(table.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: `${entityType(kind)}.update`,
          entityType: entityType(kind),
          entityId: id,
          before,
          after,
        });
        updateTag(tags.masterData(kind));
        return after as AnyMasterRow;
      }
      const [{ next }] = (await tx
        .select({ next: sql<number>`coalesce(max(${table.sortOrder}), -1) + 1` })
        .from(table)
        .where(eq(table.agencyId, currentAgencyId()))) as [{ next: number }];
      const [created] = await tx
        .insert(table)
        .values({
          ...values,
          sortOrder: Number(next),
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        } as never)
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: `${entityType(kind)}.create`,
        entityType: entityType(kind),
        entityId: (created as AnyMasterRow).id,
        after: created,
      });
      updateTag(tags.masterData(kind));
      return created as AnyMasterRow;
    });
  },
);

/** Drag-to-reorder: stores the new order. */
export const reorderMasterItems = adminAction(
  z.object({ kind: kindSchema, ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ kind, ids }, ctx) => {
    const db = await getDb();
    const table = genericTable(kind);
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(table)
          .set({ sortOrder: index } as never)
          .where(and(eq(table.id, id), eq(table.agencyId, currentAgencyId())));
      }
      await writeAudit(tx, {
        actor: ctx.actor,
        action: `${entityType(kind)}.reorder`,
        entityType: entityType(kind),
        after: { order: ids },
      });
    });
    updateTag(tags.masterData(kind));
    return { count: ids.length };
  },
);

/** Safe delete (07 §1): blocked while anything still uses the item. */
export const deleteMasterItem = adminAction(
  z.object({ kind: kindSchema, id: z.uuid() }),
  { write: true },
  async ({ kind, id }, ctx) => {
    const db = await getDb();
    const before = await findRow(kind, id);
    if (!before) throw new ActionError("This item no longer exists.", "NOT_FOUND");
    const usage = (await usageCounts(db, kind, [id])).get(id)!;
    if (usage.total > 0) {
      throw new ActionError(
        `Still used by ${describeUsage(usage.parts)}. Merge it into another item instead.`,
        "IN_USE",
      );
    }
    const table = genericTable(kind);
    await db.transaction(async (tx) => {
      await tx.delete(table).where(eq(table.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: `${entityType(kind)}.delete`,
        entityType: entityType(kind),
        entityId: id,
        before,
      });
    });
    updateTag(tags.masterData(kind));
    return { id };
  },
);

/** "Merge into…": moves every reference to the target, then deletes the source. */
export const mergeMasterItem = adminAction(
  z.object({ kind: kindSchema, fromId: z.uuid(), toId: z.uuid() }),
  { write: true },
  async ({ kind, fromId, toId }, ctx) => {
    if (fromId === toId)
      throw new ActionError("Choose a different item to merge into.", "SAME_ITEM");
    const [from, to] = await Promise.all([findRow(kind, fromId), findRow(kind, toId)]);
    if (!from || !to) throw new ActionError("One of the items no longer exists.", "NOT_FOUND");
    const db = await getDb();
    const table = genericTable(kind);
    const usage = (await usageCounts(db, kind, [fromId])).get(fromId)!;
    await db.transaction(async (tx) => {
      for (const ref of usageRefs(kind)) await ref.merge(tx, fromId, toId);
      await tx.delete(table).where(eq(table.id, fromId));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: `${entityType(kind)}.merge`,
        entityType: entityType(kind),
        entityId: fromId,
        before: from,
        after: { mergedInto: toId, name: to.name, moved: usage.parts },
      });
    });
    updateTag(tags.masterData(kind));
    return { moved: usage.total };
  },
);
