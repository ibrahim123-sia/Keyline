import { isWorkersRuntime } from "@/lib/env";
import { ImageParseError, ascii, concat, u32be } from "./bytes";
import { isPng } from "./strip";

/**
 * Pixel work goes to Cloudflare Images (01 §3 "Image resizing through Cloudflare") through the
 * `IMAGES` binding: resized variants for /media, the placeholder colour, and a last-resort HEIC
 * conversion. Outside Workers there is no binding; callers then skip that step.
 */

export type OutputFormat = "image/avif" | "image/webp" | "image/jpeg" | "image/png";

export interface ImageTransformer {
  resize(
    data: Uint8Array,
    options: { width: number; quality: number; format: OutputFormat },
  ): Promise<Uint8Array>;
  /** Re-encode (e.g. HEIC to JPEG). */
  convert(data: Uint8Array, format: OutputFormat, quality?: number): Promise<Uint8Array>;
  /** Average colour as #rrggbb, for the loading placeholder. */
  averageColor(data: Uint8Array): Promise<string | null>;
}

/* The parts of the Images binding we use. */
type ImageTransform = { width?: number; height?: number; fit?: "scale-down" | "contain" | "cover" };
type ImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(t: ImageTransform): ReturnType<ImagesBinding["input"]>;
    output(o: { format: OutputFormat; quality?: number }): Promise<{
      response(): Response;
    }>;
  };
};

/** Our buffers are never SharedArrayBuffer-backed, which is all Blob needs to know. */
const asBlobPart = (data: Uint8Array) => data as Uint8Array<ArrayBuffer>;

const toStream = (data: Uint8Array) =>
  new Blob([asBlobPart(data)]).stream() as ReadableStream<Uint8Array>;

export function cloudflareTransformer(images: ImagesBinding): ImageTransformer {
  const run = async (
    data: Uint8Array,
    transform: ImageTransform | null,
    output: { format: OutputFormat; quality?: number },
  ) => {
    let pipeline = images.input(toStream(data));
    if (transform) pipeline = pipeline.transform(transform);
    const result = await pipeline.output(output);
    return new Uint8Array(await result.response().arrayBuffer());
  };
  return {
    resize: (data, o) =>
      run(data, { width: o.width, fit: "scale-down" }, { format: o.format, quality: o.quality }),
    convert: (data, format, quality = 90) => run(data, null, { format, quality }),
    async averageColor(data) {
      const png = await run(
        data,
        { width: 1, height: 1, fit: "scale-down" },
        { format: "image/png" },
      );
      return colorOfTinyPng(png);
    },
  };
}

let override: ImageTransformer | null | undefined;

/** Tests: inject a fake transformer (or null for "none available"). */
export function setImageTransformer(t: ImageTransformer | null | undefined): void {
  override = t;
}

export async function getImageTransformer(): Promise<ImageTransformer | null> {
  if (override !== undefined) return override;
  if (!isWorkersRuntime()) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const images = (env as { IMAGES?: ImagesBinding }).IMAGES;
    return images ? cloudflareTransformer(images) : null;
  } catch {
    return null;
  }
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * Colour of the first pixel of an 8-bit PNG (a 1x1 thumbnail is the average of the image).
 * PNG filters cannot change the first pixel of the first row, so no unfiltering is needed.
 */
export async function colorOfTinyPng(png: Uint8Array): Promise<string | null> {
  if (!isPng(png)) return null;
  let o = 8;
  let colorType = -1;
  let bitDepth = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o + 12 <= png.length) {
    const len = u32be(png, o);
    const type = ascii(png, o + 4, 4);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "PLTE") palette = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (bitDepth !== 8 || idat.length === 0) return null;
  const raw = await inflate(concat(idat));
  const px = raw.subarray(1); // skip the row's filter byte
  switch (colorType) {
    case 0: // grey
    case 4: // grey + alpha
      return px.length >= 1 ? `#${hex(px[0]!)}${hex(px[0]!)}${hex(px[0]!)}` : null;
    case 2: // RGB
    case 6: // RGBA
      return px.length >= 3 ? `#${hex(px[0]!)}${hex(px[1]!)}${hex(px[2]!)}` : null;
    case 3: {
      const i = px[0];
      if (i === undefined || !palette || palette.length < i * 3 + 3) return null;
      return `#${hex(palette[i * 3]!)}${hex(palette[i * 3 + 1]!)}${hex(palette[i * 3 + 2]!)}`;
    }
    default:
      return null;
  }
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Blob([asBlobPart(data)])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new ImageParseError();
  }
}
