import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { badges } from "@/db/schema/master-data";
import { properties, propertyBadges } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { refreshAutoBadges } from "@/features/properties/badges";
import { dailyListingMaintenance } from "@/features/properties/maintenance";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const DAY = 86_400_000;

describe("daily listing upkeep", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("properties", "property_badges", "badges", "audit_log");
  });

  it("ends featuring after its date and lets time-limited badges run out", async () => {
    const db = await getDb();
    const now = new Date("2026-10-20T00:15:00Z");
    const newBadge = newId();
    const verified = newId();
    await db.insert(badges).values([
      { id: newBadge, name: "New", autoRule: "new_listing", autoDays: 14 },
      { id: verified, name: "Verified", autoRule: "verified", autoDays: 30 },
    ]);
    const fresh = newId();
    const old = newId();
    const base = { purpose: "sale" as const, status: "available" as const, isVerified: true };
    await db.insert(properties).values([
      {
        ...base,
        id: fresh,
        reference: "LT-9001",
        title: "Fresh",
        slug: "fresh",
        publishedAt: new Date(now.getTime() - 3 * DAY),
        lastVerifiedAt: new Date(now.getTime() - 2 * DAY),
        isFeatured: true,
        featuredUntil: new Date(now.getTime() + 5 * DAY),
      },
      {
        ...base,
        id: old,
        reference: "LT-9002",
        title: "Old",
        slug: "old",
        publishedAt: new Date(now.getTime() - 20 * DAY),
        lastVerifiedAt: new Date(now.getTime() - 40 * DAY),
        isFeatured: true,
        featuredUntil: new Date(now.getTime() - DAY),
      },
    ]);
    // Both had their badges while they applied.
    await refreshAutoBadges(db, [fresh, old], new Date(now.getTime() - 25 * DAY));
    await refreshAutoBadges(db, [fresh], new Date(now.getTime() - DAY));

    expect(await dailyListingMaintenance(db, now)).toEqual({ unfeatured: 1, listings: 2 });
    const rows = await db.select().from(properties);
    expect(Object.fromEntries(rows.map((r) => [r.title, r.isFeatured]))).toEqual({
      Fresh: true,
      Old: false,
    });
    const links = await db.select().from(propertyBadges);
    expect(
      links
        .map((l) => [
          l.propertyId === fresh ? "fresh" : "old",
          l.badgeId === newBadge ? "new" : "verified",
        ])
        .sort(),
    ).toEqual([
      ["fresh", "new"],
      ["fresh", "verified"],
    ]);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, old), eq(auditLog.action, "property.feature")));
    expect(entry).toMatchObject({ actorType: "system" });
  });
});
