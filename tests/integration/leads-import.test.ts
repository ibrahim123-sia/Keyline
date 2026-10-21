import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leads } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { autoMapLeadColumns } from "@/features/leads/csv";
import { createManualLead, importLeadRows } from "@/features/leads/import-actions";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

describe("manual entry and CSV import (09 §1 #19, #20)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "properties",
      "agents",
      "lead_stages",
      "job_runs",
      "settings",
      "audit_log",
    );
    const db = await getDb();
    await patchSettings(
      db,
      "market",
      {
        phoneCountryCode: "+971",
        baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      },
      actor,
    );
    await patchSettings(db, "leads", { assignmentRule: "manual" }, actor);
  });

  it("adds a walk-in through the pipeline, with the agent picked by hand", async () => {
    const db = await getDb();
    const layla = newId();
    await db.insert(agents).values({ id: layla, name: "Layla", slug: "layla" });
    const res = await createManualLead({
      name: "Walk In",
      phone: "0501112222",
      how: "walk-in",
      agentId: layla,
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.isNew).toBe(true);
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({
      source: "manual",
      sourceDetail: "walk-in",
      agentId: layla,
      createdBy: testAdmin.id,
    });
    // The same phone again joins the open lead.
    const again = await createManualLead({
      name: "Walk In",
      phone: "+971 50 111 2222",
      how: "phone call",
    });
    expect(again).toMatchObject({ ok: true, data: { id: res.data.id, isNew: false } });
    expect(await createManualLead({ name: "Nobody" })).toMatchObject({
      ok: false,
      fieldErrors: { email: ["Enter an email address or a phone number"] },
    });
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await createManualLead({ name: "X", email: "x@example.com" })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("imports checked rows as leads; bad rows come back with their reasons", async () => {
    const db = await getDb();
    const listing = newId();
    await db.insert(properties).values({
      id: listing,
      reference: "HD-2041",
      title: "Marina view",
      slug: "marina-view",
      purpose: "sale",
      status: "available",
      publishedAt: new Date(),
    });
    const columns = autoMapLeadColumns([
      "Name",
      "Email",
      "Phone",
      "Budget max",
      "Ref",
      "Tags",
      "Source",
    ]);
    const res = await importLeadRows({
      columns,
      fileName: "expo.csv",
      rows: [
        {
          line: 2,
          cells: ["Sara Khan", "sara@example.com", "", "2500000", "HD-2041", "expo, vip", ""],
        },
        { line: 3, cells: ["Ben Ortiz", "", "0501234567", "", "", "", "Property expo"] },
        { line: 4, cells: ["", "", "", "", "", "", ""] },
        { line: 5, cells: ["Sara K", "SARA@example.com", "", "", "", "", ""] },
      ],
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.map((r) => [r.line, r.ok])).toEqual([
      [2, true],
      [3, true],
      [4, false],
      [5, true],
    ]);
    expect(res.data[2]).toMatchObject({ ok: false, errors: ["No name", "No email or phone"] });
    expect(res.data[3]).toMatchObject({ ok: true, isNew: false });
    const all = await db.select().from(leads);
    expect(all).toHaveLength(2);
    const sara = all.find((l) => l.propertyIds.includes(listing))!;
    expect(sara).toMatchObject({
      source: "import",
      sourceDetail: "expo.csv",
      tags: ["expo", "vip"],
      requirements: expect.objectContaining({
        budgetMax: 250_000_000,
        currency: "AED",
        budgetFrom: "lead",
      }),
    });
    const ben = all.find((l) => l.id !== sara.id)!;
    expect(ben.sourceDetail).toBe("Property expo");
    expect((await db.select().from(contacts).where(eq(contacts.id, ben.contactId)))[0]!.phone).toBe(
      "+971501234567",
    );

    expect(
      await importLeadRows({ columns: ["email"], rows: [{ line: 2, cells: ["a@b.co"] }] }),
    ).toMatchObject({
      ok: false,
      code: "MAPPING",
    });
  });
});
