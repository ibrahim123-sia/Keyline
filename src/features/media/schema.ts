import { z } from "zod";
import { cropPresets, type CropPreset } from "@/db/schema/media";
import type { FileFormat } from "@/lib/images/inspect";

/** Folders are simple paths: "Branding", "Listings/Marina Gate". "" is the top level. */
export const FOLDER_RE = /^$|^[\p{L}\p{N} _-]+(\/[\p{L}\p{N} _-]+)*$/u;

export const folderSchema = z
  .string()
  .trim()
  .max(100)
  .transform((v) =>
    v
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("/"),
  )
  .pipe(
    z.string().regex(FOLDER_RE, "Use letters, numbers, spaces, - and _ (and / for sub-folders)"),
  );

export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

/** What the uploader may send (07 §8). HEIC is converted to JPEG in the browser first. */
export const uploadFormats: readonly FileFormat[] = [
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "svg",
  "pdf",
  "heic",
];

export const acceptAttribute =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,application/pdf,image/heic,image/heif,.heic,.heif";

export const uploadRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    size: z.number().int().min(1),
    folder: folderSchema.default(""),
    color: hexColorSchema.nullable().default(null),
    replaceId: z.uuid().nullable().default(null),
  })
  .strict();

export const mediaDetailsSchema = z
  .object({
    alt: z.string().trim().max(250),
    caption: z.string().trim().max(500),
    folder: folderSchema,
  })
  .strict();

/** Width / height of each crop preset. */
export const presetRatio: Record<CropPreset, number> = {
  "16:10": 16 / 10,
  "4:3": 4 / 3,
  "1:1": 1,
  og: 1200 / 630,
};

export const presetLabel: Record<CropPreset, string> = {
  "16:10": "Gallery 16:10",
  "4:3": "Card 4:3",
  "1:1": "Square 1:1",
  og: "Share image 1200×630",
};

export const cropRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .strict()
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, "The crop must stay inside the image");

export const cropsSchema = z.partialRecord(z.enum(cropPresets), cropRectSchema);

/** True when the crop has the preset's shape on an image of this size (1% tolerance). */
export function cropMatchesPreset(
  rect: { w: number; h: number },
  preset: CropPreset,
  image: { width: number; height: number },
): boolean {
  const ratio = (rect.w * image.width) / (rect.h * image.height);
  return Math.abs(ratio / presetRatio[preset] - 1) <= 0.01;
}

/** The largest centred crop with the preset's shape. */
export function defaultCrop(preset: CropPreset, image: { width: number; height: number }) {
  const target = presetRatio[preset];
  const current = image.width / image.height;
  if (current > target) {
    const w = target / current;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = current / target;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}
