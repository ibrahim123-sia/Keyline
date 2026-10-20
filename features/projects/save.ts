import "server-only";
import { and, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers, facilities, locations } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { projectFacilities, projectMedia, projectUnitTypes, projects } from "@/db/schema/projects";
import { syncMediaUsage } from "@/features/media/usage";
import { deletePlan, writePlan } from "@/features/payment-plans/store";
import { queueProjectPoiCompute } from "@/features/pois/distances";
import { planProblem } from "@/features/payment-plans/schema";
import { fitsKind } from "@/features/properties/save";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError } from "@/lib/actions";
import { auditChange, type AuditActor } from "@/lib/audit";
import { renderRichText } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import { loadProject, projectMediaIds } from "./load";
import { projectPublishProblems, type ProjectInput } from "./schema";
import { projectSlug } from "./write";

export type ProjectSaveResult = {
  updatedAt: string;
  slug: string;
  pointMoved: boolean;
};

const fieldError = (field: string, message: string): never => {
  throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
    [field]: [message],
  });
};

/** Alt text of the library files behind these photos (for the publish rule). */
export async function libraryAltFor(tx: Tx, p: ProjectInput): Promise<Map<string, string | null>> {
  const ids = p.media.filter((m) => m.kind === "photo").map((m) => m.mediaId);
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: media.id, alt: media.alt })
    .from(media)
    .where(inArray(media.id, ids));
  return new Map(rows.map((r) => [r.id, r.alt]));
}

/** Every id in the input points at something of this agency that can be used. */
async function checkReferences(tx: Tx, projectId: string, data: ProjectInput) {
  const agency = currentAgencyId();
  if (data.developerId) {
    const [d] = await tx
      .select({ id: developers.id })
      .from(developers)
      .where(
        and(
          eq(developers.id, data.developerId),
          eq(developers.agencyId, agency),
          isNull(developers.deletedAt),
        ),
      );
    if (!d) fieldError("developerId", "This developer no longer exists.");
  }
  if (data.locationId) {
    const [l] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, data.locationId), eq(locations.agencyId, agency)));
    if (!l) fieldError("locationId", "This location no longer exists.");
  }
  if (data.facilityIds.length) {
    const found = await tx
      .select({ id: facilities.id })
      .from(facilities)
      .where(and(inArray(facilities.id, data.facilityIds), eq(facilities.agencyId, agency)));
    if (found.length !== new Set(data.facilityIds).size)
      fieldError("facilityIds", "Some facilities no longer exist. Reload the page.");
  }
  const unitIds = data.unitTypes.map((u) => u.id);
  if (new Set(unitIds).size !== unitIds.length)
    fieldError("unitTypes", "Two unit types have the same id. Reload the page.");
  if (unitIds.length) {
    const elsewhere = await tx
      .select({ id: projectUnitTypes.id })
      .from(projectUnitTypes)
      .where(and(inArray(projectUnitTypes.id, unitIds), ne(projectUnitTypes.projectId, projectId)));
    if (elsewhere.length) fieldError("unitTypes", "A unit type belongs to another project.");
  }
  const ids = projectMediaIds(data);
  if (ids.length === 0) return;
  const files = await tx
    .select({ id: media.id, mime: media.mime, status: media.status })
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.agencyId, agency)));
  const byId = new Map(files.map((f) => [f.id, f]));
  const check = (
    id: string | null,
    field: string,
    kind: Parameters<typeof fitsKind>[0],
    name: string,
  ) => {
    if (!id) return;
    const file = byId.get(id);
    if (!file || file.status === "failed")
      fieldError(field, "A file was removed from the library. Reload the page.");
    if (!fitsKind(kind, file!.mime))
      fieldError(field, `This file (${file!.mime}) cannot be used as ${name}.`);
  };
  for (const m of data.media)
    check(m.mediaId, "media", m.kind, m.kind === "photo" ? "a photo" : "this file");
  check(data.masterPlanId, "masterPlanId", "floor_plan", "a master plan");
  check(data.brochureId, "brochureId", "brochure", "a brochure");
  data.unitTypes.forEach((u, i) =>
    check(u.floorPlanId, `unitTypes.${i}.floorPlanId`, "floor_plan", "a floor plan"),
  );
  if (data.ogImageId && !byId.has(data.ogImageId))
    fieldError("ogImageId", "This image was removed from the library.");
}

/** Photos first in the order given; one cover photo. */
function orderedMedia(data: ProjectInput) {
  const photos = data.media.filter((m) => m.kind === "photo");
  const cover = photos.find((m) => m.isCover) ?? photos[0];
  const counters = new Map<string, number>();
  return data.media.map((m) => {
    const n = counters.get(m.kind) ?? 0;
    counters.set(m.kind, n + 1);
    return { ...m, sortOrder: n, isCover: m.kind === "photo" && m === cover };
  });
}

/**
 * Saves the project editor (07 §6). A published project must keep passing the publish rules.
 * Unit types are updated in place (listings point at them); removed ones are deleted.
 */
export async function saveProjectRecord(
  tx: Tx,
  args: {
    id: string;
    data: ProjectInput;
    expectedUpdatedAt: string;
    actor: AuditActor;
    userId: string;
  },
  now = new Date(),
): Promise<ProjectSaveResult> {
  const loaded = await loadProject(tx, args.id);
  if (!loaded) throw new ActionError("This project no longer exists.", "NOT_FOUND");
  const { row, input: before } = loaded;
  if (row.deletedAt) throw new ActionError("This project was deleted.", "NOT_FOUND");
  if (row.updatedAt.toISOString() !== args.expectedUpdatedAt)
    throw new ActionError(
      "Someone else saved this project since you opened it. Reload to see their changes; yours stay on this page until you do.",
      "CONFLICT",
    );
  const data = args.data;
  await checkReferences(tx, row.id, data);

  if (row.isPublished) {
    const problems = projectPublishProblems(data, {
      libraryAlt: await libraryAltFor(tx, data),
      planProblem: data.paymentPlan ? planProblem(data.paymentPlan.steps) : null,
    });
    if (problems.length > 0) {
      const fieldErrors: Record<string, string[]> = {};
      for (const p of problems) (fieldErrors[p.field] ??= []).push(p.message);
      throw new ActionError(
        "This project is published, so these must stay filled in. Fix them, or unpublish it first.",
        "LIVE_RULES",
        fieldErrors,
      );
    }
  }

  // Never-published projects follow their name until the admin sets the slug by hand.
  const followsName = row.publishedAt === null && row.slug === slugify(row.name);
  const slugBase = data.slug && !(followsName && data.slug === row.slug) ? data.slug : data.name;
  const slug = await projectSlug(tx, slugBase, row.id);

  let paymentPlanId = row.paymentPlanId;
  if (data.paymentPlan) {
    paymentPlanId = await writePlan(tx, {
      id: row.paymentPlanId,
      input: data.paymentPlan,
      isTemplate: false,
      actor: args.actor,
      userId: args.userId,
    });
  } else if (row.paymentPlanId) {
    await deletePlan(tx, row.paymentPlanId, args.actor);
    paymentPlanId = null;
  }

  const progressChanged =
    (row.constructionProgress ?? null) !== (data.constructionProgress ?? null);
  const [after] = await tx
    .update(projects)
    .set({
      name: data.name,
      developerId: data.developerId,
      locationId: data.locationId,
      point: data.point,
      status: data.status,
      isFeatured: data.isFeatured,
      launchDate: data.launchDate,
      handoverDate: data.handoverDate,
      handoverText: data.handoverText || null,
      constructionProgress: data.constructionProgress,
      ...(progressChanged
        ? { progressUpdatedAt: data.constructionProgress == null ? null : now }
        : {}),
      startingPrice: data.startingPrice,
      currency: data.currency,
      totalUnits: data.totalUnits,
      unitTypesSummary: data.unitTypesSummary || null,
      description: data.description,
      descriptionHtml: renderRichText(data.description) || null,
      highlights: data.highlights,
      masterPlanId: data.masterPlanId,
      brochureId: data.brochureId,
      videoUrl: data.videoUrl,
      tourUrl: data.tourUrl,
      paymentPlanId,
      slug,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      canonicalUrl: data.canonicalUrl,
      noindex: data.noindex,
      ogImageId: data.ogImageId,
      updatedBy: args.userId,
    })
    .where(eq(projects.id, row.id))
    .returning();

  await tx.delete(projectMedia).where(eq(projectMedia.projectId, row.id));
  const items = orderedMedia(data);
  if (items.length)
    await tx.insert(projectMedia).values(
      items.map((m) => ({
        projectId: row.id,
        mediaId: m.mediaId,
        kind: m.kind,
        sortOrder: m.sortOrder,
        isCover: m.isCover,
        caption: m.caption || null,
        alt: m.alt || null,
      })),
    );
  await tx.delete(projectFacilities).where(eq(projectFacilities.projectId, row.id));
  const facilityIds = [...new Set(data.facilityIds)];
  if (facilityIds.length)
    await tx
      .insert(projectFacilities)
      .values(facilityIds.map((facilityId) => ({ projectId: row.id, facilityId })));

  // Unit types: keep ids (listings link to them), update, add, remove.
  const keep = data.unitTypes.map((u) => u.id);
  await tx
    .delete(projectUnitTypes)
    .where(
      keep.length
        ? and(eq(projectUnitTypes.projectId, row.id), notInArray(projectUnitTypes.id, keep))
        : eq(projectUnitTypes.projectId, row.id),
    );
  const existing = new Set(before.unitTypes.map((u) => u.id));
  for (const [i, u] of data.unitTypes.entries()) {
    const values = {
      name: u.name,
      beds: u.beds,
      baths: u.baths,
      sizeMin: u.sizeMin,
      sizeMax: u.sizeMax,
      priceFrom: u.priceFrom,
      floorPlanId: u.floorPlanId,
      availableCount: u.availableCount,
      sortOrder: i,
    };
    if (existing.has(u.id))
      await tx.update(projectUnitTypes).set(values).where(eq(projectUnitTypes.id, u.id));
    else await tx.insert(projectUnitTypes).values({ id: u.id, projectId: row.id, ...values });
  }

  if (row.publishedAt && row.slug !== slug)
    await redirectSlugChange(tx, {
      entity: "project",
      entityId: row.id,
      oldSlug: row.slug,
      newSlug: slug,
      actorId: args.userId,
    });

  const { paymentPlan: _a, ...beforeAudit } = before;
  const { paymentPlan: _b, ...afterAudit } = { ...data, slug };
  await auditChange(tx, {
    actor: args.actor,
    action: "project.update",
    entityType: "project",
    entityId: row.id,
    before: beforeAudit,
    after: afterAudit,
  });
  await syncMediaUsage(tx, [...projectMediaIds(before), ...projectMediaIds(data)]);

  const pointMoved =
    (before.point?.lng ?? null) !== (data.point?.lng ?? null) ||
    (before.point?.lat ?? null) !== (data.point?.lat ?? null);
  // A dropped or moved pin measures the nearby places again (in the background).
  if (pointMoved && data.point) await queueProjectPoiCompute(tx, row.id);
  return { updatedAt: after!.updatedAt.toISOString(), slug, pointMoved };
}
