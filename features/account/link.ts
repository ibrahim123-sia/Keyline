import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { contacts, leads, visitors } from "@/db/schema/crm";
import { customerPreferences } from "@/db/schema/customer";
import { locations } from "@/db/schema/master-data";
import { captureLead } from "@/features/leads/capture";
import { loadSettings } from "@/features/settings/queries";
import { toMinor } from "@/lib/money";
import { defaultListId, mergeGuestCompare } from "./store";
import { storedToFilters, type StoredFilters } from "./searches";

/** The contact ids that belong to a customer (linked by verified email, 12 §1). */
export async function customerContactIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.agencyId, currentAgencyId()), eq(contacts.userId, userId)));
  return rows.map((r) => r.id);
}

/**
 * On a customer's sessions (12 §1): link past activity. Contacts are matched by the verified
 * email only — a phone number on an account is not verified, so it never opens someone else's
 * inquiries or tours; their leads, viewings and conversations follow the contact. The
 * visitor id and the guest compare set join the account. Safe to run on every sign-in.
 */
export async function linkCustomerActivity(
  db: Db,
  input: { userId: string; visitorKey?: string | null },
): Promise<void> {
  const agency = currentAgencyId();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      phone: users.phone,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!user || user.role !== "customer") return;

  if (user.emailVerified)
    await db
      .update(contacts)
      .set({ userId: user.id })
      .where(
        and(
          eq(contacts.agencyId, agency),
          isNull(contacts.userId),
          isNull(contacts.mergedIntoId),
          sql`lower(${contacts.email}) = ${user.email.toLowerCase()}`,
        ),
      );
  if (input.visitorKey) {
    await db
      .update(visitors)
      .set({ userId: user.id })
      .where(
        and(
          eq(visitors.agencyId, agency),
          eq(visitors.visitorKey, input.visitorKey),
          isNull(visitors.userId),
        ),
      );
    await mergeGuestCompare(db, user.id, input.visitorKey);
  }
  await defaultListId(db, user.id);
  await db.insert(customerPreferences).values({ userId: user.id }).onConflictDoNothing();

  // Settings -> Leads "Sign-ups become leads: always" (09 §1 #14).
  const settings = await loadSettings("leads", db);
  if (settings.signupCreatesLead === "always" && user.emailVerified)
    await ensureCustomerLead(db, user.id, { source: "signup" });
}

/**
 * The customer's open lead, or a new one (sign-up or an action that shows intent, 09 §1 #14,
 * #15). Nothing happens when they already have an open lead.
 */
export async function ensureCustomerLead(
  db: Db,
  userId: string,
  input: { source: "signup" | "saved_search"; filters?: StoredFilters },
): Promise<string | null> {
  const contactIds = await customerContactIds(db, userId);
  if (contactIds.length) {
    const [open] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          inArray(leads.contactId, contactIds),
          eq(leads.status, "open"),
          isNull(leads.mergedIntoId),
        ),
      )
      .limit(1);
    if (open) return open.id;
  }
  const [user] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;
  const requirements = input.filters ? await requirementsFrom(db, input.filters) : undefined;
  const res = await captureLead(db, {
    source: input.source,
    sourceDetail: input.source === "saved_search" ? "account" : null,
    contact: { name: user.name, email: user.email, phone: user.phone, userId },
    requirements,
    lenientPhone: true,
  });
  return res.leadId;
}

/** What a saved search says the customer wants (09 §1 #15 "requirements filled from filters"). */
async function requirementsFrom(db: Db, stored: StoredFilters) {
  const f = storedToFilters(stored);
  const market = await loadSettings("market", db);
  const decimals = market.baseCurrency.decimals;
  const slugs = f.loc.filter((l) => !l.startsWith("p."));
  const locationIds = slugs.length
    ? (
        await db
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.agencyId, currentAgencyId()), inArray(locations.slug, slugs)))
      ).map((r) => r.id)
    : [];
  const stated = f.min !== null || f.max !== null;
  return {
    purpose: f.purpose,
    ...(locationIds.length ? { locationIds } : {}),
    ...(f.beds.length ? { bedsMin: Math.min(...f.beds) } : {}),
    ...(stated
      ? {
          budgetMin: f.min !== null ? toMinor(f.min, decimals) : null,
          budgetMax: f.max !== null ? toMinor(f.max, decimals) : null,
          currency: market.baseCurrency.code,
          budgetFrom: "lead" as const,
        }
      : {}),
  };
}
