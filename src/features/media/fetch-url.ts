import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { properties, propertyMedia } from "@/db/schema/properties";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { writeAudit } from "@/lib/audit";
import { extensionFor, mimeFor, sniffFormat, type FileFormat } from "@/lib/images/inspect";
import { FetchRefused, safeFetch } from "@/lib/safe-fetch";
import { slugify } from "@/lib/slug";
import { getStorage } from "@/lib/storage";
import { stagingKey } from "./keys";
import { syncMediaUsage } from "./usage";

/** Formats a listing photo can come in from the web (no SVG or PDF; HEIC needs the browser). */
const photoFormats: FileFormat[] = ["jpeg", "png", "webp", "gif", "avif"];

const payloadSchema = z.object({
  propertyId: z.uuid(),
  url: z.string().min(1).max(2000),
  sortOrder: z.number().int().min(0).max(200),
  userId: z.uuid().nullable(),
});

/** "https://cdn.example/photos/Living%20Room.JPG?x=1" -> "living-room.jpg". */
export function fileNameFromUrl(url: string, ext: string, index: number): string {
  let last = "";
  try {
    last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    /* keep the fallback */
  }
  const base = slugify(last.replace(/\.[a-z0-9]{2,5}$/i, ""), 60);
  return `${base === "item" ? `photo-${index + 1}` : base}.${ext}`;
}

/** Where a download came from, without query strings (they can hold access tokens). */
const shortUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.slice(0, 200);
  }
};

/**
 * `media.fetch_url` (07 §7 "photos from URLs fetched by a background job"): downloads one
 * photo of an imported listing safely, then hands it to `media.process` like an upload and
 * links it to the listing in order. The job id doubles as the media id, so a retry never
 * makes a second copy.
 */
export const mediaFetchUrlJob = defineJob({
  name: "media.fetch_url",
  payload: payloadSchema,
  maxAttempts: 3,
  async run(p, ctx) {
    const [listing] = await ctx.db
      .select({ id: properties.id, deletedAt: properties.deletedAt })
      .from(properties)
      .where(and(eq(properties.id, p.propertyId), eq(properties.agencyId, currentAgencyId())));
    if (!listing || listing.deletedAt) return { skipped: "listing deleted" };

    const mediaId = ctx.jobId;
    const [existing] = await ctx.db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.id, mediaId));
    if (existing) return { skipped: "already downloaded", mediaId };

    const general = await loadSettings("general", ctx.db);
    let fetched;
    try {
      fetched = await safeFetch(p.url, { maxBytes: general.maxUploadMb * 1024 * 1024 });
    } catch (err) {
      if (err instanceof FetchRefused && err.permanent) {
        ctx.log("refused", { url: shortUrl(p.url), reason: err.message });
        return { failed: err.message, url: shortUrl(p.url) };
      }
      throw err; // time-outs, 5xx and 429 are worth another try
    }
    const sniffed = sniffFormat(fetched.bytes);
    const format = photoFormats.find((x) => x === sniffed);
    if (!format) {
      const reason = "The address is not a photo (JPEG, PNG, WebP, GIF or AVIF).";
      return { failed: reason, url: shortUrl(p.url) };
    }

    const fileName = fileNameFromUrl(fetched.url, extensionFor(format), p.sortOrder);
    const key = stagingKey(mediaId);
    const storage = await getStorage();
    await storage.put(key, fetched.bytes, mimeFor(format));
    await ctx.db.transaction(async (tx) => {
      await tx.insert(media).values({
        id: mediaId,
        r2Key: key,
        fileName,
        mime: mimeFor(format),
        kind: "image",
        status: "processing",
        sizeBytes: fetched.bytes.length,
        folder: "Imports",
        uploadedBy: p.userId,
        createdBy: p.userId,
        updatedBy: p.userId,
      });
      const [cover] = await tx
        .select({ id: propertyMedia.id })
        .from(propertyMedia)
        .where(and(eq(propertyMedia.propertyId, p.propertyId), eq(propertyMedia.isCover, true)));
      await tx.insert(propertyMedia).values({
        propertyId: p.propertyId,
        mediaId,
        kind: "photo",
        sortOrder: p.sortOrder,
        isCover: p.sortOrder === 0 && !cover,
      });
      await writeAudit(tx, {
        actor: { type: "system", id: null },
        action: "media.import",
        entityType: "media",
        entityId: mediaId,
        after: { fileName, url: shortUrl(fetched.url), propertyId: p.propertyId },
      });
      await enqueue(
        "media.process",
        { mediaId, stagingKey: key, replace: false, fileName, color: null },
        { db: tx, dedupeKey: `media.process:${key}` },
      );
      await syncMediaUsage(tx, [mediaId]);
    });
    ctx.log("downloaded", { mediaId, bytes: fetched.bytes.length });
    return { mediaId, bytes: fetched.bytes.length, url: shortUrl(fetched.url) };
  },
});
