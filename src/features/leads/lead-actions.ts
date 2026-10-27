"use server";

import { and, eq, isNull } from "drizzle-orm";
import { createElement } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leadEvents, leads, leadTasks } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import { TemplateEmail } from "@/emails/template-email";
import { normalizeVisitorPhone } from "@/features/inquiries/schema";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { toMinor } from "@/lib/money";
import { markFirstResponse } from "./first-response";
import { refreshLeadScore } from "./process";
import { callOutcomes, contactInputSchema, requirementsInputSchema } from "./schema";
import { refreshNextTask, timelineActor } from "./stage";

async function openLead(db: Awaited<ReturnType<typeof getDb>>, id: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      and(eq(leads.id, id), eq(leads.agencyId, currentAgencyId()), isNull(leads.mergedIntoId)),
    );
  if (!lead) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
  return lead;
}

/** The lead's contact details (09 §4 left column). */
export const updateLeadContact = adminAction(
  z.object({ id: z.uuid(), data: contactInputSchema }).strict(),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const lead = await openLead(db, id);
    const market = await loadSettings("market", db);
    const phone = data.phone ? normalizeVisitorPhone(data.phone, market.phoneCountryCode) : null;
    const whatsapp = data.whatsapp
      ? normalizeVisitorPhone(data.whatsapp, market.phoneCountryCode)
      : null;
    const bad: Record<string, string[]> = {};
    const hint = "Enter the number with the country code, for example +44 20 7946 0000";
    if (data.phone && !phone) bad.phone = [hint];
    if (data.whatsapp && !whatsapp) bad.whatsapp = [hint];
    if (Object.keys(bad).length)
      throw new ActionError("Please check the highlighted fields.", "VALIDATION", bad);
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(contacts).where(eq(contacts.id, lead.contactId));
      if (!before) throw new ActionError("This contact no longer exists.", "NOT_FOUND");
      const next = {
        name: data.name,
        email: data.email ? data.email.toLowerCase() : null,
        phone,
        whatsapp,
        nationality: data.nationality,
        preferredContact: data.preferredContact,
        preferredLanguage: data.preferredLanguage,
        marketingConsent: data.marketingConsent,
        marketingConsentAt: data.marketingConsent
          ? (before.marketingConsentAt ?? new Date())
          : null,
      };
      await tx
        .update(contacts)
        .set({ ...next, updatedBy: ctx.user.id })
        .where(eq(contacts.id, before.id));
      await auditChange(tx, {
        actor: ctx.actor,
        action: "contact.update",
        entityType: "contact",
        entityId: before.id,
        before: {
          name: before.name,
          email: before.email,
          phone: before.phone,
          whatsapp: before.whatsapp,
          nationality: before.nationality,
          preferredContact: before.preferredContact,
          preferredLanguage: before.preferredLanguage,
          marketingConsent: before.marketingConsent,
        },
        after: { ...next, marketingConsentAt: undefined },
      });
    });
    return { id };
  },
);

/** What they are looking for (09 §4, 05 §10); a budget typed here counts as theirs. */
export const updateLeadRequirements = adminAction(
  z.object({ id: z.uuid(), data: requirementsInputSchema }).strict(),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const lead = await openLead(db, id);
    const market = await loadSettings("market", db);
    const formats = [market.baseCurrency, ...market.visitorCurrencies];
    const code = data.currency ?? market.baseCurrency.code;
    const format = formats.find((c) => c.code === code);
    if (!format)
      throw new ActionError("Choose one of the market's currencies.", "VALIDATION", {
        currency: ["Unknown currency"],
      });
    const hasBudget = data.budgetMin !== null || data.budgetMax !== null;
    const next = {
      purpose: data.purpose ?? undefined,
      budgetMin: data.budgetMin === null ? null : toMinor(data.budgetMin, format.decimals),
      budgetMax: data.budgetMax === null ? null : toMinor(data.budgetMax, format.decimals),
      currency: code,
      ...(hasBudget ? { budgetFrom: "lead" as const } : {}),
      locationIds: data.locationIds,
      propertyTypeIds: data.propertyTypeIds,
      bedsMin: data.bedsMin,
      timeline: data.timeline ?? undefined,
      finance: data.finance ?? undefined,
      moveInDate: data.moveInDate,
      notes: data.notes || undefined,
    };
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    await db.transaction(async (tx) => {
      await tx
        .update(leads)
        .set({ requirements: clean, updatedBy: ctx.user.id })
        .where(eq(leads.id, lead.id));
      await auditChange(tx, {
        actor: ctx.actor,
        action: "lead.requirements",
        entityType: "lead",
        entityId: lead.id,
        before: lead.requirements,
        after: clean,
      });
    });
    await refreshLeadScore(db, lead.id);
    return { id };
  },
);

async function addEvent(
  db: Awaited<ReturnType<typeof getDb>>,
  leadId: string,
  type: "note" | "call" | "email_sent",
  body: string | null,
  meta: Record<string, unknown>,
  ctx: { actor: Parameters<typeof timelineActor>[0] },
) {
  const now = new Date();
  const [event] = await db
    .insert(leadEvents)
    .values({ leadId, type, body, meta, ...timelineActor(ctx.actor), createdAt: now })
    .returning({ id: leadEvents.id });
  await db.update(leads).set({ lastActivityAt: now }).where(eq(leads.id, leadId));
  return { id: event!.id, at: now };
}

export const addLeadNote = adminAction(
  z.object({ id: z.uuid(), body: z.string().trim().min(1, "Write the note").max(5000) }).strict(),
  { write: true },
  async ({ id, body }, ctx) => {
    const db = await getDb();
    await openLead(db, id);
    const event = await addEvent(db, id, "note", body, {}, ctx);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "lead.note",
      entityType: "lead",
      entityId: id,
      after: { eventId: event.id },
    });
    return { id: event.id };
  },
);

/** A call made to the lead (09 §4 composer); any logged call is the first response. */
export const logLeadCall = adminAction(
  z
    .object({
      id: z.uuid(),
      outcome: z.enum(callOutcomes),
      body: z.string().trim().max(5000).default(""),
    })
    .strict(),
  { write: true },
  async ({ id, outcome, body }, ctx) => {
    const db = await getDb();
    await openLead(db, id);
    const event = await addEvent(db, id, "call", body || null, { outcome }, ctx);
    const first = await markFirstResponse(db, id, event.at);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "lead.call",
      entityType: "lead",
      entityId: id,
      after: { outcome, firstResponse: first },
    });
    return { id: event.id, firstResponse: first };
  },
);

/** An email to the lead from the composer: sent through the email job, kept on the timeline. */
export const sendLeadEmail = adminAction(
  z
    .object({
      id: z.uuid(),
      subject: z.string().trim().min(1, "Write a subject").max(200),
      body: z.string().trim().min(1, "Write the message").max(10_000),
    })
    .strict(),
  { write: true },
  async ({ id, subject, body }, ctx) => {
    const db = await getDb();
    const lead = await openLead(db, id);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
    if (!contact?.email)
      throw new ActionError("Add an email address for this lead first.", "NO_EMAIL");
    const [agent] = lead.agentId
      ? await db.select({ email: agents.email }).from(agents).where(eq(agents.id, lead.agentId))
      : [];
    const brand = await loadEmailBrand(db);
    const { html, text } = await renderEmail(
      createElement(TemplateEmail, { brand, preview: subject, body }),
    );
    const emailId = await queueEmail(
      {
        to: contact.email,
        subject,
        template: "lead.message",
        html,
        text,
        replyTo: ctx.user.email || agent?.email || undefined,
        related: { type: "lead", id },
      },
      db,
    );
    const event = await addEvent(
      db,
      id,
      "email_sent",
      body,
      { subject, to: contact.email, emailId },
      ctx,
    );
    const first = await markFirstResponse(db, id, event.at);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "lead.email",
      entityType: "lead",
      entityId: id,
      after: { subject, to: contact.email, emailId },
    });
    return { id: event.id, firstResponse: first };
  },
);

export const addLeadTask = adminAction(
  z
    .object({
      id: z.uuid(),
      title: z.string().trim().min(1, "Name the task").max(200),
      dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
      agentId: z.uuid().nullable().default(null),
    })
    .strict(),
  { write: true },
  async ({ id, title, dueAt, agentId }, ctx) => {
    const db = await getDb();
    const lead = await openLead(db, id);
    const taskId = await db.transaction(async (tx) => {
      const [task] = await tx
        .insert(leadTasks)
        .values({
          leadId: id,
          title,
          dueAt: dueAt ? new Date(dueAt) : null,
          agentId: agentId ?? lead.agentId,
          createdByKind: "admin",
          createdBy: ctx.user.id,
        })
        .returning({ id: leadTasks.id });
      await refreshNextTask(tx, id);
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead.task.create",
        entityType: "lead",
        entityId: id,
        after: { taskId: task!.id, title, dueAt },
      });
      return task!.id;
    });
    return { id: taskId };
  },
);

/** Ticks a task off (a task_done entry on the timeline) or opens it again. */
export const completeLeadTask = adminAction(
  z.object({ taskId: z.uuid(), done: z.boolean() }).strict(),
  { write: true },
  async ({ taskId, done }, ctx) => {
    const db = await getDb();
    const [task] = await db
      .select()
      .from(leadTasks)
      .where(and(eq(leadTasks.id, taskId), eq(leadTasks.agencyId, currentAgencyId())));
    if (!task) throw new ActionError("This task no longer exists.", "NOT_FOUND");
    if (Boolean(task.doneAt) === done) return { id: taskId };
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(leadTasks)
        .set({ doneAt: done ? now : null })
        .where(eq(leadTasks.id, taskId));
      if (done)
        await tx.insert(leadEvents).values({
          leadId: task.leadId,
          type: "task_done",
          body: task.title,
          meta: { taskId },
          ...timelineActor(ctx.actor),
          createdAt: now,
        });
      await tx.update(leads).set({ lastActivityAt: now }).where(eq(leads.id, task.leadId));
      await refreshNextTask(tx, task.leadId);
      await writeAudit(tx, {
        actor: ctx.actor,
        action: done ? "lead.task.done" : "lead.task.reopen",
        entityType: "lead",
        entityId: task.leadId,
        after: { taskId, title: task.title },
      });
    });
    return { id: taskId };
  },
);

export const rescoreLead = adminAction(
  z.object({ id: z.uuid() }).strict(),
  { write: true },
  async ({ id }) => {
    const db = await getDb();
    await openLead(db, id);
    const result = await refreshLeadScore(db, id);
    return { score: result?.score ?? null };
  },
);
