import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { users } from "../schema/auth";
import { contacts, viewings } from "../schema/crm";
import { compareSets, customerPreferences, savedLists, savedSearches } from "../schema/customer";
import { properties } from "../schema/properties";
import { createAuth } from "@/lib/auth/config";
import { saveHome } from "@/features/account/store";
import { filtersToStored, polygonOf } from "@/features/account/searches";
import { parseSearch } from "@/features/search/params";
import { newId } from "@/lib/ids";

/**
 * Demo customers (16 §1 "3 demo customers with saved homes, saved searches and past tours"),
 * fictional people with sign-in passwords printed once by the seed command.
 */
const people = [
  { email: "mina@demo.lintel", name: "Mina Park", phone: "+971502220001" },
  { email: "omar.customer@demo.lintel", name: "Omar Haddad", phone: "+971502220002" },
  { email: "lucy@demo.lintel", name: "Lucy Grant", phone: "+447700900321" },
];

const searches = [
  { name: "Two-bed homes in Dubai Marina", query: "loc=dubai-marina&beds=2", frequency: "daily" },
  { name: "Villas to rent", query: "purpose=rent&type=villas", frequency: "weekly" },
  {
    name: "Off-plan with a payment plan",
    query: "completion=off_plan&plan=any",
    frequency: "instant",
  },
] as const;

export async function seedCustomers(
  db: Db,
  input: { now: Date; passwords?: Record<string, string>; generatePassword: () => string },
): Promise<Array<{ email: string; password: string }>> {
  const auth = createAuth(db, { nextCookies: false });
  const ctx = await auth.$context;
  const live = await db
    .select({ id: properties.id, purpose: properties.purpose })
    .from(properties)
    .where(and(inArray(properties.status, ["available", "reserved", "under_offer"])))
    .orderBy(properties.reference);
  const sale = live.filter((p) => p.purpose === "sale").map((p) => p.id);
  const rent = live.filter((p) => p.purpose === "rent").map((p) => p.id);
  const out: Array<{ email: string; password: string }> = [];

  for (const [i, p] of people.entries()) {
    const password = input.passwords?.[p.email] ?? input.generatePassword();
    const id = newId();
    await db.delete(users).where(eq(users.email, p.email));
    await db.insert(users).values({
      id,
      name: p.name,
      email: p.email,
      emailVerified: true,
      phone: p.phone,
      role: "customer",
      preferredContact: i === 0 ? "whatsapp" : "email",
    });
    await ctx.internalAdapter.linkAccount({
      userId: id,
      providerId: "credential",
      accountId: id,
      password: await ctx.password.hash(password),
    });
    await db.insert(customerPreferences).values({ userId: id });

    // Saved homes in "Saved" and, for the first customer, a list of their own.
    const picks = (i === 1 ? rent : sale).slice(i * 3, i * 3 + 4);
    for (const propertyId of picks) await saveHome(db, id, { propertyId });
    if (i === 0 && sale[10]) {
      const [own] = await db
        .insert(savedLists)
        .values({ userId: id, name: "For my parents", sortOrder: 1 })
        .returning({ id: savedLists.id });
      await saveHome(db, id, { propertyId: sale[10], listId: own!.id });
    }

    const s = searches[i]!;
    const f = parseSearch(new URLSearchParams(s.query));
    await db.insert(savedSearches).values({
      userId: id,
      name: s.name,
      filters: filtersToStored(f),
      polygon: polygonOf(f),
      alertFrequency: s.frequency,
      createdAt: new Date(input.now.getTime() - (i + 3) * 86_400_000),
    });

    if (i === 0 && sale.length > 2)
      await db.insert(compareSets).values({ userId: id, propertyIds: sale.slice(0, 3) });

    // A past tour (with feedback for the first customer), linked through their contact.
    const [contact] = await db
      .insert(contacts)
      .values({ name: p.name, email: p.email, phone: p.phone, userId: id })
      .returning({ id: contacts.id });
    const toured = picks[0];
    if (toured) {
      const at = new Date(input.now.getTime() - (i + 2) * 86_400_000);
      at.setUTCHours(10, 0, 0, 0);
      await db.insert(viewings).values({
        contactId: contact!.id,
        propertyId: toured,
        type: "in_person",
        startsAt: at,
        endsAt: new Date(at.getTime() + 30 * 60_000),
        status: "done",
        source: "site",
        ...(i === 0
          ? { feedbackRating: 4, feedbackText: "Lovely light; the kitchen is small." }
          : {}),
      });
    }
    out.push({ email: p.email, password });
  }
  return out;
}
