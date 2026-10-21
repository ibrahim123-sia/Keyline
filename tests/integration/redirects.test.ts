import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notFoundLog } from "@/db/schema/content";
import { seoRedirects } from "@/db/schema/seo";
import { auditLog } from "@/db/schema/system";
import {
  pruneNotFound,
  recordNotFound,
  listNotFound,
  notFoundSortable,
} from "@/features/seo/not-found-log";
import {
  deleteRedirects,
  fixRedirectChains,
  importRedirects,
  saveRedirect,
  setNotFoundStatus,
} from "@/features/seo/redirect-actions";
import { addRedirect } from "@/features/seo/redirects";
import { listRedirects, lookupRedirect, redirectSortable } from "@/features/seo/redirects-admin";
import { redirectIfMoved } from "@/features/seo/serve";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const redirectParams = (sp: Record<string, string> = {}) =>
  parseTableParams(sp, { sortable: redirectSortable, defaultSort: { id: "from", desc: false } });

async function save(fromPath: string, toPath: string, id: string | null = null) {
  return saveRedirect({ id, data: { fromPath, toPath, type: 301 } });
}

describe("redirects manager", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("seo_redirects", "not_found_log", "audit_log");
  });

  it("adds, edits and deletes redirects, audited; refuses duplicates and loops", async () => {
    const a = await save("/Old-Page/", "/new-page");
    expect(a).toMatchObject({ ok: true, data: { fromPath: "/old-page", toPath: "/new-page" } });
    expect(await save("/old-page", "/other")).toMatchObject({ ok: false, code: "VALIDATION" });
    expect((await save("/b", "/c")).ok).toBe(true);
    const loop = await save("/c", "/b");
    expect(loop).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(loop.ok === false && loop.fieldErrors?.toPath).toBeTruthy();

    const id = a.ok ? a.data.id : "";
    expect((await save("/old-page", "/newer-page", id)).ok).toBe(true);
    expect(await deleteRedirects({ ids: [id] })).toEqual({ ok: true, data: { deleted: 1 } });
    const db = await getDb();
    const actions = (await db.select().from(auditLog)).map((r) => r.action).sort();
    expect(actions).toEqual([
      "redirect.create",
      "redirect.create",
      "redirect.delete",
      "redirect.update",
    ]);
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await save("/x", "/y")).toMatchObject({ ok: false, code: "READ_ONLY" });
  });

  it("imports a CSV, reports bad lines and skips loops", async () => {
    expect((await save("/known", "/before")).ok).toBe(true);
    const res = await importRedirects({
      csv: "from,to,type\n/known,/after,301\n/one,/two\n/two,/one\n/bad,javascript:x\n/temp,/later,302\n",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ created: 2, updated: 1 });
    expect(res.data.problems.map((p) => p.line)).toEqual([4, 5]);
    const db = await getDb();
    const temp = await db.select().from(seoRedirects).where(eq(seoRedirects.fromPath, "/temp"));
    expect(temp[0]).toMatchObject({ type: 302, isAuto: false, source: "import" });
    expect(await importRedirects({ csv: "\n\n" })).toMatchObject({ ok: false });
  });

  it("flags chains and fixes them", async () => {
    const db = await getDb();
    // Automatic redirects collapse chains on their own; manual ones can still form them.
    await addRedirect(db, { from: "/slug-a", to: "/slug-b" });
    expect((await save("/x", "/y")).ok).toBe(true);
    expect((await save("/y", "/z")).ok).toBe(true);
    const list = await listRedirects(db, redirectParams());
    expect(list).toMatchObject({ total: 3, warnings: 1, chains: 1 });
    expect(list.rows.find((r) => r.fromPath === "/x")).toMatchObject({
      chain: true,
      finalTo: "/z",
    });
    expect((await listRedirects(db, redirectParams({ kind: "auto" }))).total).toBe(1);
    expect(
      (await listRedirects(db, redirectParams({ warn: "1" }))).rows.map((r) => r.fromPath),
    ).toEqual(["/x"]);
    expect(await fixRedirectChains({})).toEqual({ ok: true, data: { fixed: 1 } });
    expect((await listRedirects(db, redirectParams())).warnings).toBe(0);
  });

  it("serves redirects with hits, query rules first, keeping the visitor's query", async () => {
    expect((await save("/listing.php?id=5", "/property/sea-view")).ok).toBe(true);
    expect((await save("/listing.php", "/buy")).ok).toBe(true);
    const db = await getDb();
    expect((await lookupRedirect(db, "/listing.php?id=5"))?.to).toBe("/property/sea-view");
    expect((await lookupRedirect(db, "/LISTING.php?utm_source=Mail"))?.to).toBe(
      "/buy?utm_source=Mail",
    );
    expect(await lookupRedirect(db, "/nothing-here")).toBeNull();
    const [row] = await db
      .select()
      .from(seoRedirects)
      .where(eq(seoRedirects.fromPath, "/listing.php"));
    expect(row?.hits).toBe(1);
    expect(row?.lastHitAt).toBeInstanceOf(Date);

    // Next's redirect() throws a control-flow error carrying the target and the status.
    const thrown = await redirectIfMoved("/listing.php?id=5").catch((e: unknown) => e);
    expect(String((thrown as { digest?: string }).digest)).toContain("/property/sea-view");
    expect(String((thrown as { digest?: string }).digest)).toContain("308");
    await expect(redirectIfMoved("/nothing-here")).resolves.toBeUndefined();
  });
});

describe("404 monitor", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("seo_redirects", "not_found_log", "audit_log");
  });

  const params = (sp: Record<string, string> = {}) =>
    parseTableParams(sp, { sortable: notFoundSortable, defaultSort: { id: "hits", desc: true } });

  it("counts missing addresses, skips files, and resolves them with a redirect", async () => {
    const db = await getDb();
    expect(await recordNotFound(db, "/Old-Page/?utm=x", "https://google.com/search?q=secret")).toBe(
      true,
    );
    await recordNotFound(db, "/old-page", null);
    expect(await recordNotFound(db, "/logo.png", null)).toBe(false);
    expect(await recordNotFound(db, "/_next/static/x.js", null)).toBe(false);
    await recordNotFound(db, "/another", null);
    const list = await listNotFound(db, params());
    expect(list.rows.map((r) => [r.path, r.hits])).toEqual([
      ["/old-page", 2],
      ["/another", 1],
    ]);
    expect(list.rows[0]?.lastReferrer).toBe("https://google.com/search");

    expect((await save("/old-page", "/new-page")).ok).toBe(true);
    const open = await listNotFound(db, params());
    expect(open.rows.map((r) => r.path)).toEqual(["/another"]);
    expect(
      (await listNotFound(db, params({ status: "resolved" }))).rows.map((r) => r.path),
    ).toEqual(["/old-page"]);

    const another = open.rows[0]!.id;
    expect(await setNotFoundStatus({ ids: [another], resolved: true })).toEqual({
      ok: true,
      data: { changed: 1 },
    });
    expect((await listNotFound(db, params())).total).toBe(0);
    expect((await setNotFoundStatus({ ids: [another], resolved: false })).ok).toBe(true);
    expect((await listNotFound(db, params())).total).toBe(1);
  });

  it("forgets addresses nobody asked for in 90 days", async () => {
    const db = await getDb();
    await db.insert(notFoundLog).values([
      { path: "/stale", lastSeenAt: new Date("2026-01-01T00:00:00.000Z") },
      { path: "/fresh", lastSeenAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
    expect(await pruneNotFound(db, new Date("2026-10-21T00:00:00.000Z"))).toBe(1);
    expect((await db.select().from(notFoundLog)).map((r) => r.path)).toEqual(["/fresh"]);
  });
});
