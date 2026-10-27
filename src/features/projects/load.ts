import { and, asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { projectFacilities, projectMedia, projectUnitTypes, projects } from "@/db/schema/projects";
import { loadPlan, planInput } from "@/features/payment-plans/store";
import type { ProjectInput } from "./schema";

export type ProjectRecord = typeof projects.$inferSelect;

/** A project as the editor works with it, plus its stored row. */
export async function loadProject(
  db: DbOrTx,
  id: string,
): Promise<{ row: ProjectRecord; input: ProjectInput } | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.agencyId, currentAgencyId())));
  if (!row) return null;
  // One after another: inside a transaction they share one connection.
  const mediaRows = await db
    .select()
    .from(projectMedia)
    .where(eq(projectMedia.projectId, id))
    .orderBy(
      sql`array_position(array['photo','floor_plan','video','brochure','document']::text[], ${projectMedia.kind})`,
      asc(projectMedia.sortOrder),
    );
  const facilityRows = await db
    .select({ id: projectFacilities.facilityId })
    .from(projectFacilities)
    .where(eq(projectFacilities.projectId, id));
  const unitRows = await db
    .select()
    .from(projectUnitTypes)
    .where(eq(projectUnitTypes.projectId, id))
    .orderBy(asc(projectUnitTypes.sortOrder), asc(projectUnitTypes.createdAt));
  const plan = row.paymentPlanId ? await loadPlan(db, row.paymentPlanId) : null;
  return {
    row,
    input: {
      name: row.name,
      developerId: row.developerId,
      locationId: row.locationId,
      point: row.point,
      status: row.status,
      isFeatured: row.isFeatured,
      launchDate: row.launchDate,
      handoverDate: row.handoverDate,
      handoverText: row.handoverText ?? "",
      constructionProgress: row.constructionProgress,
      startingPrice: row.startingPrice,
      currency: row.currency ?? "USD",
      totalUnits: row.totalUnits,
      unitTypesSummary: row.unitTypesSummary ?? "",
      description: row.description,
      highlights: row.highlights,
      media: mediaRows.map((m) => ({
        mediaId: m.mediaId,
        kind: m.kind,
        isCover: m.isCover,
        caption: m.caption ?? "",
        alt: m.alt ?? "",
      })),
      masterPlanId: row.masterPlanId,
      brochureId: row.brochureId,
      videoUrl: row.videoUrl,
      tourUrl: row.tourUrl,
      facilityIds: facilityRows.map((f) => f.id),
      unitTypes: unitRows.map((u) => ({
        id: u.id,
        name: u.name,
        beds: u.beds,
        baths: u.baths,
        sizeMin: u.sizeMin,
        sizeMax: u.sizeMax,
        priceFrom: u.priceFrom,
        floorPlanId: u.floorPlanId,
        availableCount: u.availableCount,
      })),
      paymentPlan: plan ? planInput(plan) : null,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      noindex: row.noindex,
      ogImageId: row.ogImageId,
    },
  };
}

/** Every file a project uses (gallery, master plan, brochure, floor plans, share image). */
export function projectMediaIds(p: ProjectInput): string[] {
  return [
    ...new Set(
      [
        ...p.media.map((m) => m.mediaId),
        p.masterPlanId,
        p.brochureId,
        p.ogImageId,
        ...p.unitTypes.map((u) => u.floorPlanId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
