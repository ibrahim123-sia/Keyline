import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { propertyTypes } from "@/db/schema/master-data";
import { projectUnitTypes } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { refreshAutoBadges } from "@/features/properties/badges";
import { nextPropertyReference } from "@/features/properties/reference";
import { searchTextFor } from "@/features/properties/save";
import { propertySlug } from "@/features/properties/write";
import { loadSettings } from "@/features/settings/queries";
import { ActionError } from "@/lib/actions";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { loadProject } from "./load";

export type CreatedListing = { id: string; reference: string; title: string };

/**
 * "Create listings from unit types" (07 §6): draft listings with the project's location, pin,
 * handover and progress and the unit type's beds, baths, size and starting price. They show
 * the project's payment plan (no plan of their own).
 */
export async function createUnitListings(
  tx: Tx,
  args: {
    projectId: string;
    propertyTypeId: string;
    items: Array<{ unitTypeId: string; count: number }>;
    actor: AuditActor;
    userId: string;
  },
): Promise<CreatedListing[]> {
  const loaded = await loadProject(tx, args.projectId);
  if (!loaded || loaded.row.deletedAt)
    throw new ActionError("This project no longer exists.", "NOT_FOUND");
  const project = loaded.row;
  const [type] = await tx
    .select({ id: propertyTypes.id })
    .from(propertyTypes)
    .where(
      and(eq(propertyTypes.id, args.propertyTypeId), eq(propertyTypes.agencyId, currentAgencyId())),
    );
  if (!type)
    throw new ActionError("Choose a property type.", "VALIDATION", {
      propertyTypeId: ["This property type no longer exists."],
    });
  const units = await tx
    .select()
    .from(projectUnitTypes)
    .where(
      and(
        eq(projectUnitTypes.projectId, project.id),
        inArray(
          projectUnitTypes.id,
          args.items.map((i) => i.unitTypeId),
        ),
      ),
    );
  if (units.length !== new Set(args.items.map((i) => i.unitTypeId)).size)
    throw new ActionError(
      "A unit type was removed from this project. Save the project and try again.",
      "NOT_FOUND",
    );
  const market = await loadSettings("market", tx);
  const searchText = await searchTextFor(tx, {
    locationId: project.locationId,
    projectId: project.id,
    propertyTypeId: type.id,
  });
  const created: CreatedListing[] = [];
  for (const item of args.items) {
    const unit = units.find((u) => u.id === item.unitTypeId)!;
    for (let n = 0; n < item.count; n++) {
      const reference = await nextPropertyReference(tx);
      const title = `${unit.name} at ${project.name}`.slice(0, 120);
      const [row] = await tx
        .insert(properties)
        .values({
          reference,
          title,
          slug: await propertySlug(tx, title, null),
          purpose: "sale",
          completion: "off_plan",
          status: "draft",
          propertyTypeId: type.id,
          locationId: project.locationId,
          point: project.point,
          projectId: project.id,
          projectUnitTypeId: unit.id,
          beds: unit.beds,
          baths: unit.baths,
          size: unit.sizeMin ?? unit.sizeMax,
          price: unit.priceFrom,
          currency: project.currency ?? market.baseCurrency.code,
          handoverDate: project.handoverDate,
          handoverText: project.handoverText,
          constructionProgress: project.constructionProgress,
          searchText,
          source: "manual",
          createdBy: args.userId,
          updatedBy: args.userId,
        })
        .returning({ id: properties.id });
      await writeAudit(tx, {
        actor: args.actor,
        action: "property.create",
        entityType: "property",
        entityId: row!.id,
        after: { reference, title, fromProject: project.id, unitType: unit.name },
      });
      created.push({ id: row!.id, reference, title });
    }
  }
  await refreshAutoBadges(
    tx,
    created.map((c) => c.id),
  );
  return created;
}
