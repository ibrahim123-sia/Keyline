import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { contacts, conversations, leadEvents, leads, messages, visitors } from "@/db/schema/crm";
import { compareSets, savedHomes, savedLists, savedSearches } from "@/db/schema/customer";
import { locations } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import {
  createSavedList,
  deleteSavedList,
  editSavedSearch,
  moveSavedHome,
  removeSavedSearch,
  saveCurrentSearch,
  setHomeSaved,
  setListShared,
  setSavedHomeNote,
} from "@/features/account/actions";
import { linkCustomerActivity } from "@/features/account/link";
import { deleteCustomerAccount, exportCustomerData } from "@/features/account/privacy";
import { deleteMyAccount, saveMyNotifications } from "@/features/account/profile-actions";
import { loadPreferences } from "@/features/account/profile";
import { compareIds, savedIds, toggleCompare } from "@/features/account/store";
import { encodePolygon } from "@/features/search/params";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import type { SessionUser } from "@/lib/permissions";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

function customer(email: string, name = "Sam Visitor"): SessionUser {
  return {
    id: newId(),
    name,
    email,
    emailVerified: true,
    image: null,
    role: "customer",
    phone: null,
    isActive: true,
    readOnly: false,
    twoFactorEnabled: false,
    adminTheme: "light",
  };
}

async function addUser(u: SessionUser, verified = true) {
  const db = await getDb();
  await db.insert(users).values({
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: verified,
    role: "customer",
  });
}

async function listing(slug: string, price = 150_000_000) {
  const db = await getDb();
  const id = newId();
  await db.insert(properties).values({
    id,
    reference: `HD-${slug.length}${Math.floor(Math.random() * 1e6)}`,
    title: `Home ${slug}`,
    slug,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    price,
    currency: "AED",
  });
  return id;
}

describe("customer area (12)", () => {
  let sam: SessionUser;
  let lee: SessionUser;

  beforeEach(async () => {
    await truncate(
      "users",
      "saved_lists",
      "saved_homes",
      "saved_searches",
      "compare_sets",
      "customer_preferences",
      "contacts",
      "leads",
      "lead_events",
      "visitors",
      "conversations",
      "messages",
      "newsletter_subscribers",
      "properties",
      "locations",
      "settings",
      "job_runs",
      "email_log",
      "audit_log",
    );
    sam = customer("sam@example.com");
    lee = customer("lee@example.com", "Lee Other");
    await addUser(sam);
    await addUser(lee);
    adminState.user = sam;
  });

  it("saves homes into lists, moves them, keeps notes, shares a list; only the owner can", async () => {
    const db = await getDb();
    const a = await listing("a");
    const b = await listing("b");
    expect(await setHomeSaved({ propertyId: a, saved: true })).toEqual({
      ok: true,
      data: { saved: true },
    });
    await setHomeSaved({ propertyId: a, saved: true }); // twice changes nothing
    await setHomeSaved({ propertyId: b, saved: true });
    expect(await savedIds(db, sam.id)).toMatchObject({
      properties: expect.arrayContaining([a, b]),
    });
    const [first] = await db.select().from(savedHomes).where(eq(savedHomes.propertyId, a));
    expect(first).toMatchObject({ priceWhenSaved: 150_000_000, statusWhenSaved: "available" });

    const parents = await createSavedList({ name: "For my parents" });
    if (!parents.ok) throw new Error(parents.error);
    expect(await moveSavedHome({ id: first!.id, listId: parents.data.id })).toMatchObject({
      ok: true,
    });
    expect(await setSavedHomeNote({ id: first!.id, note: "Ask about parking" })).toMatchObject({
      ok: true,
    });
    const shared = await setListShared({ id: parents.data.id, shared: true });
    if (!shared.ok) throw new Error(shared.error);
    expect(shared.data.token).toMatch(/^[A-Za-z0-9_-]{24}$/);

    // Another customer cannot touch Sam's homes or lists.
    adminState.user = lee;
    expect(await moveSavedHome({ id: first!.id, listId: parents.data.id })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await setSavedHomeNote({ id: first!.id, note: "x" })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await deleteSavedList({ id: parents.data.id })).toMatchObject({ code: "NOT_FOUND" });
    expect(await savedIds(db, lee.id)).toEqual({ properties: [], projects: [] });

    // Deleting a list puts its homes back in "Saved".
    adminState.user = sam;
    expect(await deleteSavedList({ id: parents.data.id })).toMatchObject({ ok: true });
    const lists = await db.select().from(savedLists).where(eq(savedLists.userId, sam.id));
    expect(lists.map((l) => l.name)).toEqual(["Saved"]);
    expect(await db.select().from(savedHomes).where(eq(savedHomes.userId, sam.id))).toHaveLength(2);

    // Unsaving takes it out of every list.
    await setHomeSaved({ propertyId: a, saved: false });
    expect((await savedIds(db, sam.id)).properties).toEqual([b]);

    // Guests are asked to sign in.
    adminState.user = null;
    expect(await setHomeSaved({ propertyId: b, saved: true })).toMatchObject({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("limits: 500 saved homes and 20 saved searches", async () => {
    const db = await getDb();
    const a = await listing("a");
    const [list] = await db
      .insert(savedLists)
      .values({ userId: sam.id, name: "Saved", isDefault: true })
      .returning();
    await db.execute(sql`
      insert into saved_homes (id, agency_id, user_id, list_id)
      select gen_random_uuid(), ${list!.agencyId}, ${sam.id}, ${list!.id} from generate_series(1, 500)`);
    expect(await setHomeSaved({ propertyId: a, saved: true })).toMatchObject({
      ok: false,
      code: "LIMIT",
    });

    for (let i = 0; i < 20; i++)
      await db.insert(savedSearches).values({ userId: sam.id, name: `S${i}` });
    expect(
      await saveCurrentSearch({ query: "beds=2", name: "One more", frequency: "daily" }),
    ).toMatchObject({ ok: false, code: "LIMIT" });
  });

  it("saved searches keep the filters as URL parameters and the drawn area; edit and delete", async () => {
    const db = await getDb();
    const ring: Array<[number, number]> = [
      [55.13, 25.07],
      [55.15, 25.07],
      [55.15, 25.09],
    ];
    const res = await saveCurrentSearch({
      query: `purpose=rent&loc=dubai-marina&beds=2&beds=3&max=150000&poly=${encodeURIComponent(encodePolygon(ring))}`,
      name: "Marina rentals",
      frequency: "instant",
    });
    if (!res.ok) throw new Error(res.error);
    const [row] = await db.select().from(savedSearches);
    expect(row!.filters).toMatchObject({
      purpose: "rent",
      loc: "dubai-marina",
      beds: ["2", "3"],
      max: "150000",
    });
    expect(row!.polygon).toMatchObject({ type: "Polygon" });
    expect(row!.alertFrequency).toBe("instant");
    expect(
      await editSavedSearch({ id: row!.id, frequency: "weekly", name: "Marina" }),
    ).toMatchObject({
      ok: true,
    });
    adminState.user = lee;
    expect(await removeSavedSearch({ id: row!.id })).toMatchObject({ code: "NOT_FOUND" });
    adminState.user = sam;
    expect(await removeSavedSearch({ id: row!.id })).toMatchObject({ ok: true });
    expect(await db.select().from(savedSearches)).toEqual([]);
  });

  it("signing in links past activity by verified email, the visitor and the guest compare set", async () => {
    const db = await getDb();
    const a = await listing("a");
    const b = await listing("b");
    const vid = "0192f000-0000-7000-8000-00000000d001";
    const [visitor] = await db.insert(visitors).values({ visitorKey: vid }).returning();
    await toggleCompare(db, { visitorKey: vid }, a);
    await toggleCompare(db, { visitorKey: vid }, b);
    const [mine] = await db
      .insert(contacts)
      .values({ name: "Sam", email: "SAM@example.com" })
      .returning();
    const [byPhone] = await db
      .insert(contacts)
      .values({ name: "Someone", phone: "+971501234567" })
      .returning();

    await linkCustomerActivity(db, { userId: sam.id, visitorKey: vid });
    const linked = await db.select().from(contacts);
    expect(linked.find((c) => c.id === mine!.id)!.userId).toBe(sam.id);
    // An unverified phone on an account never opens someone else's records.
    expect(linked.find((c) => c.id === byPhone!.id)!.userId).toBeNull();
    const [v] = await db.select().from(visitors).where(eq(visitors.id, visitor!.id));
    expect(v!.userId).toBe(sam.id);
    expect(await compareIds(db, { userId: sam.id })).toEqual([a, b]);
    expect(await db.select().from(compareSets).where(eq(compareSets.visitorKey, vid))).toEqual([]);

    // An unverified account links nothing by email.
    const fresh = customer("fresh@example.com");
    await addUser(fresh, false);
    await db.insert(contacts).values({ name: "Fresh", email: "fresh@example.com" });
    await linkCustomerActivity(db, { userId: fresh.id });
    expect(
      (await db.select().from(contacts).where(eq(contacts.email, "fresh@example.com")))[0]!.userId,
    ).toBeNull();
  });

  it("sign-ups become leads as Settings -> Leads says", async () => {
    const db = await getDb();
    await patchSettings(db, "leads", { signupCreatesLead: "never" }, actor);
    await linkCustomerActivity(db, { userId: sam.id });
    await saveCurrentSearch({ query: "beds=2", name: "Two beds", frequency: "daily" });
    expect(await db.select().from(leads)).toEqual([]);

    await patchSettings(db, "leads", { signupCreatesLead: "on_intent" }, actor);
    await linkCustomerActivity(db, { userId: sam.id });
    expect(await db.select().from(leads)).toEqual([]);
    const [marina] = await db
      .insert(locations)
      .values({ level: "area", name: "Dubai Marina", slug: "dubai-marina" })
      .returning();
    await saveCurrentSearch({
      query: "loc=dubai-marina&beds=2&max=2000000",
      name: "Marina",
      frequency: "daily",
    });
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ source: "saved_search" });
    expect(lead!.requirements).toMatchObject({
      purpose: "sale",
      locationIds: [marina!.id],
      bedsMin: 2,
      budgetFrom: "lead",
    });
    // One open lead is enough.
    await saveCurrentSearch({ query: "beds=3", name: "Three beds", frequency: "daily" });
    expect(await db.select().from(leads)).toHaveLength(1);

    await patchSettings(db, "leads", { signupCreatesLead: "always" }, actor);
    await linkCustomerActivity(db, { userId: lee.id });
    expect((await db.select().from(leads)).map((l) => l.source).sort()).toEqual([
      "saved_search",
      "signup",
    ]);
  });

  it("notification choices: WhatsApp only with the opt-in; newsletter and consent", async () => {
    const db = await getDb();
    const on = { email: true, whatsapp: true };
    expect(
      await saveMyNotifications({
        newMatch: on,
        priceDrop: on,
        statusChange: { email: false, whatsapp: false },
        whatsappOptIn: false,
        newsletter: true,
        marketingConsent: true,
      }),
    ).toMatchObject({ ok: true });
    expect(await loadPreferences(db, sam.id)).toMatchObject({
      newMatch: { email: true, whatsapp: false },
      statusChange: { email: false, whatsapp: false },
      newsletter: true,
      marketingConsent: true,
    });
    await saveMyNotifications({
      newMatch: on,
      priceDrop: on,
      statusChange: on,
      whatsappOptIn: true,
      newsletter: false,
      marketingConsent: false,
    });
    expect(await loadPreferences(db, sam.id)).toMatchObject({
      newMatch: { email: true, whatsapp: true },
      whatsappOptIn: true,
      newsletter: false,
      marketingConsent: false,
    });
  });

  it("exports the customer's data and deletes the account, anonymising what the agency keeps", async () => {
    const db = await getDb();
    const a = await listing("a");
    await setHomeSaved({ propertyId: a, saved: true });
    await saveCurrentSearch({ query: "beds=2", name: "Two beds", frequency: "daily" });
    const [contact] = await db
      .insert(contacts)
      .values({
        name: "Sam Visitor",
        email: "sam@example.com",
        phone: "+971501234567",
        userId: sam.id,
      })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({ contactId: contact!.id, source: "form" })
      .returning();
    await db.insert(leadEvents).values({
      leadId: lead!.id,
      type: "created",
      body: "My budget is 2M, call me on 050 123 4567",
      actorType: "customer",
    });
    const [conv] = await db
      .insert(conversations)
      .values({ channel: "web_chat", contactId: contact!.id, leadId: lead!.id })
      .returning();
    await db.insert(messages).values({
      conversationId: conv!.id,
      direction: "in",
      sender: "customer",
      body: "Hi, I'm Sam",
    });

    const data = await exportCustomerData(db, sam.id);
    expect(data).toMatchObject({
      profile: { email: "sam@example.com" },
      savedHomes: [expect.objectContaining({ title: "Home a" })],
      savedSearches: [expect.objectContaining({ name: "Two beds" })],
      contactDetails: expect.arrayContaining([expect.objectContaining({ phone: "+971501234567" })]),
      inquiries: expect.arrayContaining([expect.objectContaining({ source: "form" })]),
      yourMessages: expect.arrayContaining([
        expect.objectContaining({ body: "My budget is 2M, call me on 050 123 4567" }),
      ]),
      chats: [expect.objectContaining({ body: "Hi, I'm Sam" })],
    });
    // Nobody else's data in it.
    expect(await exportCustomerData(db, lee.id)).toMatchObject({ savedHomes: [], inquiries: [] });

    expect(await deleteMyAccount({ confirm: "nope" })).toMatchObject({ code: "VALIDATION" });
    expect(await deleteMyAccount({ confirm: "DELETE" })).toEqual({
      ok: true,
      data: { deleted: true },
    });
    expect(await db.select().from(users).where(eq(users.id, sam.id))).toEqual([]);
    expect(await db.select().from(savedHomes)).toEqual([]);
    expect(await db.select().from(savedSearches)).toEqual([]);
    const [anon] = await db.select().from(contacts).where(eq(contacts.id, contact!.id));
    expect(anon).toMatchObject({
      name: "Deleted customer",
      email: null,
      phone: null,
      userId: null,
    });
    const [ev] = await db.select().from(leadEvents).where(eq(leadEvents.leadId, lead!.id));
    expect(ev!.body).toBeNull();
    const [msg] = await db.select().from(messages);
    expect(msg!.body).toBe("[removed]");
    // The agency keeps its records (the inquiry and the saved-search lead), without the person.
    expect(await db.select().from(leads)).toHaveLength(2);
    for (const c of await db.select().from(contacts))
      expect(c).toMatchObject({ name: "Deleted customer", email: null, userId: null });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "account.delete"));
    expect(audit).toMatchObject({ entityId: sam.id });
    // Deleting twice is harmless.
    await deleteCustomerAccount(db, sam.id);
  });
});
