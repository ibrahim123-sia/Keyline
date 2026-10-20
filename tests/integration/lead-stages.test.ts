import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leadStages } from "@/db/schema/master-data";
import {
  createDefaultLeadStages,
  deleteLeadStage,
  reorderLeadStages,
  saveLeadStage,
} from "@/features/lead-stages/actions";
import { listLeadStages } from "@/features/lead-stages/queries";
import { registerLeadStageUsage } from "@/features/lead-stages/usage";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const byName = async () => new Map((await listLeadStages()).map((s) => [s.name, s]));

describe("pipeline stages", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("lead_stages", "audit_log");
  });

  it("starts from the default pipeline, once", async () => {
    expect(await createDefaultLeadStages({})).toMatchObject({ ok: true, data: { count: 6 } });
    expect((await listLeadStages()).map((s) => [s.name, s.kind])).toEqual([
      ["New", "open"],
      ["Contacted", "open"],
      ["Viewing", "open"],
      ["Offer", "open"],
      ["Won", "won"],
      ["Lost", "lost"],
    ]);
    expect(await createDefaultLeadStages({})).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("refuses duplicate names and changes that break a complete pipeline", async () => {
    await createDefaultLeadStages({});
    const stages = await byName();
    const dup = await saveLeadStage({
      id: null,
      data: { name: "won", color: "#123456", kind: "open" },
    });
    expect(dup.ok === false && dup.fieldErrors?.name).toBeTruthy();

    const won = stages.get("Won")!;
    const onlyWon = await saveLeadStage({
      id: won.id,
      data: { name: "Won", color: won.color, kind: "open" },
    });
    expect(onlyWon).toMatchObject({ ok: false, code: "PIPELINE" });
    const lastLost = await deleteLeadStage({ id: stages.get("Lost")!.id, moveTo: null });
    expect(lastLost).toMatchObject({ ok: false, code: "PIPELINE" });

    // Renaming and recolouring is fine.
    const renamed = await saveLeadStage({
      id: won.id,
      data: { name: "Closed", color: "#2E6B3F", kind: "won" },
    });
    expect(renamed.ok).toBe(true);
  });

  it("a pipeline still being built can be edited freely", async () => {
    const a = await saveLeadStage({
      id: null,
      data: { name: "Inbox", color: "#5B6670", kind: "open" },
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const changed = await saveLeadStage({
      id: a.data.id,
      data: { name: "Inbox", color: "#5B6670", kind: "won" },
    });
    expect(changed.ok).toBe(true);
    expect(await deleteLeadStage({ id: a.data.id, moveTo: null })).toMatchObject({ ok: true });
  });

  it("reorders, and moves leads before deleting a stage in use", async () => {
    await createDefaultLeadStages({});
    const stages = await byName();
    const order = ["Contacted", "New", "Viewing", "Offer", "Won", "Lost"].map(
      (n) => stages.get(n)!.id,
    );
    await reorderLeadStages({ ids: order });
    expect((await listLeadStages()).map((s) => s.name).slice(0, 2)).toEqual(["Contacted", "New"]);

    // Stand-in for the leads table (Phase 6): "Offer" holds one lead.
    const held = new Map([["lead-1", stages.get("Offer")!.id]]);
    registerLeadStageUsage({
      label: "leads",
      table: leadStages,
      column: leadStages.id,
      merge: async (_db, fromId, toId) => {
        for (const [k, v] of held) if (v === fromId) held.set(k, toId);
      },
    });
    const offer = stages.get("Offer")!.id;
    expect(await deleteLeadStage({ id: offer, moveTo: null })).toMatchObject({
      ok: false,
      code: "IN_USE",
    });
    const res = await deleteLeadStage({ id: offer, moveTo: stages.get("Viewing")!.id });
    expect(res.ok).toBe(true);
    expect(held.get("lead-1")).toBe(stages.get("Viewing")!.id);
    const db = await getDb();
    expect(await db.select().from(leadStages).where(eq(leadStages.id, offer))).toHaveLength(0);
  });
});
