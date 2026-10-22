import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import {
  contacts,
  conversations,
  leadEvents,
  leads,
  messages,
  newsletterSubscribers,
  viewings,
  visitors,
} from "@/db/schema/crm";
import {
  compareSets,
  customerPreferences,
  savedHomes,
  savedLists,
  savedSearches,
} from "@/db/schema/customer";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { writeAudit } from "@/lib/audit";
import { customerContactIds } from "./link";

/** "Download my data" (12 §2 Privacy, 14 §3): everything kept about the customer, as JSON. */
export async function exportCustomerData(db: Db, userId: string) {
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      preferredContact: users.preferredContact,
      marketingConsent: users.marketingConsent,
      marketingConsentAt: users.marketingConsentAt,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;
  const contactIds = await customerContactIds(db, userId);
  const [prefs] = await db
    .select()
    .from(customerPreferences)
    .where(eq(customerPreferences.userId, userId));
  const lists = await db
    .select({ id: savedLists.id, name: savedLists.name, shared: savedLists.shareToken })
    .from(savedLists)
    .where(eq(savedLists.userId, userId));
  const homes = await db
    .select({
      listId: savedHomes.listId,
      reference: properties.reference,
      title: properties.title,
      project: projects.name,
      note: savedHomes.note,
      savedAt: savedHomes.createdAt,
    })
    .from(savedHomes)
    .leftJoin(properties, eq(properties.id, savedHomes.propertyId))
    .leftJoin(projects, eq(projects.id, savedHomes.projectId))
    .where(eq(savedHomes.userId, userId));
  const searches = await db
    .select({
      name: savedSearches.name,
      filters: savedSearches.filters,
      alertFrequency: savedSearches.alertFrequency,
      createdAt: savedSearches.createdAt,
    })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId));
  const [compare] = await db
    .select({ propertyIds: compareSets.propertyIds })
    .from(compareSets)
    .where(eq(compareSets.userId, userId));
  const contactRows = contactIds.length
    ? await db
        .select({
          name: contacts.name,
          email: contacts.email,
          phone: contacts.phone,
          whatsapp: contacts.whatsapp,
          preferredContact: contacts.preferredContact,
          marketingConsent: contacts.marketingConsent,
        })
        .from(contacts)
        .where(inArray(contacts.id, contactIds))
    : [];
  const leadRows = contactIds.length
    ? await db
        .select({
          id: leads.id,
          type: leads.type,
          source: leads.source,
          status: leads.status,
          requirements: leads.requirements,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(inArray(leads.contactId, contactIds))
    : [];
  const leadIds = leadRows.map((l) => l.id);
  const timeline = leadIds.length
    ? await db
        .select({
          leadId: leadEvents.leadId,
          type: leadEvents.type,
          body: leadEvents.body,
          at: leadEvents.createdAt,
        })
        .from(leadEvents)
        .where(and(inArray(leadEvents.leadId, leadIds), eq(leadEvents.actorType, "customer")))
    : [];
  const tours = contactIds.length
    ? await db
        .select({
          startsAt: viewings.startsAt,
          type: viewings.type,
          status: viewings.status,
          notes: viewings.notes,
          feedbackRating: viewings.feedbackRating,
          feedbackText: viewings.feedbackText,
        })
        .from(viewings)
        .where(inArray(viewings.contactId, contactIds))
    : [];
  const chats = contactIds.length
    ? await db
        .select({
          channel: conversations.channel,
          sender: messages.sender,
          body: messages.body,
          at: messages.createdAt,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(inArray(conversations.contactId, contactIds))
    : [];
  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    notifications: prefs ?? null,
    savedLists: lists.map((l) => ({ id: l.id, name: l.name, shared: Boolean(l.shared) })),
    savedHomes: homes,
    savedSearches: searches,
    compare: compare?.propertyIds ?? [],
    contactDetails: contactRows,
    inquiries: leadRows,
    yourMessages: timeline,
    tours,
    chats,
  };
}

/**
 * "Delete my account" (12 §2, 14 §3): saved data goes with the account; inquiries, tours and
 * chats the agency keeps lose the person (name, email, phone and their own words), so
 * nothing in them points back to the customer. Audited.
 */
export async function deleteCustomerAccount(db: Db, userId: string): Promise<void> {
  const agency = currentAgencyId();
  const [user] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || user.role !== "customer") return;
  const contactIds = await customerContactIds(db, userId);
  await db.transaction(async (tx) => {
    if (contactIds.length) {
      await tx
        .update(contacts)
        .set({
          name: "Deleted customer",
          email: null,
          phone: null,
          whatsapp: null,
          nationality: null,
          notes: null,
          tags: [],
          marketingConsent: false,
          marketingConsentAt: null,
          userId: null,
        })
        .where(inArray(contacts.id, contactIds));
      const leadIds = (
        await tx.select({ id: leads.id }).from(leads).where(inArray(leads.contactId, contactIds))
      ).map((l) => l.id);
      if (leadIds.length) {
        await tx
          .update(leadEvents)
          .set({ body: null, meta: sql`${leadEvents.meta} - 'details'` })
          .where(and(inArray(leadEvents.leadId, leadIds), eq(leadEvents.actorType, "customer")));
        await tx
          .update(leads)
          .set({ requirements: sql`${leads.requirements} - 'notes'`, aiSummary: null })
          .where(inArray(leads.id, leadIds));
      }
      await tx
        .update(viewings)
        .set({ notes: null, feedbackText: null, visitorTimeZone: null })
        .where(inArray(viewings.contactId, contactIds));
      const conversationIds = (
        await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(inArray(conversations.contactId, contactIds))
      ).map((c) => c.id);
      if (conversationIds.length)
        await tx
          .update(messages)
          .set({ body: "[removed]", attachments: [] })
          .where(
            and(inArray(messages.conversationId, conversationIds), eq(messages.sender, "customer")),
          );
    }
    await tx.update(visitors).set({ userId: null }).where(eq(visitors.userId, userId));
    await tx
      .delete(newsletterSubscribers)
      .where(
        and(
          eq(newsletterSubscribers.agencyId, agency),
          eq(newsletterSubscribers.email, user.email.toLowerCase()),
        ),
      );
    await writeAudit(tx, {
      actor: { type: "system", id: null },
      action: "account.delete",
      entityType: "user",
      entityId: userId,
      after: { requestedBy: "customer", anonymisedContacts: contactIds.length },
    });
    // Sessions, sign-in methods, lists, saved homes and searches, alerts, compare set and
    // notification choices go with the user row (cascade).
    await tx.delete(users).where(eq(users.id, userId));
  });
}
