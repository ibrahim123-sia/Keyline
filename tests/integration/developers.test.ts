import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { developers } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { seoRedirects } from "@/db/schema/seo";
import { deleteDeveloper, mergeDeveloper, saveDeveloper } from "@/features/developers/actions";
import { listDevelopers, developerSortable } from "@/features/developers/queries";
import { emptyDeveloper, type DeveloperInput } from "@/features/developers/schema";
import { registerDeveloperUsage } from "@/features/developers/usage";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const input = (patch: Partial<DeveloperInput>): DeveloperInput => ({
  ...emptyDeveloper(),
  ...patch,
});

async function create(patch: Partial<DeveloperInput>) {
  const res = await saveDeveloper({ id: null, data: input(patch) });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

async function addMedia(): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.insert(media).values({
    id,
    r2Key: `2026/10/${id.slice(-10).replace(/-/g, "a")}/logo.png`,
    fileName: "logo.png",
    mime: "image/png",
    status: "ready",
  });
  return id;
}

const params = (sp: Record<string, string>) =>
  parseTableParams(sp, { sortable: developerSortable, defaultSort: { id: "name", desc: false } });

describe("developers", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("developers", "media", "seo_redirects", "audit_log");
  });
  afterEach(() => vi.restoreAllMocks());

  it("creates with a unique slug, refuses unsafe links and future years", async () => {
    const a = await create({ name: "Emaar Properties" });
    const b = await create({ name: "Emaar Properties" });
    expect(a.slug).toBe("emaar-properties");
    expect(b.slug).toBe("emaar-properties-2");

    const bad = await saveDeveloper({
      id: null,
      data: input({ name: "X", website: "javascript:alert(1)" }),
    });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(bad.ok === false && bad.fieldErrors?.website).toBeTruthy();
    const future = await saveDeveloper({
      id: null,
      data: input({ name: "Y", establishedYear: new Date().getFullYear() + 1 }),
    });
    expect(future).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("renaming the slug adds a 301; logo usage is tracked", async () => {
    const logo = await addMedia();
    const dev = await create({
      name: "Sobha Realty",
      logoId: logo,
      website: "https://sobha.example",
    });
    const db = await getDb();
    expect((await db.select().from(media).where(eq(media.id, logo)))[0]!.usedCount).toBe(1);

    const res = await saveDeveloper({
      id: dev.id,
      data: input({ name: "Sobha Realty", slug: "sobha", logoId: null }),
    });
    expect(res).toMatchObject({ ok: true, data: { slug: "sobha" } });
    const redirects = await db.select().from(seoRedirects);
    expect(redirects.map((r) => [r.fromPath, r.toPath])).toEqual([
      ["/developers/sobha-realty", "/developers/sobha"],
    ]);
    expect((await db.select().from(media).where(eq(media.id, logo)))[0]!.usedCount).toBe(0);
  });

  it("lists with typo-tolerant search", async () => {
    await create({ name: "Nakheel" });
    await create({ name: "Meraas" });
    const found = await listDevelopers(params({ q: "nakhel" }));
    expect(found.rows.map((r) => r.name)).toEqual(["Nakheel"]);
    expect((await listDevelopers(params({}))).total).toBe(2);
  });

  it("safe delete and merge with a redirect", async () => {
    const db = await getDb();
    const a = await create({ name: "Damac" });
    const b = await create({ name: "DAMAC Properties" });

    // Pretend a project table references developers (Phase 3 registers the real one).
    const refs = new Map<string, string>([["project-1", a.id]]);
    registerDeveloperUsage({
      label: "projects",
      table: developers,
      column: developers.id,
      merge: async (_db, fromId, toId) => {
        for (const [k, v] of refs) if (v === fromId) refs.set(k, toId);
      },
    });
    const blocked = await deleteDeveloper({ id: a.id });
    expect(blocked).toMatchObject({ ok: false, code: "IN_USE" });

    const merged = await mergeDeveloper({ fromId: a.id, intoId: b.id });
    expect(merged).toMatchObject({ ok: true, data: { moved: 1 } });
    expect(refs.get("project-1")).toBe(b.id);
    expect(await db.select().from(developers).where(eq(developers.id, a.id))).toHaveLength(0);
    const redirects = await db.select().from(seoRedirects);
    expect(redirects.map((r) => [r.fromPath, r.toPath])).toEqual([
      ["/developers/damac", "/developers/damac-properties"],
    ]);
  });
});
