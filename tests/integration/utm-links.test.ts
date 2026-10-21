import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leads, utmLinks } from "@/db/schema/crm";
import { auditLog } from "@/db/schema/system";
import { deleteUtmLink, saveUtmLink } from "@/features/utm/actions";
import { emptyUtmLink, SHORT_CODE, type UtmLinkInput } from "@/features/utm/links";
import { listUtmLinks, utmLinkSortable } from "@/features/utm/queries";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));
// The route marks itself dynamic with connection(), which needs a request scope.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => {},
}));

const link = (patch: Partial<UtmLinkInput> = {}): UtmLinkInput => ({
  ...emptyUtmLink(),
  name: "Instagram ad, Marina",
  baseUrl: "/buy/dubai-marina?beds=2",
  utmSource: "instagram",
  utmMedium: "paid_social",
  utmCampaign: "marina-oct",
  ...patch,
});

const params = (q = "") =>
  parseTableParams(q ? { q } : {}, {
    sortable: utmLinkSortable,
    defaultSort: { id: "created", desc: true },
  });

describe("campaign links (09 §2)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("utm_links", "leads", "contacts", "audit_log");
  });

  it("saves links with a short code, keeps the code on edit, audits, deletes", async () => {
    const created = await saveUtmLink({ id: null, data: link() });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.shortCode).toMatch(SHORT_CODE);

    // A full address on this site is stored as its path; the code never changes.
    const edited = await saveUtmLink({
      id: created.data.id,
      data: link({ baseUrl: "http://localhost:3000/rent", utmContent: "reel-2" }),
    });
    expect(edited).toEqual({ ok: true, data: created.data });
    const db = await getDb();
    const [row] = await db.select().from(utmLinks);
    expect(row).toMatchObject({ baseUrl: "/rent", utmContent: "reel-2", clicks: 0 });

    // Never another site: a short link must not become an open redirect.
    expect(
      await saveUtmLink({ id: null, data: link({ baseUrl: "https://evil.example/x" }) }),
    ).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { baseUrl: expect.any(Array) } });

    expect(await deleteUtmLink({ id: created.data.id })).toMatchObject({ ok: true });
    expect(await db.select().from(utmLinks)).toEqual([]);
    const actions = (await db.select({ action: auditLog.action }).from(auditLog)).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(["utm_link.create", "utm_link.delete", "utm_link.update"]);
  });

  it("read-only admins cannot change links", async () => {
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await saveUtmLink({ id: null, data: link() })).toMatchObject({ ok: false });
    expect(await (await getDb()).select().from(utmLinks)).toEqual([]);
  });

  it("lists links with clicks and the leads whose last touch they carry", async () => {
    const db = await getDb();
    await saveUtmLink({ id: null, data: link() });
    await saveUtmLink({
      id: null,
      data: link({ name: "Flyer", utmSource: "flyer", utmMedium: "qr", utmCampaign: "open-day" }),
    });
    const [contact] = await db.insert(contacts).values({ name: "Sam" }).returning();
    const touch = (campaign: string) => ({
      utm_source: "instagram",
      utm_medium: "paid_social",
      utm_campaign: campaign,
      landing_path: "/buy",
      channel: "paid_social" as const,
      at: new Date().toISOString(),
    });
    await db.insert(leads).values([
      { contactId: contact!.id, source: "form", lastTouch: touch("marina-oct") },
      { contactId: contact!.id, source: "form", lastTouch: touch("marina-oct") },
      { contactId: contact!.id, source: "form", lastTouch: touch("other") },
    ]);
    const { rows, total } = await listUtmLinks(params(), db);
    expect(total).toBe(2);
    expect(rows.map((r) => [r.name, r.leads])).toEqual([
      ["Flyer", 0],
      ["Instagram ad, Marina", 2],
    ]);
    expect((await listUtmLinks(params("open-day"), db)).rows.map((r) => r.name)).toEqual(["Flyer"]);
  });

  it("/go/<code> counts the click and lands with the tags; bots are not counted", async () => {
    const created = await saveUtmLink({ id: null, data: link() });
    if (!created.ok) throw new Error(created.error);
    const { GET } = await import("@/app/go/[code]/route");
    const go = (code: string, ua = "Mozilla/5.0 (iPhone) Mobile Safari") =>
      GET(new Request(`http://havendune.example/go/${code}`, { headers: { "user-agent": ua } }), {
        params: Promise.resolve({ code }),
      });

    const res = await go(created.data.shortCode);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "http://havendune.example/buy/dubai-marina?beds=2&utm_source=instagram&utm_medium=paid_social&utm_campaign=marina-oct",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    await go(created.data.shortCode, "WhatsApp/2.24.1 A");
    await go(created.data.shortCode, "Googlebot/2.1");
    const db = await getDb();
    const [row] = await db
      .select({ clicks: utmLinks.clicks, last: utmLinks.lastClickedAt })
      .from(utmLinks)
      .where(eq(utmLinks.id, created.data.id));
    expect(row!.clicks).toBe(1);
    expect(row!.last).not.toBeNull();

    // Unknown or malformed codes land on the home page.
    expect((await go("zzzzz")).headers.get("location")).toBe("http://havendune.example/");
    expect((await go("../x")).headers.get("location")).toBe("http://havendune.example/");
  });
});
