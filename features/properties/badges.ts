import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { badges, type BadgeAutoRule } from "@/db/schema/master-data";
import { priceHistory, properties, propertyBadges } from "@/db/schema/properties";
import { isLiveStatus } from "./status";

const DAY = 86_400_000;
const dayFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type Facts = {
  status: (typeof properties.$inferSelect)["status"];
  completion: (typeof properties.$inferSelect)["completion"];
  publishedAt: Date | null;
  price: number | null;
  originalPrice: number | null;
  isVerified: boolean;
  lastVerifiedAt: Date | null;
  /** When the price last went down, from price history. */
  lastReductionAt: Date | null;
};

/**
 * Whether an automatic badge applies (05 §3 badges.auto_rule), until when, and why. A badge
 * with `autoDays` ends that many days after its event ("New" for 14 days after publishing).
 */
export function autoBadge(
  rule: BadgeAutoRule,
  autoDays: number | null,
  f: Facts,
  now: Date,
): { expiresAt: Date | null; reason: string } | null {
  const until = (from: Date) => (autoDays ? new Date(from.getTime() + autoDays * DAY) : null);
  const current = (from: Date) => !autoDays || from.getTime() + autoDays * DAY > now.getTime();
  const live = isLiveStatus(f.status) && f.status !== "sold" && f.status !== "rented";
  switch (rule) {
    case "new_listing":
      return live && f.publishedAt && current(f.publishedAt)
        ? {
            expiresAt: until(f.publishedAt),
            reason: `Published ${dayFormat.format(f.publishedAt)}`,
          }
        : null;
    case "price_reduced":
      return live &&
        f.price != null &&
        f.originalPrice != null &&
        f.price < f.originalPrice &&
        f.lastReductionAt &&
        current(f.lastReductionAt)
        ? {
            expiresAt: until(f.lastReductionAt),
            reason: `Price lowered ${dayFormat.format(f.lastReductionAt)}`,
          }
        : null;
    case "verified":
      return f.isVerified && f.lastVerifiedAt && current(f.lastVerifiedAt)
        ? {
            expiresAt: until(f.lastVerifiedAt),
            reason: `Verified ${dayFormat.format(f.lastVerifiedAt)}`,
          }
        : null;
    case "off_plan":
      return f.completion === "off_plan" ? { expiresAt: null, reason: "Off-plan listing" } : null;
    default:
      return null;
  }
}

/**
 * Recomputes the automatic badges of these listings. A badge the admin added by hand stays
 * manual; automatic rows are added, updated and removed here only.
 */
export async function refreshAutoBadges(
  db: DbOrTx,
  propertyIds: string[],
  now = new Date(),
): Promise<void> {
  const ids = [...new Set(propertyIds)];
  if (ids.length === 0) return;
  const rules = await db
    .select({ id: badges.id, autoRule: badges.autoRule, autoDays: badges.autoDays })
    .from(badges)
    .where(and(eq(badges.agencyId, currentAgencyId()), ne(badges.autoRule, "none")));
  const rows = await db
    .select({
      id: properties.id,
      status: properties.status,
      completion: properties.completion,
      publishedAt: properties.publishedAt,
      price: properties.price,
      originalPrice: properties.originalPrice,
      isVerified: properties.isVerified,
      lastVerifiedAt: properties.lastVerifiedAt,
      deletedAt: properties.deletedAt,
    })
    .from(properties)
    .where(inArray(properties.id, ids));
  const reductions = await db
    .selectDistinctOn([priceHistory.propertyId], {
      propertyId: priceHistory.propertyId,
      changedAt: priceHistory.changedAt,
    })
    .from(priceHistory)
    .where(
      and(inArray(priceHistory.propertyId, ids), lt(priceHistory.newPrice, priceHistory.oldPrice)),
    )
    .orderBy(priceHistory.propertyId, desc(priceHistory.changedAt));
  const lastReduction = new Map(reductions.map((r) => [r.propertyId, r.changedAt]));
  const existing = await db
    .select()
    .from(propertyBadges)
    .where(inArray(propertyBadges.propertyId, ids));

  for (const p of rows) {
    const mine = existing.filter((b) => b.propertyId === p.id);
    for (const rule of rules) {
      const link = mine.find((b) => b.badgeId === rule.id);
      if (link && !link.isAuto) continue;
      const applies =
        p.deletedAt === null
          ? autoBadge(
              rule.autoRule,
              rule.autoDays,
              { ...p, lastReductionAt: lastReduction.get(p.id) ?? null },
              now,
            )
          : null;
      if (!applies) {
        if (link)
          await db
            .delete(propertyBadges)
            .where(and(eq(propertyBadges.propertyId, p.id), eq(propertyBadges.badgeId, rule.id)));
        continue;
      }
      await db
        .insert(propertyBadges)
        .values({
          propertyId: p.id,
          badgeId: rule.id,
          isAuto: true,
          expiresAt: applies.expiresAt,
          reason: applies.reason,
        })
        .onConflictDoUpdate({
          target: [propertyBadges.propertyId, propertyBadges.badgeId],
          set: { expiresAt: applies.expiresAt, reason: applies.reason },
          setWhere: sql`${propertyBadges.isAuto} = true`,
        });
    }
  }
}

/** Daily task: listings whose automatic badges ran out, or may have started applying. */
export async function refreshAllAutoBadges(db: DbOrTx, now = new Date()): Promise<number> {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.agencyId, currentAgencyId()), isNull(properties.deletedAt)));
  for (let i = 0; i < rows.length; i += 200) {
    await refreshAutoBadges(
      db,
      rows.slice(i, i + 200).map((r) => r.id),
      now,
    );
  }
  return rows.length;
}
