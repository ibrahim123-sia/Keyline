import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { pages } from "@/db/schema/cms";
import { posts } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties, propertyMedia } from "@/db/schema/properties";
import { jobRuns } from "@/db/schema/system";
import { runCron } from "@/jobs/cron";
import { runDueJobs } from "@/jobs/runner";
import { CRAWL_JOB } from "@/features/seo/crawl-job";
import { runSeoCheck } from "@/features/seo/report-actions";
import { buildSeoReport } from "@/features/seo/report";
import { newId } from "@/lib/ids";
import type { RichDoc } from "@/lib/rich-text";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const doc = (text: string): RichDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("SEO report", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("properties", "media", "locations", "pages", "posts", "job_runs", "settings");
  });

  it("lists duplicates, missing descriptions, few photos, missing alts and thin pages", async () => {
    const db = await getDb();
    const area = newId();
    await db
      .insert(locations)
      .values({ id: area, level: "area", name: "Old Harbour", slug: "old-harbour" });
    const make = async (n: number, values: Partial<typeof properties.$inferInsert>) => {
      const id = newId();
      await db.insert(properties).values({
        id,
        reference: `LT-${500 + n}`,
        title: `Listing ${n}`,
        slug: `report-${n}`,
        purpose: "sale",
        status: "available",
        publishedAt: new Date(),
        currency: "AED",
        locationId: area,
        ...values,
      });
      return id;
    };
    // Same SEO title, no description, one photo without alt text.
    const a = await make(1, { seoTitle: "Sea view home" });
    await make(2, { seoTitle: "Sea view home", description: doc("Bright and airy.") });
    const photo = newId();
    await db.insert(media).values({
      id: photo,
      r2Key: `2026/10/report/${photo.slice(-8)}.jpg`,
      fileName: "a.jpg",
      mime: "image/jpeg",
      status: "ready",
    });
    await db.insert(propertyMedia).values({ propertyId: a, mediaId: photo, kind: "photo" });
    await db.insert(pages).values({
      title: "About",
      slug: "about",
      status: "published",
      sections: [{ id: "s1", type: "text", props: { body: "We sell homes." }, style: {} }],
    });
    await db
      .insert(posts)
      .values({ title: "Short news", slug: "short", status: "published", body: doc("Too short.") });

    const report = await buildSeoReport(db);
    expect(report.duplicateTitles).toEqual([
      expect.objectContaining({
        title: "Sea view home",
        items: expect.arrayContaining([expect.objectContaining({ kind: "listing" })]),
      }),
    ]);
    expect(report.duplicateTitles[0]?.items).toHaveLength(2);
    expect(report.missingDescriptions.map((i) => i.name)).toEqual(
      expect.arrayContaining(["LT-501 · Listing 1", "About", "Short news"]),
    );
    expect(report.missingDescriptions.map((i) => i.name)).not.toContain("LT-502 · Listing 2");
    expect(report.fewPhotos.map((i) => i.detail).sort()).toEqual([
      "0 of 5 photos",
      "1 of 5 photos",
    ]);
    expect(report.missingAlts).toEqual([
      expect.objectContaining({ path: "/property/report-1", detail: "1 photo" }),
    ]);
    expect(report.missingTitles.map((i) => i.path)).toEqual(["/about"]);
    expect(report.thinPages.map((i) => i.path)).toEqual(
      expect.arrayContaining(["/about", "/insights/short", "/buy/old-harbour"]),
    );
    expect(report.crawl).toEqual({ result: null, finishedAt: null, pending: false });
  });

  it("runs the link check from the report and every Monday, and shows its result", async () => {
    expect(await runSeoCheck({})).toEqual({ ok: true, data: { queued: true } });
    // A second click while it is queued does not start another one.
    expect(await runSeoCheck({})).toEqual({ ok: true, data: { queued: false } });
    const db = await getDb();
    expect((await buildSeoReport(db)).crawl.pending).toBe(true);

    // Run it against a fake site with one broken link.
    const fake = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/sitemap.xml"))
        return new Response(
          "<sitemapindex><sitemap><loc>http://localhost:3000/sitemaps/pages.xml</loc></sitemap></sitemapindex>",
        );
      if (url.endsWith("/sitemaps/pages.xml"))
        return new Response("<urlset><url><loc>http://localhost:3000/</loc></url></urlset>");
      if (url === "http://localhost:3000/")
        return new Response('<a href="/missing">x</a>', {
          headers: { "content-type": "text/html" },
        });
      return new Response("nope", { status: 404 });
    });
    await runDueJobs();
    fake.mockRestore();
    const report = await buildSeoReport(db);
    expect(report.crawl.pending).toBe(false);
    expect(report.crawl.result?.broken).toEqual([
      { href: "/missing", status: 404, foundOn: ["/"] },
    ]);

    // The weekly cron task queues it on Mondays (agency time; UTC by default).
    await db.delete(jobRuns);
    await runCron(
      new Date("2026-10-19T04:30:00.000Z"),
      (await import("@/jobs/cron")).cronTasks.filter((t) => t.name === "seo.crawl"),
    );
    const queued = await db.select().from(jobRuns);
    expect(queued.map((r) => r.name).sort()).toEqual([`cron:${CRAWL_JOB}`, CRAWL_JOB]);
  });
});
