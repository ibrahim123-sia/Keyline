import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { media } from "@/db/schema/media";
import { properties, propertyMedia } from "@/db/schema/properties";
import { auditLog, jobRuns } from "@/db/schema/system";
import { PUBLIC_KEY_RE } from "@/features/media/keys";
import { fileNameFromUrl, mediaFetchUrlJob } from "@/features/media/fetch-url";
import { enqueue } from "@/jobs/enqueue";
import { runDueJobs } from "@/jobs/runner";
import { setImageTransformer } from "@/lib/images/transformer";
import { newId } from "@/lib/ids";
import { setSafeFetchDeps } from "@/lib/safe-fetch";
import { memoryStorage, setStorage } from "@/lib/storage";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

let jpeg: Uint8Array;
const requested: string[] = [];

async function listing() {
  const db = await getDb();
  const id = newId();
  await db.insert(properties).values({
    id,
    reference: `LT-${Math.floor(Math.random() * 1e6)}`,
    title: "Imported villa",
    slug: `imported-villa-${id.slice(-6)}`,
    purpose: "sale",
    source: "import",
  });
  return { db, id };
}

async function fetchPhoto(propertyId: string, url: string, sortOrder = 0) {
  return enqueue(
    "media.fetch_url",
    { propertyId, url, sortOrder, userId: testAdmin.id },
    { dedupeKey: `media.fetch_url:${propertyId}:${sortOrder}`, maxAttempts: 3 },
  );
}

async function job(id: string | null) {
  const db = await getDb();
  const [row] = await db.select().from(jobRuns).where(eq(jobRuns.id, id!));
  return row!;
}

describe("media.fetch_url", () => {
  beforeEach(async () => {
    await truncate("properties", "property_media", "media", "job_runs", "audit_log", "settings");
    setStorage(memoryStorage());
    setImageTransformer(null);
    jpeg ??= new Uint8Array(
      await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c96442" } })
        .jpeg()
        .toBuffer(),
    );
    requested.length = 0;
    setSafeFetchDeps({
      lookup: async (host) => (host === "private.example" ? ["10.0.0.5"] : ["93.184.216.34"]),
      fetch: (async (input: URL | RequestInfo) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("/busy")) return new Response("busy", { status: 503 });
        if (url.includes("/page"))
          return new Response("<!doctype html><title>x</title>", { status: 200 });
        return new Response(jpeg as Uint8Array<ArrayBuffer>, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }) as typeof fetch,
    });
  });
  afterEach(() => {
    setSafeFetchDeps(null);
    setStorage(null);
    setImageTransformer(undefined);
  });

  it("downloads, processes and links photos in order; the first is the cover", async () => {
    const { db, id } = await listing();
    const first = await fetchPhoto(
      id,
      "https://cdn.example/photos/Living%20Room.JPG?token=secret",
      0,
    );
    await fetchPhoto(id, "https://cdn.example/photos/kitchen.jpg", 1);
    await runDueJobs(); // downloads
    await runDueJobs(); // media.process

    const links = await db
      .select({ sortOrder: propertyMedia.sortOrder, isCover: propertyMedia.isCover, m: media })
      .from(propertyMedia)
      .innerJoin(media, eq(media.id, propertyMedia.mediaId))
      .where(eq(propertyMedia.propertyId, id))
      .orderBy(asc(propertyMedia.sortOrder));
    expect(
      links.map((l) => [l.sortOrder, l.isCover, l.m.fileName, l.m.status, l.m.folder]),
    ).toEqual([
      [0, true, "living-room.jpg", "ready", "Imports"],
      [1, false, "kitchen.jpg", "ready", "Imports"],
    ]);
    expect(links[0]!.m).toMatchObject({
      width: 40,
      height: 30,
      uploadedBy: testAdmin.id,
      usedCount: 1,
    });
    expect(links[0]!.m.r2Key).toMatch(PUBLIC_KEY_RE);

    const run = await job(first);
    expect(run.status).toBe("succeeded");
    // Query strings (tokens) never end up in job results or the audit log.
    expect(run.result).toMatchObject({ url: "https://cdn.example/photos/Living%20Room.JPG" });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "media.import"), eq(auditLog.entityId, links[0]!.m.id)));
    expect(entry).toMatchObject({ actorType: "system" });
    expect(JSON.stringify(entry!.after)).not.toContain("secret");
  });

  it("refuses private addresses and things that are not photos, without retrying", async () => {
    const { db, id } = await listing();
    const privateJob = await fetchPhoto(id, "https://private.example/a.jpg", 0);
    const metadataJob = await fetchPhoto(id, "http://169.254.169.254/latest/meta-data", 1);
    const pageJob = await fetchPhoto(id, "https://cdn.example/page", 2);
    await runDueJobs();
    expect((await job(privateJob)).result).toMatchObject({
      failed: "This address points to a private network.",
    });
    expect((await job(metadataJob)).result).toMatchObject({
      failed: "This address points to a private network.",
    });
    expect((await job(pageJob)).result).toMatchObject({
      failed: "The address is not a photo (JPEG, PNG, WebP, GIF or AVIF).",
    });
    expect(requested).toEqual(["https://cdn.example/page"]);
    expect(await db.select().from(media)).toEqual([]);
  });

  it("retries when the site is busy, and skips listings deleted meanwhile", async () => {
    const { db, id } = await listing();
    const busy = await fetchPhoto(id, "https://cdn.example/busy.jpg", 0);
    await runDueJobs();
    expect(await job(busy)).toMatchObject({
      status: "queued",
      attempts: 1,
      lastError: "The site answered with error 503.",
    });

    const other = await listing();
    const gone = await fetchPhoto(other.id, "https://cdn.example/a.jpg", 0);
    await db.update(properties).set({ deletedAt: new Date() }).where(eq(properties.id, other.id));
    await runDueJobs();
    expect((await job(gone)).result).toEqual({ skipped: "listing deleted" });
  });

  it("a second run of the same job makes no second copy", async () => {
    const { db, id } = await listing();
    const jobId = newId();
    const payload = {
      propertyId: id,
      url: "https://cdn.example/a.jpg",
      sortOrder: 0,
      userId: null,
    };
    const ctx = { db, jobId, attempt: 1, log: () => {} };
    expect(await mediaFetchUrlJob.run(payload, ctx)).toMatchObject({ mediaId: jobId });
    expect(await mediaFetchUrlJob.run(payload, { ...ctx, attempt: 2 })).toEqual({
      skipped: "already downloaded",
      mediaId: jobId,
    });
    expect(
      await db.select().from(propertyMedia).where(eq(propertyMedia.propertyId, id)),
    ).toHaveLength(1);
  });

  it("names files after the address", () => {
    expect(fileNameFromUrl("https://x.example/a/Sea%20View.JPEG?w=1", "jpg", 0)).toBe(
      "sea-view.jpg",
    );
    expect(fileNameFromUrl("https://x.example/", "webp", 2)).toBe("photo-3.webp");
  });
});
