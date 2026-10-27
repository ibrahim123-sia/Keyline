import {
  pgTable,
  text,
  integer,
  uuid,
  index,
  uniqueIndex,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";

export const mediaKinds = ["image", "video", "document", "other"] as const;
export const mediaStatuses = ["uploading", "processing", "ready", "failed"] as const;

/** Crop presets (07 §8): 16:10 gallery, 4:3 cards, 1:1 squares, OG share image 1200x630. */
export const cropPresets = ["16:10", "4:3", "1:1", "og"] as const;
export type CropPreset = (typeof cropPresets)[number];
/** Crop rectangle in fractions of the original image (0..1), so it survives resizing. */
export type CropRect = { x: number; y: number; w: number; h: number };

/** Files in R2 (05-data-model.md §7). `usedCount` is kept up to date by the reference helpers. */
export const media = pgTable(
  "media",
  {
    ...baseColumns(),
    r2Key: text().notNull(),
    fileName: text().notNull(),
    mime: text().notNull(),
    kind: text({ enum: mediaKinds }).notNull().default("image"),
    status: text({ enum: mediaStatuses }).notNull().default("uploading"),
    sizeBytes: bigint({ mode: "number" }).notNull().default(0),
    width: integer(),
    height: integer(),
    alt: text(),
    caption: text(),
    folder: text().notNull().default(""),
    uploadedBy: uuid(),
    /** Hex colour used as the loading placeholder. */
    dominantColor: text(),
    blurhash: text(),
    usedCount: integer().notNull().default(0),
    crops: jsonb().$type<Partial<Record<CropPreset, CropRect>>>().notNull().default({}),
    processingError: text(),
  },
  (t) => [
    uniqueIndex("media_r2_key_unique").on(t.r2Key),
    index("media_folder_idx").on(t.agencyId, t.folder, t.createdAt.desc()),
    index("media_kind_idx").on(t.agencyId, t.kind),
  ],
);
