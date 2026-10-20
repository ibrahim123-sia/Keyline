import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { auditLog } from "@/db/schema/system";
import { auditFilterOptions, auditSortable, listAuditEntries } from "@/features/audit/queries";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { truncate } from "../helpers/db";

const params = (sp: Record<string, string>) =>
  parseTableParams(sp, { sortable: auditSortable, defaultSort: { id: "newest", desc: false } });

describe("audit log viewer", () => {
  const nadia = newId();
  beforeEach(async () => {
    await truncate("audit_log", "users");
    const db = await getDb();
    await db
      .insert(users)
      .values({ id: nadia, email: "nadia@agency.example", name: "Nadia", role: "admin" });
    await db.insert(auditLog).values([
      {
        actorType: "admin",
        actorId: nadia,
        action: "settings.update",
        entityType: "settings",
        entityId: "general",
        before: { agencyName: "Old" },
        after: { agencyName: "New" },
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        actorType: "system",
        action: "media.delete",
        entityType: "media",
        before: { files: [] },
        createdAt: new Date("2026-10-05T10:00:00Z"),
      },
      {
        actorType: "admin",
        actorId: nadia,
        action: "location.create",
        entityType: "location",
        entityId: newId(),
        after: { name: "Harbour" },
        createdAt: new Date("2026-10-10T10:00:00Z"),
      },
    ]);
  });

  it("lists newest first with names and changed fields", async () => {
    const { rows, total } = await listAuditEntries(params({}));
    expect(total).toBe(3);
    expect(rows.map((r) => r.action)).toEqual([
      "location.create",
      "media.delete",
      "settings.update",
    ]);
    expect(rows[2]).toMatchObject({ actorName: "Nadia", changedKeys: ["agencyName"] });
    expect(rows[1]).toMatchObject({ actorType: "system", actorName: null });
  });

  it("filters by who, module, words and dates", async () => {
    expect((await listAuditEntries(params({ actor: "system" }))).total).toBe(1);
    expect((await listAuditEntries(params({ actor: nadia }))).total).toBe(2);
    expect((await listAuditEntries(params({ module: "settings" }))).rows[0]!.entityId).toBe(
      "general",
    );
    expect((await listAuditEntries(params({ q: "create" }))).total).toBe(1);
    const range = await listAuditEntries(params({ from: "2026-10-02", to: "2026-10-05" }));
    expect(range.rows.map((r) => r.action)).toEqual(["media.delete"]);
    expect(await auditFilterOptions()).toEqual({
      modules: ["location", "media", "settings"],
      actors: [{ id: nadia, name: "Nadia" }],
    });
  });
});
