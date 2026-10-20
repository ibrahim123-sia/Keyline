import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { seoRedirects } from "@/db/schema/seo";
import { deleteAgent, reorderAgents, saveAgent, setAgentActive } from "@/features/agents/actions";
import { listAgentsForAdmin } from "@/features/agents/queries";
import { emptyAgent, type AgentInput } from "@/features/agents/schema";
import { registerAgentUsage } from "@/features/agents/usage";
import { saveLocation } from "@/features/locations/actions";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const input = (patch: Partial<AgentInput>): AgentInput => ({ ...emptyAgent(), ...patch });

async function create(patch: Partial<AgentInput>) {
  const res = await saveAgent({ id: null, data: input(patch) });
  if (!res.ok) throw new Error(`${res.error} ${JSON.stringify(res.fieldErrors)}`);
  return res.data;
}

async function area(name: string) {
  const res = await saveLocation({
    id: null,
    data: {
      parentId: null,
      level: "country",
      name,
      slug: "",
      center: null,
      geom: null,
      description: null,
      isFeatured: false,
      seoTitle: null,
      seoDescription: null,
      canonicalUrl: null,
      noindex: false,
      ogImageId: null,
    },
  });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

describe("agent profiles", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("agents", "locations", "media", "seo_redirects", "audit_log");
  });

  it("normalises phone numbers and email, de-duplicates languages", async () => {
    const zone = await area("Coastal District");
    const { id } = await create({
      name: "Layla Haddad",
      phone: "+44 (20) 7946-0018",
      whatsapp: "+44 7700 900123",
      email: "Layla@Example.COM",
      languages: ["English", "Arabic", "English"],
      areas: [zone],
    });
    const db = await getDb();
    const [row] = await db.select().from(agents).where(eq(agents.id, id));
    expect(row).toMatchObject({
      slug: "layla-haddad",
      phone: "+442079460018",
      whatsapp: "+447700900123",
      email: "layla@example.com",
      languages: ["English", "Arabic"],
      areas: [zone],
      workingHours: null,
      sortOrder: 0,
    });
  });

  it("explains bad phones, hours and areas on the right fields", async () => {
    const phone = await saveAgent({ id: null, data: input({ name: "A", phone: "050 123 4567" }) });
    expect(phone.ok === false && phone.fieldErrors?.phone?.[0]).toContain("international format");

    const hours = {
      mon: [
        ["09:00", "13:00"],
        ["12:00", "18:00"],
      ] as Array<[string, string]>,
      tue: [["18:00", "09:00"]] as Array<[string, string]>,
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    };
    const bad = await saveAgent({ id: null, data: input({ name: "B", workingHours: hours }) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fieldErrors?.["workingHours.mon"]).toEqual(["These times overlap"]);
      expect(bad.fieldErrors?.["workingHours.tue.0"]).toEqual(["The end must be after the start"]);
    }

    const missing = await saveAgent({ id: null, data: input({ name: "C", areas: [newId()] }) });
    expect(missing).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(missing.ok === false && missing.fieldErrors?.areas).toBeTruthy();
  });

  it("slug changes redirect; photo usage follows the profile", async () => {
    const db = await getDb();
    const photo = newId();
    await db.insert(media).values({
      id: photo,
      r2Key: "2026/10/aaaaaaaaaa/omar.jpg",
      fileName: "omar.jpg",
      mime: "image/jpeg",
      status: "ready",
    });
    const { id } = await create({ name: "Omar Nasser", photoId: photo });
    expect((await db.select().from(media).where(eq(media.id, photo)))[0]!.usedCount).toBe(1);

    const res = await saveAgent({ id, data: input({ name: "Omar Nasser", slug: "omar" }) });
    expect(res).toMatchObject({ ok: true, data: { slug: "omar" } });
    expect((await db.select().from(seoRedirects)).map((r) => [r.fromPath, r.toPath])).toEqual([
      ["/agents/omar-nasser", "/agents/omar"],
    ]);
    expect((await db.select().from(media).where(eq(media.id, photo)))[0]!.usedCount).toBe(0);
  });

  it("orders the team, hides profiles and refuses to delete an agent in use", async () => {
    const a = await create({ name: "Agent A" });
    const b = await create({ name: "Agent B" });
    await reorderAgents({ ids: [b.id, a.id] });
    expect((await listAgentsForAdmin()).map((x) => x.name)).toEqual(["Agent B", "Agent A"]);

    await setAgentActive({ id: a.id, active: false });
    const db = await getDb();
    const rows = await db.select().from(agents).orderBy(asc(agents.sortOrder));
    expect(rows.map((r) => [r.name, r.isActive])).toEqual([
      ["Agent B", true],
      ["Agent A", false],
    ]);

    // Stand-in for listings (Phase 3): agent B "has" one.
    registerAgentUsage({ label: "listings", table: agents, column: agents.id });
    const blocked = await deleteAgent({ id: b.id });
    expect(blocked).toMatchObject({ ok: false, code: "IN_USE" });
    expect(blocked.ok === false && blocked.error).toContain("1 listings");
  });
});
