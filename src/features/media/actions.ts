"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { cropPresets, media } from "@/db/schema/media";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { newId } from "@/lib/ids";
import { formatFromName, formatLabel, kindFor, mimeFor } from "@/lib/images/inspect";
import { parseTableParams } from "@/lib/table-params";
import { getStorage } from "@/lib/storage";
import { signUpload, stagingKey } from "./keys";
import { listFolders, listMedia, mediaSortable, toMediaItem, variantPrefix } from "./queries";
import {
  cropMatchesPreset,
  cropsSchema,
  folderSchema,
  mediaDetailsSchema,
  uploadFormats,
  uploadRequestSchema,
} from "./schema";
import { mediaUsage } from "./usage";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function findMedia(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.agencyId, currentAgencyId())));
  if (!row) throw new ActionError("This file no longer exists.", "NOT_FOUND");
  return row;
}

/**
 * Step 1 of an upload (07 §8): checks size and type, records the file and returns a signed,
 * single-use link valid for 30 minutes. The browser then PUTs the bytes to that link.
 */
export const createUpload = adminAction(
  uploadRequestSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const general = await loadSettings("general", db);
    if (input.size > general.maxUploadMb * 1024 * 1024) {
      throw new ActionError(
        `"${input.fileName}" is ${mb(input.size)} MB. The upload limit is ${general.maxUploadMb} MB (Settings -> General).`,
        "TOO_LARGE",
      );
    }
    const format = formatFromName(input.fileName);
    if (!format || !uploadFormats.includes(format)) {
      throw new ActionError(
        `"${input.fileName}" is not a supported file. Upload JPEG, PNG, WebP, GIF, AVIF, HEIC, SVG or PDF.`,
        "UNSUPPORTED",
      );
    }

    if (input.replaceId) {
      const row = await findMedia(input.replaceId);
      if (row.status === "uploading" || row.status === "processing") {
        throw new ActionError("This file is still being processed. Try again in a moment.", "BUSY");
      }
      if (kindFor(format) !== row.kind) {
        throw new ActionError(
          row.kind === "image"
            ? "Replace an image with another image, so pages using it keep working."
            : "Replace a document with another PDF.",
          "VALIDATION",
        );
      }
      const key = stagingKey(row.id);
      await writeAudit(db, {
        actor: ctx.actor,
        action: "media.replace",
        entityType: "media",
        entityId: row.id,
        before: { fileName: row.fileName },
        after: { fileName: input.fileName, size: input.size },
      });
      const token = await signUpload({
        m: row.id,
        k: key,
        s: input.size,
        u: ctx.user.id,
        r: true,
        n: input.fileName,
        c: input.color,
      });
      return { id: row.id, uploadUrl: `/api/media/upload?token=${token}` };
    }

    const id = newId();
    const key = stagingKey(id);
    await db.transaction(async (tx) => {
      await tx.insert(media).values({
        id,
        r2Key: key,
        fileName: input.fileName,
        mime: mimeFor(format),
        kind: kindFor(format),
        status: "uploading",
        sizeBytes: input.size,
        folder: input.folder,
        dominantColor: input.color,
        uploadedBy: ctx.user.id,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "media.upload",
        entityType: "media",
        entityId: id,
        after: { fileName: input.fileName, folder: input.folder, size: input.size },
      });
    });
    const token = await signUpload({
      m: id,
      k: key,
      s: input.size,
      u: ctx.user.id,
      r: false,
      n: input.fileName,
      c: input.color,
    });
    return { id, uploadUrl: `/api/media/upload?token=${token}` };
  },
);

/** Polled by the uploader until processing ends. */
export const getMediaStatuses = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(100) }),
  {},
  async ({ ids }) => {
    const db = await getDb();
    const rows = await db
      .select()
      .from(media)
      .where(and(inArray(media.id, ids), eq(media.agencyId, currentAgencyId())));
    return rows.map(toMediaItem);
  },
);

export const updateMediaDetails = adminAction(
  z.object({ id: z.uuid(), data: mediaDetailsSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const before = await findMedia(id);
    const db = await getDb();
    const values = { alt: data.alt || null, caption: data.caption || null, folder: data.folder };
    const [after] = await db
      .update(media)
      .set({ ...values, updatedBy: ctx.user.id })
      .where(eq(media.id, id))
      .returning();
    await auditChange(db, {
      actor: ctx.actor,
      action: "media.update",
      entityType: "media",
      entityId: id,
      before: { alt: before.alt, caption: before.caption, folder: before.folder },
      after: { alt: after!.alt, caption: after!.caption, folder: after!.folder },
    });
    updateTag(tags.media(id));
    return toMediaItem(after!);
  },
);

/** Crop presets (07 §8): stored as fractions of the image, so they survive any resize. */
export const saveMediaCrops = adminAction(
  z.object({ id: z.uuid(), crops: cropsSchema }),
  { write: true },
  async ({ id, crops }, ctx) => {
    const row = await findMedia(id);
    if (row.kind !== "image" || !row.width || !row.height || row.mime === "image/svg+xml") {
      throw new ActionError("Crops can only be set on photos.", "VALIDATION");
    }
    for (const preset of cropPresets) {
      const rect = crops[preset];
      if (rect && !cropMatchesPreset(rect, preset, { width: row.width, height: row.height })) {
        throw new ActionError(
          `The ${preset} crop does not have the ${preset} shape.`,
          "VALIDATION",
        );
      }
    }
    const db = await getDb();
    const [after] = await db
      .update(media)
      .set({ crops, updatedBy: ctx.user.id })
      .where(eq(media.id, id))
      .returning();
    await auditChange(db, {
      actor: ctx.actor,
      action: "media.crops",
      entityType: "media",
      entityId: id,
      before: { crops: row.crops },
      after: { crops },
    });
    updateTag(tags.media(id));
    return toMediaItem(after!);
  },
);

export const moveMedia = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500), folder: folderSchema }),
  { write: true },
  async ({ ids, folder }, ctx) => {
    const db = await getDb();
    const moved = await db.transaction(async (tx) => {
      const rows = await tx
        .update(media)
        .set({ folder, updatedBy: ctx.user.id })
        .where(and(inArray(media.id, ids), eq(media.agencyId, currentAgencyId())))
        .returning({ id: media.id });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "media.move",
        entityType: "media",
        after: { ids: rows.map((r) => r.id), folder },
      });
      return rows.length;
    });
    return { count: moved };
  },
);

/**
 * Deletes files that nothing uses (07 §8 "bulk delete unused"). Usage is checked live, never
 * from the cached count; files in use are skipped and listed with where they are used.
 */
export const deleteMedia = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    const { removed, skipped } = await db.transaction(async (tx) => {
      const usage = await mediaUsage(tx, ids);
      const inUse = ids.filter((id) => (usage.get(id)?.length ?? 0) > 0);
      const free = ids.filter((id) => !inUse.includes(id));
      const removed = free.length
        ? await tx
            .delete(media)
            .where(and(inArray(media.id, free), eq(media.agencyId, currentAgencyId())))
            .returning({ id: media.id, r2Key: media.r2Key, fileName: media.fileName })
        : [];
      const names = inUse.length
        ? await tx
            .select({ id: media.id, fileName: media.fileName })
            .from(media)
            .where(and(inArray(media.id, inUse), eq(media.agencyId, currentAgencyId())))
        : [];
      if (removed.length) {
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "media.delete",
          entityType: "media",
          before: { files: removed.map((r) => ({ id: r.id, fileName: r.fileName })) },
        });
      }
      return {
        removed,
        skipped: names.map((n) => ({
          id: n.id,
          fileName: n.fileName,
          usedIn: (usage.get(n.id) ?? []).map((u) => u.label),
        })),
      };
    });

    // The rows are gone; the files go after the commit (an orphaned file is harmless).
    const storage = await getStorage();
    for (const r of removed) {
      try {
        await storage.delete([r.r2Key]);
        if (!r.r2Key.startsWith("incoming/")) await storage.deletePrefix(variantPrefix(r.r2Key));
      } catch (err) {
        console.error("[media] could not delete file", r.r2Key, (err as Error).message);
      }
      updateTag(tags.media(r.id));
    }
    return { deleted: removed.length, skipped };
  },
);

/** Details panel: the file plus everywhere it is used. */
export const getMediaDetail = adminAction(z.object({ id: z.uuid() }), {}, async ({ id }) => {
  const row = await findMedia(id);
  const db = await getDb();
  const uses = (await mediaUsage(db, [id])).get(id) ?? [];
  return { item: toMediaItem(row), uses, formatLabel: labelFor(row.mime) };
});

function labelFor(mime: string): string {
  const format = formatFromName(`x.${mime.split("/")[1]?.replace("svg+xml", "svg") ?? ""}`);
  return format ? formatLabel(format) : mime;
}

/** MediaPicker (02 §4): the library inside a dialog. */
export const searchMedia = adminAction(
  z.object({
    q: z.string().max(100).default(""),
    folder: z.string().max(100).nullable().default(null),
    type: z.enum(["image", "document"]).nullable().default(null),
    page: z.number().int().min(1).max(1000).default(1),
  }),
  {},
  async (input) => {
    const db = await getDb();
    const sp: Record<string, string> = { q: input.q, page: String(input.page), size: "30" };
    if (input.folder !== null) sp.folder = input.folder;
    if (input.type) sp.type = input.type;
    const params = parseTableParams(sp, {
      sortable: mediaSortable,
      defaultSort: { id: "newest", desc: false },
    });
    const [{ rows, total }, folders] = await Promise.all([listMedia(params, db), listFolders(db)]);
    return {
      rows: rows.filter((r) => r.status !== "failed"),
      total,
      folders,
      pageSize: params.pageSize,
    };
  },
);

/** Media ids the picker shows as selected may have been deleted since. */
export const filterExistingMedia = adminAction(
  z.object({ ids: z.array(z.uuid()).max(100) }),
  {},
  async ({ ids }) => {
    if (ids.length === 0) return [];
    const db = await getDb();
    const rows = await db
      .select()
      .from(media)
      .where(
        and(
          inArray(media.id, ids),
          eq(media.agencyId, currentAgencyId()),
          ne(media.status, "uploading"),
        ),
      );
    return rows.map(toMediaItem);
  },
);
