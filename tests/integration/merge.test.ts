import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leadEvents, leads, leadTasks, viewings } from "@/db/schema/crm";
import { auditLog } from "@/db/schema/system";
import { mergeContactsAction } from "@/features/contacts/actions";
import { contactSortable, listContacts, loadContactPage } from "@/features/contacts/queries";
import { mergeLeadsAction } from "@/features/leads/actions";
import { captureLead } from "@/features/leads/capture";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const DAY = 86_400_000;

describe("contacts and merging (09 §4)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "viewings",
      "lead_stages",
      "job_runs",
      "settings",
      "audit_log",
    );
    const db = await getDb();
    await patchSettings(db, "market", { phoneCountryCode: "+971" }, actor);
    await patchSettings(
      db,
      "leads",
      { assignmentRule: "manual", duplicateMatching: "email" },
      actor,
    );
  });

  it("merges two contacts field by field and moves what belongs to them", async () => {
    const db = await getDb();
    const a = await captureLead(db, {
      source: "form",
      contact: { name: "Sam Visitor", email: "sam@example.com" },
      now: new Date(Date.now() - 3 * DAY),
    });
    const b = await captureLead(db, {
      source: "callback",
      type: "seller",
      contact: { name: "sam visitor", phone: "0501234567", marketingConsent: true },
    });
    await db.insert(viewings).values({
      leadId: b.leadId,
      contactId: b.contactId,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3600_000),
    });
    const page = (await loadContactPage(db, a.contactId))!;
    expect(page.duplicates.map((d) => d.id)).toEqual([b.contactId]);
    expect(
      (
        await listContacts(
          parseTableParams(
            {},
            { sortable: contactSortable, defaultSort: { id: "created", desc: true } },
          ),
          db,
        )
      ).total,
    ).toBe(2);

    expect(
      await mergeContactsAction({
        keepId: a.contactId,
        otherId: b.contactId,
        pick: { name: "keep", phone: "other" },
      }),
    ).toEqual({ ok: true, data: { id: a.contactId } });
    const [kept] = await db.select().from(contacts).where(eq(contacts.id, a.contactId));
    expect(kept).toMatchObject({
      name: "Sam Visitor",
      email: "sam@example.com",
      phone: "+971501234567",
      marketingConsent: true,
    });
    const [gone] = await db.select().from(contacts).where(eq(contacts.id, b.contactId));
    expect(gone!.mergedIntoId).toBe(a.contactId);
    expect((await db.select().from(leads)).map((l) => l.contactId)).toEqual([
      a.contactId,
      a.contactId,
    ]);
    expect((await db.select().from(viewings))[0]!.contactId).toBe(a.contactId);
    expect(
      (await db.select({ action: auditLog.action }).from(auditLog)).map((x) => x.action),
    ).toContain("contact.merge");
    expect(
      (
        await listContacts(
          parseTableParams(
            {},
            { sortable: contactSortable, defaultSort: { id: "created", desc: true } },
          ),
          db,
        )
      ).total,
    ).toBe(1);

    // The merged contact is never matched again; the kept one is.
    const again = await captureLead(db, {
      source: "form",
      contact: { name: "Sam", email: "sam@example.com" },
    });
    expect(again.contactId).toBe(a.contactId);
    expect(await mergeContactsAction({ keepId: a.contactId, otherId: b.contactId })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("merges leads: timeline, tasks and interest join the kept lead", async () => {
    const db = await getDb();
    const touch = (days: number, campaign: string) => ({
      channel: "paid_search" as const,
      utm_campaign: campaign,
      landing_path: "/",
      at: new Date(Date.now() - days * DAY).toISOString(),
    });
    const p1 = newId();
    const p2 = newId();
    const keep = await captureLead(db, {
      source: "form",
      contact: { name: "Lee", email: "lee@example.com" },
      requirements: { purpose: "sale", bedsMin: 2 },
      touch: touch(2, "late"),
    });
    const other = await captureLead(db, {
      source: "portal",
      type: "investor",
      contact: { name: "Lee", email: "lee2@example.com" },
      requirements: { purpose: "rent", budgetMax: 5_000_000, budgetFrom: "lead" },
      touch: touch(9, "early"),
    });
    await db
      .update(leads)
      .set({ propertyIds: [p1] })
      .where(eq(leads.id, keep.leadId));
    await db
      .update(leads)
      .set({ propertyIds: [p2], firstResponseAt: new Date() })
      .where(eq(leads.id, other.leadId));
    await db
      .insert(leadTasks)
      .values({ leadId: other.leadId, title: "Call", dueAt: new Date(Date.now() + DAY) });

    expect(
      await mergeLeadsAction({ keepId: keep.leadId, ids: [keep.leadId, other.leadId] }),
    ).toEqual({
      ok: true,
      data: { id: keep.leadId, merged: 1 },
    });
    const [kept] = await db.select().from(leads).where(eq(leads.id, keep.leadId));
    expect(kept).toMatchObject({
      propertyIds: [p1, p2],
      requirements: { purpose: "sale", bedsMin: 2, budgetMax: 5_000_000, budgetFrom: "lead" },
    });
    expect(kept!.firstTouch).toMatchObject({ utm_campaign: "early" });
    expect(kept!.lastTouch).toMatchObject({ utm_campaign: "late" });
    expect(kept!.firstResponseAt).not.toBeNull();
    expect(kept!.nextTaskAt).not.toBeNull();
    const [merged] = await db.select().from(leads).where(eq(leads.id, other.leadId));
    expect(merged!.mergedIntoId).toBe(keep.leadId);
    const events = await db
      .select({ leadId: leadEvents.leadId, type: leadEvents.type })
      .from(leadEvents)
      .orderBy(asc(leadEvents.createdAt));
    expect(new Set(events.map((e) => e.leadId))).toEqual(new Set([keep.leadId]));
    expect(events.map((e) => e.type)).toContain("merged");
    expect((await db.select().from(leadTasks))[0]!.leadId).toBe(keep.leadId);

    expect(
      await mergeLeadsAction({ keepId: keep.leadId, ids: [keep.leadId, other.leadId] }),
    ).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    adminState.user = { ...testAdmin, readOnly: true };
    expect(
      await mergeLeadsAction({ keepId: keep.leadId, ids: [keep.leadId, newId()] }),
    ).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });
});
