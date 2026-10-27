import { and, eq, lt } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { getStorage } from "@/lib/storage";

/**
 * Hourly tidy-up: uploads that never arrived (the browser was closed) disappear after a day,
 * and files stuck in processing (the job died) are marked failed so the admin can retry.
 */
export async function cleanupStaleUploads(
  db?: DbOrTx,
  now = new Date(),
): Promise<{ removed: number; failed: number }> {
  const conn = db ?? (await getDb());
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600 * 1000);
  const abandoned = await conn
    .delete(media)
    .where(
      and(
        eq(media.agencyId, currentAgencyId()),
        eq(media.status, "uploading"),
        lt(media.createdAt, dayAgo),
      ),
    )
    .returning({ r2Key: media.r2Key });
  if (abandoned.length) await (await getStorage()).delete(abandoned.map((r) => r.r2Key));
  const stuck = await conn
    .update(media)
    .set({ status: "failed", processingError: "Processing did not finish. Upload the file again." })
    .where(
      and(
        eq(media.agencyId, currentAgencyId()),
        eq(media.status, "processing"),
        lt(media.updatedAt, sixHoursAgo),
      ),
    )
    .returning({ id: media.id });
  return { removed: abandoned.length, failed: stuck.length };
}
