import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import {
  badges,
  developers,
  facilities,
  propertyTypes,
  type HideableField,
} from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { projectUnitTypes, projects } from "@/db/schema/projects";
import {
  priceHistory,
  propertyBadges,
  propertyDailyStats,
  propertyPois,
} from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { users } from "@/db/schema/auth";
import { toMediaItem, type MediaItem } from "@/features/media/queries";
import { loadPlans, listTemplates, planInput } from "@/features/payment-plans/store";
import { builtInTemplates, type PlanTemplate } from "@/features/payment-plans/templates";
import type { PaymentPlanInput } from "@/features/payment-plans/schema";
import { listLocationNodes } from "@/features/locations/queries";
import { loadProperty, type PropertyRecord } from "./load";
import type { PropertyInput } from "./schema";

export type EditorOptions = {
  types: Array<{ id: string; name: string; category: string; hidden: HideableField[] }>;
  locations: Array<{ id: string; parentId: string | null; name: string; level: string }>;
  agents: Array<{ id: string; name: string; isActive: boolean }>;
  facilities: Array<{ id: string; name: string; group: string }>;
  badges: Array<{
    id: string;
    name: string;
    color: string;
    textColor: string;
    autoRule: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    developerName: string | null;
    handoverDate: string | null;
    handoverText: string | null;
    constructionProgress: number | null;
    plan: { summaryLabel: string | null; input: PaymentPlanInput } | null;
    unitTypes: Array<{ id: string; name: string; beds: number | null }>;
  }>;
  planTemplates: PlanTemplate[];
};

export type EditorActivity = {
  priceHistory: Array<{
    changedAt: string;
    oldPrice: number | null;
    newPrice: number | null;
    currency: string | null;
  }>;
  views30: number;
  inquiries30: number;
  audit: Array<{ at: string; who: string; action: string; fields: string[] }>;
  autoBadges: Array<{ badgeId: string; reason: string | null; expiresAt: string | null }>;
  poisComputed: boolean;
};

export type EditorData = {
  row: PropertyRecord;
  input: PropertyInput;
  media: Record<string, MediaItem>;
  options: EditorOptions;
  activity: EditorActivity;
};

/** Everything the property editor shows, loaded one query at a time (shared connection). */
export async function loadEditorData(db: DbOrTx, id: string): Promise<EditorData | null> {
  const loaded = await loadProperty(db, id);
  if (!loaded) return null;
  const agency = currentAgencyId();

  const mediaIds = [
    ...new Set([
      ...loaded.input.media.map((m) => m.mediaId),
      ...(loaded.input.ogImageId ? [loaded.input.ogImageId] : []),
    ]),
  ];
  const mediaRows = mediaIds.length
    ? await db.select().from(media).where(inArray(media.id, mediaIds))
    : [];

  const types = await db
    .select({
      id: propertyTypes.id,
      name: propertyTypes.name,
      category: propertyTypes.category,
      hidden: propertyTypes.fieldsHidden,
    })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, agency))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));
  const nodes = await listLocationNodes(db);
  const agentRows = await db
    .select({ id: agents.id, name: agents.name, isActive: agents.isActive })
    .from(agents)
    .where(eq(agents.agencyId, agency))
    .orderBy(asc(agents.name));
  const facilityRows = await db
    .select({ id: facilities.id, name: facilities.name, group: facilities.group })
    .from(facilities)
    .where(eq(facilities.agencyId, agency))
    .orderBy(asc(facilities.sortOrder), asc(facilities.name));
  const badgeRows = await db
    .select({
      id: badges.id,
      name: badges.name,
      color: badges.color,
      textColor: badges.textColor,
      autoRule: badges.autoRule,
    })
    .from(badges)
    .where(eq(badges.agencyId, agency))
    .orderBy(asc(badges.sortOrder), asc(badges.name));
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      developerId: projects.developerId,
      handoverDate: projects.handoverDate,
      handoverText: projects.handoverText,
      constructionProgress: projects.constructionProgress,
      paymentPlanId: projects.paymentPlanId,
    })
    .from(projects)
    .where(and(eq(projects.agencyId, agency), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
  const developerIds = [
    ...new Set(projectRows.flatMap((p) => (p.developerId ? [p.developerId] : []))),
  ];
  const developerRows = developerIds.length
    ? await db
        .select({ id: developers.id, name: developers.name })
        .from(developers)
        .where(inArray(developers.id, developerIds))
    : [];
  const developerNames = new Map(developerRows.map((d) => [d.id, d.name]));
  const unitRows = projectRows.length
    ? await db
        .select({
          id: projectUnitTypes.id,
          projectId: projectUnitTypes.projectId,
          name: projectUnitTypes.name,
          beds: projectUnitTypes.beds,
        })
        .from(projectUnitTypes)
        .where(
          inArray(
            projectUnitTypes.projectId,
            projectRows.map((p) => p.id),
          ),
        )
        .orderBy(asc(projectUnitTypes.sortOrder), asc(projectUnitTypes.name))
    : [];
  const projectPlans = await loadPlans(
    db,
    projectRows.flatMap((p) => (p.paymentPlanId ? [p.paymentPlanId] : [])),
  );
  const saved = await listTemplates(db);

  const history = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.propertyId, id))
    .orderBy(desc(priceHistory.changedAt))
    .limit(50);
  const [stats] = await db
    .select({
      views: sql<number>`coalesce(sum(${propertyDailyStats.views}), 0)::int`,
      inquiries: sql<number>`coalesce(sum(${propertyDailyStats.inquiries}), 0)::int`,
    })
    .from(propertyDailyStats)
    .where(
      and(
        eq(propertyDailyStats.propertyId, id),
        gte(propertyDailyStats.date, sql`current_date - 30`),
      ),
    );
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
    .where(and(eq(auditLog.entityType, "property"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);
  const autoBadgeRows = await db
    .select({
      badgeId: propertyBadges.badgeId,
      reason: propertyBadges.reason,
      expiresAt: propertyBadges.expiresAt,
    })
    .from(propertyBadges)
    .where(and(eq(propertyBadges.propertyId, id), eq(propertyBadges.isAuto, true)));
  const [pois] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(propertyPois)
    .where(eq(propertyPois.propertyId, id));

  return {
    row: loaded.row,
    input: loaded.input,
    media: Object.fromEntries(mediaRows.map((m) => [m.id, toMediaItem(m)])),
    options: {
      types,
      locations: nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        name: n.name,
        level: n.level,
      })),
      agents: agentRows,
      facilities: facilityRows,
      badges: badgeRows,
      projects: projectRows.map((p) => {
        const plan = p.paymentPlanId ? projectPlans.get(p.paymentPlanId) : undefined;
        return {
          id: p.id,
          name: p.name,
          developerName: p.developerId ? (developerNames.get(p.developerId) ?? null) : null,
          handoverDate: p.handoverDate,
          handoverText: p.handoverText,
          constructionProgress: p.constructionProgress,
          plan: plan ? { summaryLabel: plan.summaryLabel, input: planInput(plan) } : null,
          unitTypes: unitRows
            .filter((u) => u.projectId === p.id)
            .map((u) => ({ id: u.id, name: u.name, beds: u.beds })),
        };
      }),
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
      priceHistory: history.map((h) => ({
        changedAt: h.changedAt.toISOString(),
        oldPrice: h.oldPrice,
        newPrice: h.newPrice,
        currency: h.currency,
      })),
      views30: stats?.views ?? 0,
      inquiries30: stats?.inquiries ?? 0,
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
      autoBadges: autoBadgeRows.map((b) => ({
        badgeId: b.badgeId,
        reason: b.reason,
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
      poisComputed: (pois?.n ?? 0) > 0,
    },
  };
}
