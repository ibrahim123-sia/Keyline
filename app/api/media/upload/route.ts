import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { verifyUpload } from "@/features/media/keys";
import { uploadFormats } from "@/features/media/schema";
import { enqueue } from "@/jobs/enqueue";
import { requireAdmin } from "@/lib/auth/guards";
import { kindFor, mimeFor, sniffFormat } from "@/lib/images/inspect";
import { AuthError } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";

const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Step 2 of an upload: the browser PUTs the file to the signed link from `createUpload`.
 * The link only works for the admin who asked for it, for that exact size, once.
 */
export async function PUT(request: Request): Promise<Response> {
  const claims = await verifyUpload(new URL(request.url).searchParams.get("token"));
  if (!claims)
    return fail(403, "This upload link is invalid or has expired. Try the upload again.");

  try {
    const ctx = await requireAdmin({ write: true });
    if (ctx.user.id !== claims.u) return fail(403, "This upload link belongs to another user.");
  } catch (err) {
    if (err instanceof AuthError) return fail(401, "Please sign in again, then retry the upload.");
    throw err;
  }

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared !== claims.s) {
    return fail(400, "The file size does not match the upload request. Try again.");
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length !== claims.s) return fail(400, "The upload was incomplete. Try again.");

  const format = sniffFormat(body);
  const db = await getDb();
  const [row] = await db
    .select({ id: media.id, status: media.status, r2Key: media.r2Key })
    .from(media)
    .where(and(eq(media.id, claims.m), eq(media.agencyId, currentAgencyId())));
  if (!row) return fail(404, "This file was deleted while it was uploading.");
  if (!claims.r && (row.status !== "uploading" || row.r2Key !== claims.k)) {
    return fail(409, "This file has already been uploaded.");
  }

  if (format === "unknown" || !uploadFormats.includes(format)) {
    const message =
      "This file is not a supported image or PDF (the content does not match the name).";
    if (!claims.r) {
      await db
        .update(media)
        .set({ status: "failed", processingError: message })
        .where(eq(media.id, row.id));
    }
    return fail(415, message);
  }

  const storage = await getStorage();
  if (await storage.head(claims.k)) return fail(409, "This file has already been uploaded.");
  await storage.put(claims.k, body, mimeFor(format));
  if (!claims.r) {
    await db
      .update(media)
      .set({
        status: "processing",
        mime: mimeFor(format),
        kind: kindFor(format),
        sizeBytes: body.length,
      })
      .where(eq(media.id, row.id));
  }
  await enqueue(
    "media.process",
    {
      mediaId: row.id,
      stagingKey: claims.k,
      replace: claims.r,
      fileName: claims.n,
      color: claims.c,
    },
    { db, dedupeKey: `media.process:${claims.k}` },
  );
  return Response.json({ ok: true, id: row.id }, { headers: { "Cache-Control": "no-store" } });
}
