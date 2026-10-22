import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { contacts, viewings } from "@/db/schema/crm";
import { savedSearches } from "@/db/schema/customer";
import { properties } from "@/db/schema/properties";
import { savedHomesOf, savedSearchesOf, sharedList, toursOf } from "@/features/account/queries";
import { saveHome, saveSearch, shareList } from "@/features/account/store";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

async function user(email: string) {
  const db = await getDb();
  const id = newId();
  await db.insert(users).values({ id, name: "Sam", email, emailVerified: true, role: "customer" });
  return id;
}

async function listing(values: Partial<typeof properties.$inferInsert> = {}) {
  const db = await getDb();
  const id = newId();
  await db.insert(properties).values({
    id,
    reference: `HD-${Math.floor(Math.random() * 1e6)}`,
    title: "Two bed",
    slug: `two-bed-${id.slice(-6)}`,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    price: 200_000_000,
    currency: "AED",
    beds: 2,
    ...values,
  });
  return id;
}

describe("customer area pages (12 §2)", () => {
  beforeEach(async () => {
    await truncate(
      "users",
      "saved_lists",
      "saved_homes",
      "saved_searches",
      "contacts",
      "viewings",
      "properties",
      "settings",
    );
  });

  it("saved homes show what changed since they were saved", async () => {
    const db = await getDb();
    const sam = await user("sam@example.com");
    const cheaper = await listing();
    const reserved = await listing();
    await saveHome(db, sam, { propertyId: cheaper });
    await saveHome(db, sam, { propertyId: reserved });
    await db.update(properties).set({ price: 195_000_000 }).where(eq(properties.id, cheaper));
    await db.update(properties).set({ status: "reserved" }).where(eq(properties.id, reserved));
    const { lists, homes } = await savedHomesOf(db, sam);
    expect(lists).toMatchObject([{ name: "Saved", isDefault: true, homes: 2 }]);
    expect(homes.find((h) => h.card?.id === cheaper)!.change).toEqual({
      kind: "price_down",
      amount: 5_000_000,
    });
    expect(homes.find((h) => h.card?.id === reserved)!.change).toMatchObject({ kind: "status" });
  });

  it("saved searches count homes listed since the last alert", async () => {
    const db = await getDb();
    const sam = await user("sam@example.com");
    const id = await saveSearch(db, sam, {
      name: "Two beds",
      filters: { beds: "2" },
      frequency: "daily",
    });
    await db
      .update(savedSearches)
      .set({ createdAt: new Date(Date.now() - 86_400_000) })
      .where(eq(savedSearches.id, id));
    await listing();
    await listing({ beds: 3 });
    await listing({ publishedAt: new Date(Date.now() - 2 * 86_400_000) });
    const [s] = await savedSearchesOf(db, sam);
    expect(s).toMatchObject({ name: "Two beds", newMatches: 1, href: "/buy?beds=2" });
    expect(s!.summary).toContain("2 beds");
  });

  it("a shared list shows its live homes only, and nothing without the right link", async () => {
    const db = await getDb();
    const sam = await user("sam@example.com");
    const live = await listing();
    const draft = await listing({ status: "draft" });
    await saveHome(db, sam, { propertyId: live });
    await saveHome(db, sam, { propertyId: draft }).catch(() => undefined);
    await db.update(properties).set({ status: "draft" }).where(eq(properties.id, draft));
    const { lists } = await savedHomesOf(db, sam);
    const token = await shareList(db, sam, lists[0]!.id);
    const shared = await sharedList(db, token);
    expect(shared!.cards.map((c) => c.id)).toEqual([live]);
    expect(await sharedList(db, "x".repeat(24))).toBeNull();
  });

  it("tours are the customer's own viewings, upcoming and past", async () => {
    const db = await getDb();
    const sam = await user("sam@example.com");
    const lee = await user("lee@example.com");
    const home = await listing();
    const [mine] = await db.insert(contacts).values({ name: "Sam", userId: sam }).returning();
    const [theirs] = await db.insert(contacts).values({ name: "Lee", userId: lee }).returning();
    const at = (h: number) => new Date(Date.now() + h * 3_600_000);
    await db.insert(viewings).values([
      {
        contactId: mine!.id,
        propertyId: home,
        startsAt: at(24),
        endsAt: at(24.5),
        status: "confirmed",
      },
      {
        contactId: mine!.id,
        propertyId: home,
        startsAt: at(-48),
        endsAt: at(-47.5),
        status: "done",
      },
      {
        contactId: theirs!.id,
        propertyId: home,
        startsAt: at(30),
        endsAt: at(30.5),
        status: "confirmed",
      },
    ]);
    const tours = await toursOf(db, sam);
    expect(tours.upcoming).toHaveLength(1);
    expect(tours.past).toHaveLength(1);
    expect(tours.upcoming[0]!.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
