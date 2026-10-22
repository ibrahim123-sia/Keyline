import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, newsletterSubscribers } from "@/db/schema/crm";
import { captureLead } from "@/features/leads/capture";
import { renderTemplateEmail } from "@/features/messages/render";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { bytesToBase64Url, hmacSha256, sha256Hex, timingSafeEqual } from "@/lib/crypto";

/**
 * Newsletter with double opt-in (05 §13, 09 §1 #16): a signup gets a confirmation email;
 * only a confirmed address is a subscriber. A subscriber is not a lead unless Settings ->
 * Leads says so. Every newsletter email carries a one-click unsubscribe link.
 */

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET || process.env.SECRETS_ENCRYPTION_KEY;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

/** The unsubscribe link's token: signed from the subscriber id, so nothing is stored. */
export async function unsubscribeToken(subscriberId: string): Promise<string> {
  return bytesToBase64Url(
    await hmacSha256(secret(), `newsletter-unsubscribe.${subscriberId}`),
  ).slice(0, 32);
}

export async function unsubscribeUrl(subscriberId: string): Promise<string> {
  return siteUrl(
    `/newsletter/unsubscribe?u=${subscriberId}&t=${await unsubscribeToken(subscriberId)}`,
  );
}

const normalise = (email: string) => email.trim().toLowerCase();

export type SubscribeResult = "pending" | "already";

/**
 * Signs an address up (or again, after unsubscribing): a fresh confirmation link by email.
 * An address that is already confirmed gets nothing new. The visitor sees the same message
 * either way, so the form never tells whether an address is on the list.
 */
export async function subscribeNewsletter(
  db: DbOrTx,
  input: { email: string; source: string; now?: Date },
): Promise<SubscribeResult> {
  const email = normalise(input.email);
  const now = input.now ?? new Date();
  const agency = currentAgencyId();
  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.agencyId, agency), eq(newsletterSubscribers.email, email)));
  if (existing?.confirmedAt && !existing.unsubscribedAt) return "already";

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  const hash = await sha256Hex(token);
  const [row] = existing
    ? await db
        .update(newsletterSubscribers)
        .set({ confirmTokenHash: hash, source: input.source })
        .where(eq(newsletterSubscribers.id, existing.id))
        .returning()
    : await db
        .insert(newsletterSubscribers)
        .values({ email, source: input.source, confirmTokenHash: hash, createdAt: now })
        .returning();

  const general = await loadSettings("general", db);
  const confirmUrl = siteUrl(`/newsletter/confirm/${token}`);
  const mail = await renderTemplateEmail(
    db,
    "newsletter.confirm",
    { agency: general.agencyName, confirmUrl, unsubscribeUrl: await unsubscribeUrl(row!.id) },
    confirmUrl,
  );
  if (mail)
    await queueEmail(
      {
        to: email,
        subject: mail.subject,
        template: "newsletter.confirm",
        html: mail.html,
        text: mail.text,
        related: { type: "newsletter_subscriber", id: row!.id },
      },
      db,
    );
  return "pending";
}

/** The pending signup behind a confirmation link, or null when it was used or replaced. */
export async function pendingByToken(db: DbOrTx, token: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.agencyId, currentAgencyId()),
        eq(newsletterSubscribers.confirmTokenHash, await sha256Hex(token)),
      ),
    );
  return row ?? null;
}

/**
 * The visitor confirms: a subscriber from now on (the link works once). With Settings ->
 * Leads "newsletterCreatesLead" the subscriber also becomes a lead (source newsletter);
 * otherwise an existing contact with that email is linked and marked as consenting.
 */
export async function confirmNewsletter(
  db: Db,
  token: string,
  visitorKey: string | null = null,
  now = new Date(),
): Promise<{ email: string } | null> {
  const row = await pendingByToken(db, token);
  if (!row) return null;
  let contactId = row.contactId;
  const leads = await loadSettings("leads", db);
  if (leads.newsletterCreatesLead) {
    const lead = await captureLead(db, {
      source: "newsletter",
      sourceDetail: row.source,
      contact: { name: row.email, email: row.email, marketingConsent: true },
      visitorKey,
      now,
    });
    contactId = lead.contactId;
  } else {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.agencyId, currentAgencyId()), eq(contacts.email, row.email)))
      .limit(1);
    if (contact) {
      contactId = contact.id;
      await db
        .update(contacts)
        .set({ marketingConsent: true, marketingConsentAt: now })
        .where(eq(contacts.id, contact.id));
    }
  }
  await db
    .update(newsletterSubscribers)
    .set({ confirmedAt: now, unsubscribedAt: null, confirmTokenHash: null, contactId })
    .where(eq(newsletterSubscribers.id, row.id));
  return { email: row.email };
}

/** One click from any newsletter email; the contact's marketing consent goes with it. */
export async function unsubscribeNewsletter(
  db: DbOrTx,
  subscriberId: string,
  token: string,
  now = new Date(),
): Promise<{ email: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(subscriberId)) return null;
  if (!timingSafeEqual(token, await unsubscribeToken(subscriberId))) return null;
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.agencyId, currentAgencyId()),
        eq(newsletterSubscribers.id, subscriberId),
      ),
    );
  if (!row) return null;
  if (!row.unsubscribedAt)
    await db
      .update(newsletterSubscribers)
      .set({ unsubscribedAt: now, confirmTokenHash: null })
      .where(eq(newsletterSubscribers.id, row.id));
  if (row.contactId)
    await db
      .update(contacts)
      .set({ marketingConsent: false, marketingConsentAt: now })
      .where(eq(contacts.id, row.contactId));
  return { email: row.email };
}
