import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leadEvents, leads, leadTasks, viewings } from "@/db/schema/crm";
import { leadStages, locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { deleteLeadStage } from "@/features/lead-stages/actions";
import { assignLead, bulkUpdateLeads, changeLeadStage, setLeadTag } from "@/features/leads/actions";
import { captureLead } from "@/features/leads/capture";
import { exportLeadsCsv } from "@/features/leads/export";
import { leadSortable } from "@/features/leads/filters";
import { kanbanLeads, listLeads } from "@/features/leads/list";
import { leadFiltersFrom } from "@/features/leads/filters";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const DAY = 86_400_000;

const params = (q: Record<string, string>) =>
  parseTableParams(q, { sortable: leadSortable, defaultSort: { id: "created", desc: true } });

async function world() {
  const db = await getDb();
  await patchSettings(
    db,
    "market",
    {
      phoneCountryCode: "+971",
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      visitorCurrencies: [
        {
          code: "AED",
          symbol: "AED",
          symbolPosition: "before",
          decimals: 2,
          rate: 1,
          isExample: false,
        },
        {
          code: "USD",
          symbol: "$",
          symbolPosition: "before",
          decimals: 2,
          rate: 0.25,
          isExample: false,
        },
      ],
    },
    actor,
  );
  await patchSettings(db, "leads", { assignmentRule: "manual" }, actor);
  const ids = {
    city: newId(),
    marina: newId(),
    tower: newId(),
    layla: newId(),
    omar: newId(),
    away: newId(),
    fresh: newId(),
    contacted: newId(),
    won: newId(),
    lost: newId(),
  };
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Dubai", slug: "dubai" },
    { id: ids.marina, parentId: ids.city, level: "area", name: "Dubai Marina", slug: "marina" },
    { id: ids.tower, parentId: ids.marina, level: "building", name: "Marina Gate", slug: "gate" },
  ]);
  await db.insert(agents).values([
    { id: ids.layla, name: "Layla Haddad", slug: "layla", email: "layla@agency.example" },
    { id: ids.omar, name: "Omar Nasser", slug: "omar", sortOrder: 1 },
    { id: ids.away, name: "Away Agent", slug: "away", isActive: false },
  ]);
  await db.insert(leadStages).values([
    { id: ids.fresh, name: "New", sortOrder: 0, kind: "open" },
    { id: ids.contacted, name: "Contacted", sortOrder: 1, kind: "open" },
    { id: ids.won, name: "Won", sortOrder: 2, kind: "won" },
    { id: ids.lost, name: "Lost", sortOrder: 3, kind: "lost" },
  ]);
  const now = Date.now();
  const google = {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "marina-2bed",
    gclid: "x",
    landing_path: "/buy",
    channel: "paid_search" as const,
    at: new Date(now - 20 * DAY).toISOString(),
  };
  const sara = await captureLead(db, {
    source: "form",
    contact: { name: "Sara Khan", email: "sara@example.com", phone: "0501110001" },
    requirements: {
      purpose: "sale",
      budgetMin: 150_000_000,
      budgetMax: 200_000_000,
      currency: "AED",
      budgetFrom: "lead",
      locationIds: [ids.tower],
    },
    touch: google,
    now: new Date(now - 10 * DAY),
  });
  const ben = await captureLead(db, {
    source: "whatsapp",
    contact: { name: "Ben Ortiz", phone: "0501110002" },
    // $300k-400k = AED 1.2M-1.6M
    requirements: {
      purpose: "sale",
      budgetMin: 30_000_000,
      budgetMax: 40_000_000,
      currency: "USD",
      budgetFrom: "lead",
    },
    now: new Date(now - 2 * DAY),
  });
  const owner = await captureLead(db, {
    source: "valuation",
    contact: { name: "Olga Petrova", email: "olga@example.com" },
    requirements: { purpose: "sale" },
    now: new Date(now - DAY),
  });
  await db.update(leads).set({ aiScore: 82, agentId: ids.layla }).where(eq(leads.id, sara.leadId));
  await db
    .update(leads)
    .set({ aiScore: 35, firstResponseAt: new Date(now - DAY) })
    .where(eq(leads.id, ben.leadId));
  await db.update(leads).set({ aiScore: 55 }).where(eq(leads.id, owner.leadId));
  return { db, ids, sara, ben, owner, google };
}

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();

describe("Admin -> Leads list (09 §4)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "viewings",
      "visitors",
      "properties",
      "agents",
      "locations",
      "lead_stages",
      "job_runs",
      "settings",
      "audit_log",
    );
  });

  it("filters by search, stage, source, channel, campaign, type, agent, score, budget, area and more", async () => {
    const { db, ids, sara, owner } = await world();
    expect((await listLeads(params({}), db)).total).toBe(3);
    expect(names((await listLeads(params({ q: "sara" }), db)).rows)).toEqual(["Sara Khan"]);
    expect(names((await listLeads(params({ q: "olga@" }), db)).rows)).toEqual(["Olga Petrova"]);
    expect(names((await listLeads(params({ q: "1110002" }), db)).rows)).toEqual(["Ben Ortiz"]);
    expect(names((await listLeads(params({ stage: ids.fresh }), db)).rows)).toHaveLength(3);
    expect(names((await listLeads(params({ source: "whatsapp,valuation" }), db)).rows)).toEqual([
      "Ben Ortiz",
      "Olga Petrova",
    ]);
    expect(names((await listLeads(params({ channel: "paid_search" }), db)).rows)).toEqual([
      "Sara Khan",
    ]);
    expect(names((await listLeads(params({ campaign: "marina-2bed" }), db)).rows)).toEqual([
      "Sara Khan",
    ]);
    expect(names((await listLeads(params({ type: "seller,landlord" }), db)).rows)).toEqual([
      "Olga Petrova",
    ]);
    expect(names((await listLeads(params({ agent: "none" }), db)).rows)).toEqual([
      "Ben Ortiz",
      "Olga Petrova",
    ]);
    expect(names((await listLeads(params({ agent: ids.layla }), db)).rows)).toEqual(["Sara Khan"]);
    expect(names((await listLeads(params({ smin: "70" }), db)).rows)).toEqual(["Sara Khan"]);
    expect(names((await listLeads(params({ smin: "40", smax: "60" }), db)).rows)).toEqual([
      "Olga Petrova",
    ]);
    expect(names((await listLeads(params({ unanswered: "1" }), db)).rows)).toEqual([
      "Olga Petrova",
      "Sara Khan",
    ]);
    // Budgets compare in the base currency: Ben's $300-400k is AED 1.2-1.6M.
    expect(names((await listLeads(params({ bmin: "1300000", bmax: "1400000" }), db)).rows)).toEqual(
      ["Ben Ortiz"],
    );
    expect(names((await listLeads(params({ bmin: "1700000" }), db)).rows)).toEqual(["Sara Khan"]);
    // Sara looks in a tower inside Dubai Marina.
    expect(names((await listLeads(params({ area: ids.marina }), db)).rows)).toEqual(["Sara Khan"]);
    const today = new Date().toISOString().slice(0, 10);
    expect(names((await listLeads(params({ from: today }), db)).rows)).toEqual([]);

    // Viewings: any, and this week.
    await db.insert(viewings).values([
      {
        leadId: sara.leadId,
        contactId: sara.contactId,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600_000),
        status: "confirmed",
      },
      {
        leadId: owner.leadId,
        contactId: owner.contactId,
        startsAt: new Date(Date.now() - 40 * DAY),
        endsAt: new Date(Date.now() - 40 * DAY + 3600_000),
        status: "done",
      },
    ]);
    expect(names((await listLeads(params({ viewing: "any" }), db)).rows)).toEqual([
      "Olga Petrova",
      "Sara Khan",
    ]);
    expect(names((await listLeads(params({ viewing: "week" }), db)).rows)).toEqual(["Sara Khan"]);

    // Sorting and the row's own facts.
    const byScore = await listLeads(params({ sort: "-score" }), db);
    expect(byScore.rows.map((r) => r.score)).toEqual([82, 55, 35]);
    const [saraRow] = (await listLeads(params({ q: "sara" }), db)).rows;
    expect(saraRow).toMatchObject({
      channel: "paid_search",
      campaign: "marina-2bed",
      stageName: "New",
      agentName: "Layla Haddad",
      waiting: true,
      overdue: true,
      interest: "Buy · AED 1.5M–2M",
    });
    // Merged leads never show.
    await db.update(leads).set({ mergedIntoId: sara.leadId }).where(eq(leads.id, owner.leadId));
    expect((await listLeads(params({}), db)).total).toBe(2);
    expect(
      await kanbanLeads(
        leadFiltersFrom(
          () => undefined,
          () => [],
          "",
        ),
        db,
      ),
    ).toHaveLength(2);
  });

  it("stage moves: lost needs a reason, won a deal value; status, dates, timeline and audit follow", async () => {
    const { db, ids, sara } = await world();
    expect(await changeLeadStage({ id: sara.leadId, stageId: ids.lost })).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { lostReason: ["Choose a reason"] },
    });
    expect(
      await changeLeadStage({ id: sara.leadId, stageId: ids.lost, lostReason: "Bought elsewhere" }),
    ).toEqual({ ok: true, data: { id: sara.leadId, changed: true } });
    let [lead] = await db.select().from(leads).where(eq(leads.id, sara.leadId));
    expect(lead).toMatchObject({
      stageId: ids.lost,
      status: "lost",
      lostReason: "Bought elsewhere",
    });
    expect(lead!.lostAt).not.toBeNull();

    expect(await changeLeadStage({ id: sara.leadId, stageId: ids.won })).toMatchObject({
      ok: false,
      fieldErrors: { dealValue: ["Enter the deal value"] },
    });
    await changeLeadStage({ id: sara.leadId, stageId: ids.won, dealValue: 1_950_000 });
    [lead] = await db.select().from(leads).where(eq(leads.id, sara.leadId));
    expect(lead).toMatchObject({
      status: "won",
      lostReason: null,
      lostAt: null,
      dealValue: 195_000_000,
      dealCurrency: "AED",
    });
    expect(lead!.wonAt).not.toBeNull();

    // Reopened: open again, the deal value stays for the record.
    await changeLeadStage({ id: sara.leadId, stageId: ids.contacted });
    [lead] = await db.select().from(leads).where(eq(leads.id, sara.leadId));
    expect(lead).toMatchObject({ status: "open", wonAt: null, stageId: ids.contacted });
    expect(await changeLeadStage({ id: sara.leadId, stageId: ids.contacted })).toEqual({
      ok: true,
      data: { id: sara.leadId, changed: false },
    });

    const events = await db
      .select({ meta: leadEvents.meta })
      .from(leadEvents)
      .where(and(eq(leadEvents.leadId, sara.leadId), eq(leadEvents.type, "stage_changed")))
      .orderBy(asc(leadEvents.createdAt));
    expect(events.map((e) => (e.meta.to as { name: string }).name)).toEqual([
      "Lost",
      "Won",
      "Contacted",
    ]);
    expect(events[0]!.meta).toMatchObject({
      from: { name: "New" },
      lostReason: "Bought elsewhere",
    });
    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, sara.leadId));
    expect(audits.map((a) => a.action)).toEqual(["lead.stage", "lead.stage", "lead.stage"]);
  });

  it("assignment moves the open tasks; bulk assign, stage and tag; read-only is blocked", async () => {
    const { db, ids, sara, ben, owner } = await world();
    await db.insert(leadTasks).values([
      { leadId: sara.leadId, title: "Call", agentId: ids.layla },
      { leadId: sara.leadId, title: "Done one", agentId: ids.layla, doneAt: new Date() },
    ]);
    expect(await assignLead({ id: sara.leadId, agentId: ids.away })).toMatchObject({
      ok: false,
      error: "Choose an active agent profile.",
    });
    await assignLead({ id: sara.leadId, agentId: ids.omar });
    const tasks = await db.select().from(leadTasks).orderBy(asc(leadTasks.title));
    expect(tasks.map((x) => [x.title, x.agentId])).toEqual([
      ["Call", ids.omar],
      ["Done one", ids.layla],
    ]);

    const all = [sara.leadId, ben.leadId, owner.leadId];
    expect(
      await bulkUpdateLeads({ ids: all, action: { type: "assign", agentId: ids.omar } }),
    ).toEqual({
      ok: true,
      data: { updated: 2, skipped: [{ id: sara.leadId, reason: "Already like that" }] },
    });
    await bulkUpdateLeads({ ids: [ben.leadId, owner.leadId], action: { type: "tag", tag: "VIP" } });
    await setLeadTag({ id: ben.leadId, tag: "vip", add: false });
    expect(
      (await db.select({ tags: leads.tags }).from(leads).where(eq(leads.id, owner.leadId)))[0]!
        .tags,
    ).toEqual(["VIP"]);
    expect(names((await listLeads(params({ tag: "VIP" }), db)).rows)).toEqual(["Olga Petrova"]);
    expect(
      await bulkUpdateLeads({
        ids: [ben.leadId, owner.leadId],
        action: { type: "stage", stageId: ids.lost, lostReason: null, dealValue: null },
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    await bulkUpdateLeads({
      ids: [ben.leadId, owner.leadId],
      action: { type: "stage", stageId: ids.lost, lostReason: "Spam", dealValue: null },
    });
    expect(names((await listLeads(params({ status: "lost" }), db)).rows)).toEqual([
      "Ben Ortiz",
      "Olga Petrova",
    ]);

    adminState.user = { ...testAdmin, readOnly: true };
    expect(await changeLeadStage({ id: sara.leadId, stageId: ids.contacted })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
    expect(await bulkUpdateLeads({ ids: all, action: { type: "tag", tag: "x" } })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("exports the leads as CSV; deleting a stage moves its leads", async () => {
    const { db, ids, sara, ben } = await world();
    const { csv, count } = await exportLeadsCsv(db, [sara.leadId, ben.leadId]);
    expect(count).toBe(2);
    const lines = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(lines[0]).toContain("Name,Email,Phone,Type,Source");
    // Phone numbers start with "+": quoted so spreadsheets never run them as formulas.
    expect(lines[1]).toContain("Sara Khan,sara@example.com,'+971501110001,buyer,Website form");
    expect(lines[1]).toContain("Paid search,marina-2bed");
    expect(lines[2]).toContain("Ben Ortiz");

    expect(await deleteLeadStage({ id: ids.fresh, moveTo: null })).toMatchObject({
      ok: false,
      code: "IN_USE",
    });
    expect(await deleteLeadStage({ id: ids.fresh, moveTo: ids.contacted })).toMatchObject({
      ok: true,
    });
    const stagesNow = await db.select({ stageId: leads.stageId }).from(leads);
    expect(new Set(stagesNow.map((s) => s.stageId))).toEqual(new Set([ids.contacted]));
    expect(await db.select().from(contacts)).toHaveLength(3);
    void properties;
  });
});
