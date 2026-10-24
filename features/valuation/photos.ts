import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { formatFromName, mimeFor, sniffFormat, type FileFormat } from "@/lib/images/inspect";
import { newId, randomToken } from "@/lib/ids";
import { signToken, verifyToken } from "@/lib/signed-token";
import { getStorage } from "@/lib/storage";
import { OWNER_PHOTO_MAX_MB } from "./schema";

/**
 * Photos from the public owner forms (11 §5 step 4). Visitors cannot use the admin uploader,
 * so this is its own path with tighter rules:
 * - photos only (JPEG, PNG, WebP: checked by name, then by the real bytes), at most
 *   OWNER_PHOTO_MAX_MB each (or the library limit if lower);
 * - a signed, single-use link per file (30 minutes, exact size), and a per-IP rate limit;
 * - raw bytes land under their own private prefix (`incoming/owner-requests/`), then the usual
 *   `media.process` job strips location data and other metadata and checks the image;
 * - the browser gets a signed receipt per photo, and only receipts become a request's photos;
 *   photos never attached to a request are deleted after a day (cleanupOwnerPhotos).
 * The files sit in the media library folder "Owner requests", so the team can see them and
 * use them for the listing.
 */

export const OWNER_PHOTO_FOLDER = "Owner requests";
export const OWNER_PHOTO_PREFIX = "incoming/owner-requests/";
export const ownerPhotoFormats: readonly FileFormat[] = ["jpeg", "png", "webp"];
/** Uploads per IP per hour (a request takes at most 8). */
export const ownerPhotoRateRule = { limit: 24, windowSeconds: 3600 };

const UPLOAD_PURPOSE = "owner-photo-upload";
const RECEIPT_PURPOSE = "owner-photo";
const UPLOAD_TTL_SECONDS = 30 * 60;
const RECEIPT_TTL_SECONDS = 24 * 3600;
const STALE_HOURS = 24;

type UploadClaims = { m: string; k: string; s: number };

export class PhotoRefused extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** "My photo (2).JPG" -> "my-photo-2.jpg"; never a path. */
function cleanName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "photo";
  return base.replace(/[^\w.\- ]+/g, "").slice(-120) || "photo";
}

/** Step 1: records the photo and returns a signed link to PUT the bytes to. */
export async function startOwnerPhoto(
  db: DbOrTx,
  input: { fileName: string; size: number },
): Promise<{ id: string; uploadUrl: string }> {
  const format = formatFromName(input.fileName);
  if (!format || !ownerPhotoFormats.includes(format))
    throw new PhotoRefused("Add JPEG, PNG or WebP photos.", 415);
  const general = await loadSettings("general", db);
  const maxMb = Math.min(OWNER_PHOTO_MAX_MB, general.maxUploadMb);
  if (input.size > maxMb * 1024 * 1024)
    throw new PhotoRefused(`Each photo can be up to ${maxMb} MB.`, 413);
  const id = newId();
  const key = `${OWNER_PHOTO_PREFIX}${id}/${randomToken(12)}`;
  await db.insert(media).values({
    id,
    r2Key: key,
    fileName: cleanName(input.fileName),
    mime: mimeFor(format),
    kind: "image",
    status: "uploading",
    sizeBytes: input.size,
    folder: OWNER_PHOTO_FOLDER,
  });
  const token = await signToken(
    UPLOAD_PURPOSE,
    { m: id, k: key, s: input.size } satisfies UploadClaims,
    UPLOAD_TTL_SECONDS,
  );
  return { id, uploadUrl: `/api/uploads/owner-photo?token=${token}` };
}

/** Step 2: the bytes. Returns the receipt the form sends with the request. */
export async function receiveOwnerPhoto(
  db: DbOrTx,
  token: string | null,
  body: Uint8Array,
): Promise<{ id: string; receipt: string }> {
  const claims = await verifyToken<UploadClaims>(UPLOAD_PURPOSE, token);
  if (!claims || !claims.k.startsWith(OWNER_PHOTO_PREFIX))
    throw new PhotoRefused("This upload link has expired. Add the photo again.", 403);
  if (body.length !== claims.s)
    throw new PhotoRefused("The upload was incomplete. Add the photo again.", 400);
  const [row] = await db
    .select({ id: media.id, status: media.status, r2Key: media.r2Key, fileName: media.fileName })
    .from(media)
    .where(and(eq(media.id, claims.m), eq(media.agencyId, currentAgencyId())));
  if (!row || row.status !== "uploading" || row.r2Key !== claims.k)
    throw new PhotoRefused("This photo has already been uploaded.", 409);
  const format = sniffFormat(body);
  if (format === "unknown" || !ownerPhotoFormats.includes(format)) {
    await db
      .update(media)
      .set({ status: "failed", processingError: "Not a JPEG, PNG or WebP photo." })
      .where(eq(media.id, row.id));
    throw new PhotoRefused("This file is not a JPEG, PNG or WebP photo.", 415);
  }
  const storage = await getStorage();
  await storage.put(claims.k, body, mimeFor(format));
  await db
    .update(media)
    .set({ status: "processing", mime: mimeFor(format), sizeBytes: body.length })
    .where(eq(media.id, row.id));
  await enqueue(
    "media.process",
    { mediaId: row.id, stagingKey: claims.k, replace: false, fileName: row.fileName, color: null },
    { db, dedupeKey: `media.process:${claims.k}` },
  );
  const receipt = await signToken(RECEIPT_PURPOSE, { m: row.id }, RECEIPT_TTL_SECONDS);
  return { id: row.id, receipt };
}

/** The photos a form may attach: valid receipts for uploads that arrived (in order). */
export async function photoIdsFromReceipts(db: DbOrTx, receipts: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of receipts) {
    const claims = await verifyToken<{ m: string }>(RECEIPT_PURPOSE, r);
    if (claims && typeof claims.m === "string" && !ids.includes(claims.m)) ids.push(claims.m);
  }
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        eq(media.agencyId, currentAgencyId()),
        inArray(media.id, ids),
        eq(media.folder, OWNER_PHOTO_FOLDER),
        inArray(media.status, ["processing", "ready"]),
      ),
    );
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => found.has(id));
}

/**
 * Daily: owner photos that never became part of a request (the visitor left the form) or
 * failed are deleted after a day, unless the team used them in a listing.
 */
export async function cleanupOwnerPhotos(
  db: DbOrTx,
  now = new Date(),
): Promise<{ removed: number }> {
  const before = new Date(now.getTime() - STALE_HOURS * 3600_000);
  const rows = await db
    .select({ id: media.id, r2Key: media.r2Key })
    .from(media)
    .where(
      and(
        eq(media.agencyId, currentAgencyId()),
        eq(media.folder, OWNER_PHOTO_FOLDER),
        lt(media.createdAt, before),
        eq(media.usedCount, 0),
        sql`not exists (select 1 from valuation_requests v where ${media.id} = any(v.photo_ids))`,
        sql`not exists (select 1 from listing_requests l where ${media.id} = any(l.photo_ids))`,
        sql`not exists (select 1 from property_media pm where pm.media_id = ${media.id})`,
      ),
    )
    .limit(500);
  if (rows.length === 0) return { removed: 0 };
  await db.delete(media).where(
    inArray(
      media.id,
      rows.map((r) => r.id),
    ),
  );
  await (await getStorage()).delete(rows.map((r) => r.r2Key));
  return { removed: rows.length };
}
