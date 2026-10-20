import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { facilities, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties, type PropertyStatus } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { developerOptions } from "@/features/developers/queries";
import { listLocationNodes } from "@/features/locations/queries";
import { toMediaItem, type MediaItem } from "@/features/media/queries";
import { listTemplates } from "@/features/payment-plans/store";
import { builtInTemplates, type PlanTemplate } from "@/features/payment-plans/templates";
import { loadProject, projectMediaIds, type ProjectRecord } from "./load";
import type { ProjectInput } from "./schema";

export type ProjectEditorOptions = {
  developers: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; parentId: string | null; name: string; level: string }>;
  facilities: Array<{ id: string; name: string; group: string }>;
  propertyTypes: Array<{ id: string; name: string }>;
  planTemplates: PlanTemplate[];
};

export type ProjectActivity = {
  listings: Array<{
    id: string;
    reference: string;
    title: string;
    status: PropertyStatus;
    unitTypeId: string | null;
  }>;
  audit: Array<{ at: string; who: string; action: string; fields: string[] }>;
};

export type ProjectEditorData = {
  row: ProjectRecord;
  input: ProjectInput;
  media: Record<string, MediaItem>;
  options: ProjectEditorOptions;
  activity: ProjectActivity;
};

/** Everything the project editor shows, loaded one query at a time (shared connection). */
export async function loadProjectEditorData(
  db: DbOrTx,
  id: string,
): Promise<ProjectEditorData | null> {
  const loaded = await loadProject(db, id);
  if (!loaded || loaded.row.deletedAt) return null;
  const agency = currentAgencyId();
  const ids = projectMediaIds(loaded.input);
  const mediaRows = ids.length ? await db.select().from(media).where(inArray(media.id, ids)) : [];
  const developerRows = await developerOptions(db);
  const nodes = await listLocationNodes(db);
  const facilityRows = await db
    .select({ id: facilities.id, name: facilities.name, group: facilities.group })
    .from(facilities)
    .where(eq(facilities.agencyId, agency))
    .orderBy(asc(facilities.sortOrder), asc(facilities.name));
  const typeRows = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, agency))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));
  const saved = await listTemplates(db);
  const listingRows = await db
    .select({
      id: properties.id,
      reference: properties.reference,
      title: properties.title,
      status: properties.status,
      unitTypeId: properties.projectUnitTypeId,
    })
    .from(properties)
    .where(and(eq(properties.projectId, id), isNull(properties.deletedAt)))
    .orderBy(asc(properties.reference))
    .limit(200);
  const auditRows = await db
    .select({
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      actorType: auditLog.actorType,
      after: auditLog.after,
      name: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, "project"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);

  return {
    row: loaded.row,
    input: loaded.input,
    media: Object.fromEntries(mediaRows.map((m) => [m.id, toMediaItem(m)])),
    options: {
      developers: developerRows,
      locations: nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        name: n.name,
        level: n.level,
      })),
      facilities: facilityRows,
      propertyTypes: typeRows,
      planTemplates: [
        ...builtInTemplates,
        ...saved.map((t) => ({
          key: t.id,
          name: t.name,
          summaryLabel: t.summaryLabel ?? "",
          builtIn: false,
          steps: t.steps,
        })),
      ],
    },
    activity: {
      listings: listingRows,
      audit: auditRows.map((a) => ({
        at: a.createdAt.toISOString(),
        who:
          a.name ?? (a.actorType === "system" ? "System" : a.actorType === "ai" ? "AI" : "Admin"),
        action: a.action,
        fields:
          a.after && typeof a.after === "object" && !Array.isArray(a.after)
            ? Object.keys(a.after as Record<string, unknown>).slice(0, 8)
            : [],
      })),
    },
  };
}
