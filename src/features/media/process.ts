import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { defineJob, type JobContext } from "@/jobs/types";
import { tags } from "@/lib/cache-tags";
import {
  ImageParseError,
  extensionFor,
  isRaster,
  kindFor,
  mimeFor,
  readDimensions,
  sniffFormat,
  stripMetadata,
  type FileFormat,
} from "@/lib/images/inspect";
import { svgProblem } from "@/lib/images/svg";
import { getImageTransformer } from "@/lib/images/transformer";
import { getStorage } from "@/lib/storage";
import { publicKey, renameExtension } from "./keys";
import { hexColorSchema } from "./schema";
import { expireTags } from "@/lib/expire-tags";

/** Larger images are refused: Cloudflare Images stops at 100 megapixels. */
export const MAX_PIXELS = 100_000_000;

class Refused extends Error {}

const payloadSchema = z.object({
  mediaId: z.uuid(),
  stagingKey: z.string().startsWith("incoming/"),
  replace: z.boolean(),
  fileName: z.string().min(1).max(200),
  color: hexColorSchema.nullable(),
});

type Result = {
  format: FileFormat;
  data: Uint8Array;
  width: number | null;
  height: number | null;
  color: string | null;
  fileName: string;
};

/** Checks, converts and cleans one upload. Throws Refused with a message for the admin. */
async function prepare(raw: Uint8Array, fileName: string, color: string | null): Promise<Result> {
  let format = sniffFormat(raw);
  let data = raw;
  let name = fileName;
  if (format === "unknown") {
    throw new Refused(
      "This file type is not supported. Upload JPEG, PNG, WebP, GIF, AVIF, SVG or PDF.",
    );
  }
  const transformer = await getImageTransformer();
  if (format === "heic") {
    // Normally converted in the browser before upload; this is the fallback.
    const converted = transformer
      ? await transformer.convert(raw, "image/jpeg", 90).catch(() => null)
      : null;
    if (!converted || sniffFormat(converted) !== "jpeg") {
      throw new Refused(
        "This HEIC photo could not be converted. Export it as JPEG and upload again.",
      );
    }
    data = converted;
    format = "jpeg";
    name = renameExtension(fileName, "jpg");
  }
  if (format === "svg") {
    const problem = svgProblem(data);
    if (problem) throw new Refused(problem);
  }
  try {
    data = stripMetadata(data, format);
  } catch (err) {
    if (err instanceof ImageParseError) throw new Refused(err.message);
    throw err;
  }
  const size = readDimensions(data, format);
  if (isRaster(format)) {
    if (!size || size.width < 1 || size.height < 1) {
      throw new Refused("The image could not be read. It may be damaged.");
    }
    if (size.width * size.height > MAX_PIXELS) {
      throw new Refused("This image is larger than 100 megapixels. Resize it and upload again.");
    }
  }
  let placeholder = color;
  if (!placeholder && transformer && isRaster(format)) {
    placeholder = await transformer.averageColor(data).catch(() => null);
  }
  return {
    format,
    data,
    width: size?.width ?? null,
    height: size?.height ?? null,
    color: placeholder,
    fileName: name,
  };
}

/** `media.process` (13 §2): dimensions, colour, HEIC convert, EXIF strip. */
export const mediaProcessJob = defineJob({
  name: "media.process",
  payload: payloadSchema,
  maxAttempts: 4,
  async run(p, ctx: JobContext) {
    const storage = await getStorage();
    const [row] = await ctx.db
      .select()
      .from(media)
      .where(and(eq(media.id, p.mediaId), eq(media.agencyId, currentAgencyId())));
    if (!row) {
      await storage.delete([p.stagingKey]); // deleted while uploading
      return { skipped: "deleted" };
    }
    const raw = await storage.getBytes(p.stagingKey);
    if (!raw) {
      if (row.r2Key !== p.stagingKey) return { skipped: "already processed" };
      await fail(ctx, p, "The upload did not arrive. Upload the file again.");
      return { failed: "missing upload" };
    }

    let result: Result;
    try {
      result = await prepare(raw, p.fileName, p.color);
      if (p.replace && kindFor(result.format) !== row.kind) {
        throw new Refused(
          row.kind === "image"
            ? "Replace an image with another image, so pages using it keep working."
            : "Replace a document with another PDF.",
        );
      }
    } catch (err) {
      if (!(err instanceof Refused)) throw err; // unexpected: retry with backoff
      await fail(ctx, p, err.message);
      await storage.delete([p.stagingKey]);
      return { failed: err.message };
    }

    const key = publicKey(result.fileName, extensionFor(result.format));
    await storage.put(key, result.data, mimeFor(result.format));
    const sameShape =
      row.width && row.height && result.width && result.height
        ? Math.abs(row.width / row.height - result.width / result.height) < 0.01
        : false;
    await ctx.db
      .update(media)
      .set({
        r2Key: key,
        fileName: result.fileName,
        mime: mimeFor(result.format),
        kind: kindFor(result.format),
        sizeBytes: result.data.length,
        width: result.width,
        height: result.height,
        dominantColor: result.color,
        status: "ready",
        processingError: null,
        // A replacement with another shape needs new crops.
        ...(p.replace && !sameShape ? { crops: {} } : {}),
      })
      .where(eq(media.id, row.id));

    const old = p.replace && row.r2Key !== p.stagingKey ? [row.r2Key] : [];
    await storage.delete([p.stagingKey, ...old]);
    try {
      expireTags(tags.media(row.id));
    } catch {
      /* outside a request (scripts, tests): nothing is cached there */
    }
    ctx.log("processed", { mediaId: row.id, key, bytes: result.data.length });
    return { key, bytes: result.data.length, width: result.width, height: result.height };
  },
});

async function fail(ctx: JobContext, p: z.output<typeof payloadSchema>, message: string) {
  await ctx.db
    .update(media)
    .set(
      p.replace
        ? { processingError: `The replacement was not used: ${message}` }
        : { status: "failed", processingError: message },
    )
    .where(eq(media.id, p.mediaId));
}
