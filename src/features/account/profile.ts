import "server-only";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { newsletterSubscribers } from "@/db/schema/crm";
import { customerPreferences, type AlertChannels } from "@/db/schema/customer";

export type Preferences = {
  newMatch: AlertChannels;
  priceDrop: AlertChannels;
  statusChange: AlertChannels;
  whatsappOptIn: boolean;
  newsletter: boolean;
  marketingConsent: boolean;
};

export async function loadPreferences(db: DbOrTx, userId: string): Promise<Preferences> {
  const [user] = await db
    .select({ email: users.email, marketingConsent: users.marketingConsent })
    .from(users)
    .where(eq(users.id, userId));
  const [prefs] = await db
    .select()
    .from(customerPreferences)
    .where(eq(customerPreferences.userId, userId));
  const [sub] = user
    ? await db
        .select({
          confirmedAt: newsletterSubscribers.confirmedAt,
          off: newsletterSubscribers.unsubscribedAt,
        })
        .from(newsletterSubscribers)
        .where(
          and(
            eq(newsletterSubscribers.agencyId, currentAgencyId()),
            eq(newsletterSubscribers.email, user.email.toLowerCase()),
          ),
        )
    : [];
  const off = { email: true, whatsapp: false };
  return {
    newMatch: prefs?.newMatch ?? off,
    priceDrop: prefs?.priceDrop ?? off,
    statusChange: prefs?.statusChange ?? off,
    whatsappOptIn: Boolean(prefs?.whatsappOptInAt),
    newsletter: Boolean(sub?.confirmedAt && !sub.off),
    marketingConsent: Boolean(user?.marketingConsent),
  };
}

/**
 * Notification choices (12 §2): email and WhatsApp per alert type (WhatsApp only with the
 * opt-in, 12 §3), the newsletter (the account email is already verified, so no second
 * confirmation) and marketing consent with its date.
 */
export async function savePreferences(
  db: DbOrTx,
  userId: string,
  p: Preferences,
  now = new Date(),
) {
  const [user] = await db
    .select({ email: users.email, marketingConsent: users.marketingConsent })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return;
  const whatsapp = (c: AlertChannels) => ({
    email: c.email,
    whatsapp: p.whatsappOptIn && c.whatsapp,
  });
  const [existing] = await db
    .select({ optIn: customerPreferences.whatsappOptInAt })
    .from(customerPreferences)
    .where(eq(customerPreferences.userId, userId));
  const values = {
    newMatch: whatsapp(p.newMatch),
    priceDrop: whatsapp(p.priceDrop),
    statusChange: whatsapp(p.statusChange),
    whatsappOptInAt: p.whatsappOptIn ? (existing?.optIn ?? now) : null,
    updatedAt: now,
  };
  await db
    .insert(customerPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: customerPreferences.userId, set: values });
  if (p.marketingConsent !== user.marketingConsent)
    await db
      .update(users)
      .set({
        marketingConsent: p.marketingConsent,
        marketingConsentAt: p.marketingConsent ? now : null,
      })
      .where(eq(users.id, userId));
  const email = user.email.toLowerCase();
  if (p.newsletter)
    await db
      .insert(newsletterSubscribers)
      .values({ email, source: "account", confirmedAt: now })
      .onConflictDoUpdate({
        target: [newsletterSubscribers.agencyId, newsletterSubscribers.email],
        set: { confirmedAt: now, unsubscribedAt: null },
      });
  else
    await db
      .update(newsletterSubscribers)
      .set({ unsubscribedAt: now })
      .where(
        and(
          eq(newsletterSubscribers.agencyId, currentAgencyId()),
          eq(newsletterSubscribers.email, email),
        ),
      );
}

export async function updateProfile(
  db: DbOrTx,
  userId: string,
  p: { name: string; phone: string | null; preferredContact: "whatsapp" | "call" | "email" | null },
) {
  await db
    .update(users)
    .set({ name: p.name.trim(), phone: p.phone, preferredContact: p.preferredContact })
    .where(eq(users.id, userId));
}
