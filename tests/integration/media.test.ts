import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as getMedia, HEAD as headMedia } from "@/app/media/[...key]/route";
import { PUT as putUpload } from "@/app/api/media/upload/route";
import { getDb } from "@/db/client";
import { media } from "@/db/schema/media";
import {
  createUpload,
  deleteMedia,
  getMediaDetail,
  moveMedia,
  saveMediaCrops,
  updateMediaDetails,
} from "@/features/media/actions";
import { PUBLIC_KEY_RE } from "@/features/media/keys";
import { cleanupStaleUploads } from "@/features/media/maintenance";
import { listFolders, listMedia, mediaSortable } from "@/features/media/queries";
import { patchSettings } from "@/features/settings/mutations";
import { runDueJobs } from "@/jobs/runner";
import { setImageTransformer, type ImageTransformer } from "@/lib/images/transformer";
import { memoryStorage, setStorage } from "@/lib/storage";
import { parseTableParams } from "@/lib/table-params";
import { updateTag } from "next/cache";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
let storage: ReturnType<typeof memoryStorage>;

async function photo(width = 40, height = 30, format: "jpeg" | "png" = "jpeg") {
  const p = sharp({ create: { width, height, channels: 3, background: "#c96442" } }).withExifMerge({
    IFD0: { Copyright: "Probe Owner" },
    IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 4/1 50/1" },
  });
  return new Uint8Array(await (format === "jpeg" ? p.jpeg() : p.png()).toBuffer());
}

function put(url: string, body: Uint8Array, size = body.length) {
  return putUpload(
    new Request(`http://localhost${url}`, {
      method: "PUT",
      body: body as Uint8Array<ArrayBuffer>,
      headers: { "content-length": String(size) },
    }),
  );
}

/** createUpload -> PUT -> run the media.process job. */
async function upload(
  bytes: Uint8Array,
  fileName: string,
  options: { folder?: string; color?: string | null; replaceId?: string | null } = {},
) {
  const res = await createUpload({
    fileName,
    size: bytes.length,
    folder: options.folder ?? "",
    color: options.color ?? null,
    replaceId: options.replaceId ?? null,
  });
  if (!res.ok) throw new Error(res.error);
  const response = await put(res.data.uploadUrl, bytes);
  await runDueJobs();
  const db = await getDb();
  const [row] = await db.select().from(media).where(eq(media.id, res.data.id));
  return { row: row!, response, uploadUrl: res.data.uploadUrl };
}

const contains = (b: Uint8Array | null, text: string) =>
  !!b && Buffer.from(b).includes(Buffer.from(text));

function fetchMedia(key: string, init: RequestInit = {}, method: "GET" | "HEAD" = "GET") {
  const url = new URL(`http://localhost/media/${key}`);
  const params = Promise.resolve({ key: url.pathname.slice("/media/".length).split("/") });
  const request = new Request(url, { ...init, method });
  return method === "GET" ? getMedia(request, { params }) : headMedia(request, { params });
}

describe("media library", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("media", "audit_log", "job_runs", "settings");
    storage = memoryStorage();
    setStorage(storage);
    setImageTransformer(null);
  });
  afterEach(() => {
    setStorage(null);
    setImageTransformer(undefined);
  });

  it("uploads a photo: signed PUT, processing job, metadata stripped, public key", async () => {
    const bytes = await photo();
    expect(contains(bytes, "Probe Owner")).toBe(true);
    const { row, response } = await upload(bytes, "Marina View.JPG", {
      folder: "Listings / Marina",
      color: "#aabbcc",
    });
    expect(response.status).toBe(200);
    expect(row).toMatchObject({
      status: "ready",
      kind: "image",
      mime: "image/jpeg",
      width: 40,
      height: 30,
      folder: "Listings/Marina",
      dominantColor: "#aabbcc",
      processingError: null,
    });
    expect(row.r2Key).toMatch(PUBLIC_KEY_RE);
    expect(row.r2Key).toMatch(/\/marina-view\.jpg$/);
    const stored = await storage.getBytes(row.r2Key);
    expect(contains(stored, "Probe Owner")).toBe(false);
    expect(row.sizeBytes).toBe(stored!.length);
    // The raw upload is gone; only the processed file remains.
    expect(storage.keys()).toEqual([row.r2Key]);
  });

  it("checks the signed link: exact size, single use, same admin, not tampered", async () => {
    const bytes = await photo();
    const res = await createUpload({
      fileName: "a.jpg",
      size: bytes.length,
      folder: "",
      color: null,
      replaceId: null,
    });
    if (!res.ok) throw new Error(res.error);

    expect((await put(res.data.uploadUrl, bytes.subarray(0, 10), 10)).status).toBe(400);
    expect((await put(res.data.uploadUrl.replace(/.$/, "x"), bytes)).status).toBe(403);
    adminState.user = { ...testAdmin, id: "0192f000-0000-7000-8000-00000000beef" };
    expect((await put(res.data.uploadUrl, bytes)).status).toBe(403);
    adminState.user = testAdmin;
    expect((await put(res.data.uploadUrl, bytes)).status).toBe(200);
    expect((await put(res.data.uploadUrl, bytes)).status).toBe(409);
  });

  it("refuses files over the size limit and unsupported types", async () => {
    const db = await getDb();
    await patchSettings(db, "general", { maxUploadMb: 1 }, actor);
    const big = await createUpload({
      fileName: "big.jpg",
      size: 2 * 1024 * 1024,
      folder: "",
      color: null,
      replaceId: null,
    });
    expect(big).toMatchObject({ ok: false, code: "TOO_LARGE" });
    const exe = await createUpload({
      fileName: "setup.exe",
      size: 10,
      folder: "",
      color: null,
      replaceId: null,
    });
    expect(exe).toMatchObject({ ok: false, code: "UNSUPPORTED" });

    // A ".jpg" that is really something else is caught from its bytes.
    const fake = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const { row, response } = await upload(fake, "holiday.jpg");
    expect(response.status).toBe(415);
    expect(row.status).toBe("failed");
  });

  it("refuses SVG with scripts, keeps plain SVG", async () => {
    const bad = await upload(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'),
      "logo.svg",
    );
    expect(bad.row.status).toBe("failed");
    expect(bad.row.processingError).toContain("event handlers");
    const good = await upload(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><path d="M0 0h1"/></svg>',
      ),
      "logo.svg",
    );
    expect(good.row).toMatchObject({
      status: "ready",
      mime: "image/svg+xml",
      width: 120,
      height: 40,
    });
  });

  it("HEIC: converted when Cloudflare Images is available, otherwise a clear failure", async () => {
    const heic = new Uint8Array(32);
    new DataView(heic.buffer).setUint32(0, 24);
    heic.set(new TextEncoder().encode("ftypheic"), 4);
    const failed = await upload(heic, "IMG_0001.HEIC");
    expect(failed.row.status).toBe("failed");
    expect(failed.row.processingError).toContain("Export it as JPEG");

    const jpeg = await photo(20, 10);
    const fake: ImageTransformer = {
      resize: async () => jpeg,
      convert: async () => jpeg,
      averageColor: async () => "#123456",
    };
    setImageTransformer(fake);
    const converted = await upload(heic, "IMG_0002.HEIC");
    expect(converted.row).toMatchObject({
      status: "ready",
      fileName: "IMG_0002.jpg",
      mime: "image/jpeg",
      width: 20,
      height: 10,
      dominantColor: "#123456",
    });
  });

  it("replace keeps the id and references, drops the old file and resets crops on a new shape", async () => {
    const first = await upload(await photo(40, 30), "front.jpg");
    const crop = { x: 0, y: 1 / 12, w: 1, h: 5 / 6 }; // 40x25 on a 40x30 image = 16:10
    expect(await saveMediaCrops({ id: first.row.id, crops: { "16:10": crop } })).toMatchObject({
      ok: true,
    });

    const same = await upload(await photo(80, 60, "png"), "front-new.png", {
      replaceId: first.row.id,
    });
    expect(same.row).toMatchObject({
      id: first.row.id,
      status: "ready",
      mime: "image/png",
      width: 80,
      height: 60,
    });
    expect(same.row.crops).toEqual({ "16:10": crop });
    expect(await storage.getBytes(first.row.r2Key)).toBeNull();

    const square = await upload(await photo(30, 30), "front-square.jpg", {
      replaceId: first.row.id,
    });
    expect(square.row.crops).toEqual({});
    expect(storage.keys()).toEqual([square.row.r2Key]);

    const pdf = await createUpload({
      fileName: "brochure.pdf",
      size: 100,
      folder: "",
      color: null,
      replaceId: first.row.id,
    });
    expect(pdf).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("validates crop shapes", async () => {
    const { row } = await upload(await photo(40, 30), "room.jpg");
    const wrong = await saveMediaCrops({
      id: row.id,
      crops: { "1:1": { x: 0, y: 0, w: 1, h: 1 } },
    });
    expect(wrong).toMatchObject({ ok: false, code: "VALIDATION" });
    const square = await saveMediaCrops({
      id: row.id,
      crops: { "1:1": { x: 0.125, y: 0, w: 0.75, h: 1 } },
    });
    expect(square).toMatchObject({ ok: true });
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith(`media:${row.id}`);
  });

  it("tracks usage and deletes only unused files", async () => {
    const used = await upload(await photo(), "logo.jpg");
    const unused = await upload(await photo(), "old.jpg");
    const db = await getDb();
    await patchSettings(db, "general", { logoLightId: used.row.id }, actor);
    const [counted] = await db.select().from(media).where(eq(media.id, used.row.id));
    expect(counted!.usedCount).toBe(1);

    const detail = await getMediaDetail({ id: used.row.id });
    expect(detail.ok && detail.data.uses.map((u) => u.label)).toEqual([
      "Settings: logo for light backgrounds",
    ]);

    const res = await deleteMedia({ ids: [used.row.id, unused.row.id] });
    expect(res).toMatchObject({
      ok: true,
      data: {
        deleted: 1,
        skipped: [
          {
            id: used.row.id,
            fileName: "logo.jpg",
            usedIn: ["Settings: logo for light backgrounds"],
          },
        ],
      },
    });
    expect(storage.keys()).toEqual([used.row.r2Key]);

    await patchSettings(db, "general", { logoLightId: null }, actor);
    const [released] = await db.select().from(media).where(eq(media.id, used.row.id));
    expect(released!.usedCount).toBe(0);
  });

  it("edits alt text, moves folders and filters the library", async () => {
    const a = await upload(await photo(), "pool.jpg", { folder: "Amenities" });
    const b = await upload(await photo(), "gym.jpg", { folder: "Amenities/Indoor" });
    await updateMediaDetails({
      id: a.row.id,
      data: { alt: "Rooftop pool at sunset", caption: "", folder: "Amenities" },
    });
    await moveMedia({ ids: [b.row.id], folder: "Gym" });

    const params = (sp: Record<string, string>) =>
      parseTableParams(sp, { sortable: mediaSortable, defaultSort: { id: "newest", desc: false } });
    expect((await listMedia(params({ q: "sunset" }))).rows.map((r) => r.fileName)).toEqual([
      "pool.jpg",
    ]);
    expect((await listMedia(params({ alt: "missing" }))).rows.map((r) => r.fileName)).toEqual([
      "gym.jpg",
    ]);
    expect((await listMedia(params({ folder: "Gym" }))).total).toBe(1);
    expect((await listMedia(params({ usage: "unused" }))).total).toBe(2);
    expect(await listFolders()).toEqual([
      { path: "Amenities", count: 1 },
      { path: "Gym", count: 1 },
    ]);
  });

  it("serves files with safe caching headers, ranges and conditional requests", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\ntrailer\n%%EOF\n");
    const { row } = await upload(pdfBytes, "Brochure 2026.pdf");
    expect(row).toMatchObject({ status: "ready", kind: "document", mime: "application/pdf" });

    const full = await fetchMedia(row.r2Key);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("application/pdf");
    expect(full.headers.get("cache-control")).toContain("immutable");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(full.headers.get("content-disposition")).toBe('inline; filename="brochure-2026.pdf"');
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(pdfBytes);

    const part = await fetchMedia(row.r2Key, { headers: { range: "bytes=0-3" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-3/${pdfBytes.length}`);
    expect(await part.text()).toBe("%PDF");
    expect((await fetchMedia(row.r2Key, { headers: { range: "bytes=999-" } })).status).toBe(416);

    const etag = full.headers.get("etag")!;
    expect((await fetchMedia(row.r2Key, { headers: { "if-none-match": etag } })).status).toBe(304);
    expect((await fetchMedia(row.r2Key, {}, "HEAD")).headers.get("content-length")).toBe(
      String(pdfBytes.length),
    );

    const image = await upload(await photo(), "facade.jpg");
    const img = await fetchMedia(image.row.r2Key);
    expect(img.headers.get("content-security-policy")).toContain("sandbox");
    // Development resizes through Next's optimizer.
    const variant = await fetchMedia(`${image.row.r2Key}?w=384&q=60`);
    expect(variant.status).toBe(307);
    expect(variant.headers.get("location")).toContain(
      `/_next/image?url=${encodeURIComponent(`/media/${image.row.r2Key}`)}&w=384&q=60`,
    );
    expect((await fetchMedia(`${image.row.r2Key}?w=999`)).status).toBe(400);
    // Raw uploads and unknown paths are never served.
    expect((await fetchMedia(`incoming/${image.row.id}/abc`)).status).toBe(404);
    expect((await fetchMedia("2026/01/aaaaaaaaaa/missing.jpg")).status).toBe(404);
  });

  it("cleans up uploads that never arrived", async () => {
    const res = await createUpload({
      fileName: "lost.jpg",
      size: 100,
      folder: "",
      color: null,
      replaceId: null,
    });
    if (!res.ok) throw new Error(res.error);
    expect(await cleanupStaleUploads()).toEqual({ removed: 0, failed: 0 });
    const tomorrow = new Date(Date.now() + 25 * 3600 * 1000);
    expect(await cleanupStaleUploads(undefined, tomorrow)).toEqual({ removed: 1, failed: 0 });
  });
});
