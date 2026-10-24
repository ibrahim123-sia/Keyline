import { getDb } from "@/db/client";
import { OWNER_PHOTO_MAX_MB } from "@/features/valuation/schema";
import { PhotoRefused, receiveOwnerPhoto } from "@/features/valuation/photos";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Step 2 of a photo from the public owner forms: the browser PUTs the bytes to the signed,
 * single-use link from `startOwnerPhotoUpload` (features/valuation/photos.ts has the rules).
 */
export async function PUT(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared <= 0 || declared > OWNER_PHOTO_MAX_MB * 1024 * 1024)
    return json(413, { ok: false, error: `Each photo can be up to ${OWNER_PHOTO_MAX_MB} MB.` });
  const body = new Uint8Array(await request.arrayBuffer());
  try {
    const db = await getDb();
    const res = await receiveOwnerPhoto(db, new URL(request.url).searchParams.get("token"), body);
    return json(200, { ok: true, ...res });
  } catch (err) {
    if (err instanceof PhotoRefused) return json(err.status, { ok: false, error: err.message });
    throw err;
  }
}
