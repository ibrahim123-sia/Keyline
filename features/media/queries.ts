import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media, type CropPreset, type CropRect } from "@/db/schema/media";
import { tags } from "@/lib/cache-tags";
import type { TableParams } from "@/lib/table-params";

export type PublicMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  dominantColor: string | null;
};

/** Public URL of a processed file, served by app/media/[...key]/route.ts (R2 or local disk). */
export function mediaUrl(r2Key: string): string {
  return `/media/${r2Key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Widths and qualities /media resizes to (the same lists next/image uses). */
export const variantWidths = [64, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
export const variantQualities = [60, 75, 90];

/** A resized copy, e.g. for thumbnails: /media/<key>?w=384&q=60. */
export function mediaVariantUrl(r2Key: string, width: number, quality = 75): string {
  return `${mediaUrl(r2Key)}?w=${width}&q=${quality}`;
}

export const variantPrefix = (r2Key: string) => `variants/${r2Key}/`;

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

export const mediaSortable = ["newest", "name", "size"] as const;
export type MediaSort = (typeof mediaSortable)[number];

export type MediaItem = {
  id: string;
  fileName: string;
  url: string | null;
  mime: string;
  kind: "image" | "video" | "document" | "other";
  status: "uploading" | "processing" | "ready" | "failed";
  processingError: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  folder: string;
  dominantColor: string | null;
  usedCount: number;
  crops: Partial<Record<CropPreset, CropRect>>;
  createdAt: string;
  updatedAt: string;
};

type Row = typeof media.$inferSelect;

export function toMediaItem(r: Row): MediaItem {
  return {
    id: r.id,
    fileName: r.fileName,
    url: r.status === "ready" ? mediaUrl(r.r2Key) : null,
    mime: r.mime,
    kind: r.kind,
    status: r.status,
    processingError: r.processingError,
    sizeBytes: r.sizeBytes,
    width: r.width,
    height: r.height,
    alt: r.alt ?? "",
    caption: r.caption ?? "",
    folder: r.folder,
    dominantColor: r.dominantColor,
    usedCount: r.usedCount,
    crops: r.crops ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const escapeLike = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** Library listing (07 §8): search by name or alt text, filter by type, folder and usage. */
export async function listMedia(
  params: TableParams<MediaSort>,
  db?: DbOrTx,
): Promise<{ rows: MediaItem[]; total: number }> {
  const conn = db ?? (await getDb());
  // Rows still waiting for their bytes belong to the uploader's screen, not the library.
  const where: SQL[] = [eq(media.agencyId, currentAgencyId()), ne(media.status, "uploading")];
  if (params.q) {
    const like = escapeLike(params.q);
    where.push(
      or(ilike(media.fileName, like), ilike(media.alt, like), ilike(media.caption, like))!,
    );
  }
  const kind = params.get("type");
  if (kind === "image" || kind === "document") where.push(eq(media.kind, kind));
  const folder = params.get("folder");
  if (folder !== undefined) where.push(eq(media.folder, folder));
  const usage = params.get("usage");
  if (usage === "unused") where.push(eq(media.usedCount, 0));
  if (usage === "used") where.push(sql`${media.usedCount} > 0`);
  if (params.get("status") === "failed") where.push(eq(media.status, "failed"));
  if (params.get("alt") === "missing") {
    where.push(eq(media.kind, "image"), sql`coalesce(trim(${media.alt}), '') = ''`);
  }

  const order =
    params.sort.id === "name"
      ? [params.sort.desc ? desc(media.fileName) : asc(media.fileName), desc(media.id)]
      : params.sort.id === "size"
        ? [params.sort.desc ? desc(media.sizeBytes) : asc(media.sizeBytes), desc(media.id)]
        : [params.sort.desc ? asc(media.createdAt) : desc(media.createdAt), desc(media.id)];

  const [rows, [count]] = await Promise.all([
    conn
      .select()
      .from(media)
      .where(and(...where))
      .orderBy(...order)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(media)
      .where(and(...where)),
  ]);
  return { rows: rows.map(toMediaItem), total: count?.n ?? 0 };
}

/** Folder paths with file counts, including parents of nested folders ("A" for "A/B"). */
export async function listFolders(db?: DbOrTx): Promise<Array<{ path: string; count: number }>> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select({ folder: media.folder, n: sql<number>`count(*)::int` })
    .from(media)
    .where(and(eq(media.agencyId, currentAgencyId()), ne(media.status, "uploading")))
    .groupBy(media.folder);
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.folder, (counts.get(r.folder) ?? 0) + r.n);
    const parts = r.folder.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      if (!counts.has(parent)) counts.set(parent, 0);
    }
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
