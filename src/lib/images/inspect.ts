import { ImageParseError, ascii, u16le, u24le, u32be } from "./bytes";
import { blankHeifMetadata, heifBrands, heifDimensions } from "./heif";
import { jpegInfo, isPng, stripGif, stripJpeg, stripPng, stripWebp } from "./strip";
import { looksLikeSvg, svgDimensions } from "./svg";

/**
 * What an uploaded file really is, its display size and a copy without metadata, in plain
 * TypeScript so uploads behave the same in Node (dev, tests) and Cloudflare Workers.
 */

export { ImageParseError };

export type FileFormat = "jpeg" | "png" | "webp" | "gif" | "avif" | "heic" | "svg" | "pdf";
export type SniffedFormat = FileFormat | "unknown";

const info: Record<FileFormat, { mime: string; ext: string; label: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg", label: "JPEG" },
  png: { mime: "image/png", ext: "png", label: "PNG" },
  webp: { mime: "image/webp", ext: "webp", label: "WebP" },
  gif: { mime: "image/gif", ext: "gif", label: "GIF" },
  avif: { mime: "image/avif", ext: "avif", label: "AVIF" },
  heic: { mime: "image/heic", ext: "heic", label: "HEIC" },
  svg: { mime: "image/svg+xml", ext: "svg", label: "SVG" },
  pdf: { mime: "application/pdf", ext: "pdf", label: "PDF" },
};

export const mimeFor = (f: FileFormat) => info[f].mime;
export const extensionFor = (f: FileFormat) => info[f].ext;
export const formatLabel = (f: FileFormat) => info[f].label;

const byExtension: Record<string, FileFormat> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  jpe: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  avif: "avif",
  heic: "heic",
  heif: "heic",
  svg: "svg",
  pdf: "pdf",
};

export function formatFromName(name: string): FileFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext ? (byExtension[ext] ?? null) : null;
}

export function mimeFromName(name: string): string {
  const f = formatFromName(name);
  return f ? mimeFor(f) : "application/octet-stream";
}

/** Raster formats the pipeline can measure and strip (and Cloudflare can resize). */
export const rasterFormats: readonly FileFormat[] = ["jpeg", "png", "webp", "gif", "avif"];
export const isRaster = (f: FileFormat) => rasterFormats.includes(f);

export function kindFor(f: FileFormat): "image" | "document" {
  return f === "pdf" ? "document" : "image";
}

/** The real format from the first bytes. Never trust the file name or Content-Type. */
export function sniffFormat(b: Uint8Array): SniffedFormat {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (isPng(b)) return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(ascii(b, 0, 6))) return "gif";
  if (b.length >= 5 && ascii(b, 0, 5) === "%PDF-") return "pdf";
  const brands = heifBrands(b);
  if (brands.some((x) => x === "avif" || x === "avis")) return "avif";
  if (
    brands.some((x) => ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(x))
  ) {
    return "heic";
  }
  if (looksLikeSvg(b)) return "svg";
  return "unknown";
}

export type Dimensions = { width: number; height: number };

/** Size as displayed: EXIF orientation 5-8 (JPEG) and `irot` (AVIF/HEIC) swap the sides. */
export function readDimensions(
  b: Uint8Array,
  format: SniffedFormat = sniffFormat(b),
): Dimensions | null {
  try {
    switch (format) {
      case "jpeg": {
        const j = jpegInfo(b);
        if (!j) return null;
        return j.orientation >= 5
          ? { width: j.height, height: j.width }
          : { width: j.width, height: j.height };
      }
      case "png":
        return b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
      case "gif":
        return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
      case "webp": {
        const chunk = ascii(b, 12, 4);
        if (chunk === "VP8X" && b.length >= 30) {
          return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
        }
        if (chunk === "VP8 " && b.length >= 30) {
          return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
        }
        if (chunk === "VP8L" && b.length >= 25) {
          const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
          return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
        }
        return null;
      }
      case "avif":
      case "heic":
        return heifDimensions(b);
      case "svg":
        return svgDimensions(b);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Copy without metadata. Throws ImageParseError when the structure is broken, so a damaged
 * file is refused instead of being published with its location data still inside.
 */
export function stripMetadata(b: Uint8Array, format: SniffedFormat = sniffFormat(b)): Uint8Array {
  switch (format) {
    case "jpeg":
      return stripJpeg(b);
    case "png":
      return stripPng(b);
    case "webp":
      return stripWebp(b);
    case "gif":
      return stripGif(b);
    case "avif":
    case "heic":
      return blankHeifMetadata(b);
    default:
      return b;
  }
}
