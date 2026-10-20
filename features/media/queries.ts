import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { tags } from "@/lib/cache-tags";

export type PublicMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  dominantColor: string | null;
};

/** Public URL of a stored file. Served by app/media/[...key]/route.ts (R2 or local disk). */
export function mediaUrl(r2Key: string): string {
  return `/media/${r2Key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Cached lookup for rendering (logos, covers). Null when missing or not ready. */
export async function getPublicMedia(id: string | null | undefined): Promise<PublicMedia | null> {
  "use cache";
  cacheLife("max");
  if (!id) return null;
  cacheTag(tags.media(id));
  const db = await getDb();
  const [row] = await db
    .select({
      id: media.id,
      r2Key: media.r2Key,
      width: media.width,
      height: media.height,
      alt: media.alt,
      dominantColor: media.dominantColor,
      status: media.status,
    })
    .from(media)
    .where(and(eq(media.id, id), eq(media.agencyId, currentAgencyId())))
    .limit(1);
  if (!row || row.status !== "ready") return null;
  return {
    id: row.id,
    url: mediaUrl(row.r2Key),
    width: row.width,
    height: row.height,
    alt: row.alt ?? "",
    dominantColor: row.dominantColor,
  };
}
