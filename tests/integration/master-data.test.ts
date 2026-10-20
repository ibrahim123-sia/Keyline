import { beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { poiTypes, pois, propertyTypes } from "@/db/schema/master-data";
import { auditLog } from "@/db/schema/system";
import {
  deleteMasterItem,
  mergeMasterItem,
  reorderMasterItems,
  saveMasterItem,
} from "@/features/master-data/actions";
import { listMasterForAdmin } from "@/features/master-data/queries";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const poiType = (name: string) => ({
  name,
  icon: "school",
  category: "schools",
  googlePlaceType: "school",
  defaultSearchRadiusM: 3000,
  showOnProperty: true,
  travelMode: "drive",
});

describe("master data actions", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("pois", "poi_types", "property_types", "facilities", "badges", "audit_log");
  });

  it("creates property types with unique slugs and audits them", async () => {
    const a = await saveMasterItem({
      kind: "property-types",
      id: null,
      data: {
        name: "Apartment",
        slug: "",
        pluralName: "Apartments",
        category: "residential",
        icon: "building",
        fieldsHidden: [],
      },
    });
    const b = await saveMasterItem({
      kind: "property-types",
      id: null,
      data: {
        name: "Apartment",
        slug: "",
        pluralName: "",
        category: "residential",
        icon: null,
        fieldsHidden: [],
      },
    });
    expect(a.ok && b.ok).toBe(true);
    const db = await getDb();
    const rows = await db.select().from(propertyTypes).orderBy(propertyTypes.sortOrder);
    expect(rows.map((r) => r.slug)).toEqual(["apartments", "apartment"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1]);
    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "property_type.create"));
    expect(entries).toHaveLength(2);
    expect(updateTag).toHaveBeenCalledWith("master:property-types");
  });

  it("rejects invalid input with field errors and unknown kinds", async () => {
    const res = await saveMasterItem({
      kind: "badges",
      id: null,
      data: {
        name: "Hot",
        color: "#FFFFFF",
        textColor: "#EEEEEE",
        icon: null,
        autoRule: "none",
        autoDays: null,
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.textColor?.[0]).toMatch(/4\.5:1/);

    const bad = await saveMasterItem({ kind: "nope" as never, id: null, data: {} });
    expect(bad.ok).toBe(false);
  });

  it("blocks writes for the read-only demo viewer", async () => {
    adminState.user = { ...testAdmin, readOnly: true };
    const res = await saveMasterItem({
      kind: "facilities",
      id: null,
      data: { name: "Pool", icon: "waves", group: "building" },
    });
    expect(res).toMatchObject({ ok: false, code: "READ_ONLY" });
  });

  it("blocks customers entirely", async () => {
    adminState.user = { ...testAdmin, role: "customer" };
    const res = await saveMasterItem({
      kind: "facilities",
      id: null,
      data: { name: "Pool", icon: "waves", group: "building" },
    });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("reorders and updates", async () => {
    const created = [];
    for (const name of ["Gym", "Pool", "Parking"]) {
      const r = await saveMasterItem({
        kind: "facilities",
        id: null,
        data: { name, icon: null, group: "building" },
      });
      if (r.ok) created.push(r.data);
    }
    const ids = created.map((c) => c.id);
    const res = await reorderMasterItems({ kind: "facilities", ids: [ids[2]!, ids[0]!, ids[1]!] });
    expect(res.ok).toBe(true);
    const list = await listMasterForAdmin("facilities");
    expect(list.map((i) => i.name)).toEqual(["Parking", "Gym", "Pool"]);

    const upd = await saveMasterItem({
      kind: "facilities",
      id: ids[0]!,
      data: { name: "Fitness centre", icon: "dumbbell", group: "community" },
    });
    expect(upd.ok).toBe(true);
    const db = await getDb();
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "facility.update"))
      .orderBy(desc(auditLog.createdAt));
    expect(entry!.before).toMatchObject({ name: "Gym", group: "building" });
    expect(entry!.after).toMatchObject({ name: "Fitness centre", group: "community" });
  });

  it("safe delete is blocked while in use; merge moves references and deletes the source", async () => {
    const schools = await saveMasterItem({ kind: "poi-types", id: null, data: poiType("Schools") });
    const nurseries = await saveMasterItem({
      kind: "poi-types",
      id: null,
      data: poiType("Nurseries"),
    });
    if (!schools.ok || !nurseries.ok) throw new Error("setup failed");
    const db = await getDb();
    await db.insert(pois).values([
      {
        poiTypeId: nurseries.data.id,
        name: "Little Dunes Nursery",
        point: { lng: 55.14, lat: 25.08 },
      },
      {
        poiTypeId: nurseries.data.id,
        name: "Marina Kids Nursery",
        point: { lng: 55.141, lat: 25.081 },
      },
    ]);

    const list = await listMasterForAdmin("poi-types");
    expect(list.find((i) => i.name === "Nurseries")!.usage).toEqual({
      total: 2,
      parts: [{ label: "places", count: 2 }],
    });

    const blocked = await deleteMasterItem({ kind: "poi-types", id: nurseries.data.id });
    expect(blocked).toMatchObject({ ok: false, code: "IN_USE" });

    const merged = await mergeMasterItem({
      kind: "poi-types",
      fromId: nurseries.data.id,
      toId: schools.data.id,
    });
    expect(merged).toMatchObject({ ok: true, data: { moved: 2 } });
    const moved = await db.select().from(pois).where(eq(pois.poiTypeId, schools.data.id));
    expect(moved).toHaveLength(2);
    expect(await db.select().from(poiTypes).where(eq(poiTypes.id, nurseries.data.id))).toHaveLength(
      0,
    );

    const unused = await saveMasterItem({ kind: "poi-types", id: null, data: poiType("Beaches") });
    if (!unused.ok) throw new Error("setup failed");
    expect((await deleteMasterItem({ kind: "poi-types", id: unused.data.id })).ok).toBe(true);
  });
});
