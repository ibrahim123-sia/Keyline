import {
  ImageParseError,
  ascii,
  concat,
  startsWithAscii,
  u16be,
  u16le,
  u32be,
  u32le,
} from "./bytes";

/**
 * Lossless metadata removal (07 §8 "strip EXIF location data on upload"; 14 §2). Keeps what a
 * decoder needs to show the picture correctly (colour profile, EXIF orientation) and drops
 * the rest: EXIF (GPS, camera serials), XMP, IPTC, comments, thumbnails and anything appended
 * after the image data. The pixels are never re-encoded, so listing photos keep full quality.
 */

/* --------------------------------- JPEG --------------------------------- */

/** Markers with no length field: TEM and RST0-RST7. */
const standalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd7);

/** EXIF orientation (1-8) from a TIFF block, or null. */
export function tiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const r16 = (o: number) => (le ? u16le(tiff, o) : u16be(tiff, o));
  const r32 = (o: number) => (le ? u32le(tiff, o) : u32be(tiff, o));
  if (r16(2) !== 42) return null;
  const ifd = r32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return null;
    if (r16(e) !== 0x0112) continue;
    const type = r16(e + 2);
    const value = type === 3 ? r16(e + 8) : type === 4 ? r32(e + 8) : 0;
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** APP1 holding only the Orientation tag, so stripped photos still display upright. */
function orientationSegment(orientation: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,                       // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,           // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF little endian, IFD0 at 8
    0x01, 0x00,                                   // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation
    0x00, 0x00, 0x00, 0x00,                       // no next IFD
  ]);
}

/** End of the entropy-coded data that starts at `o` (just after EOI), skipping later scans. */
function jpegDataEnd(b: Uint8Array, o: number): { end: number; hasEoi: boolean } {
  let i = o;
  while (i < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const next = b[i + 1];
    if (next === undefined) break;
    if (next === 0xff) {
      i++; // fill byte
      continue;
    }
    if (next === 0x00 || standalone(next)) {
      i += 2; // stuffed byte or restart marker
      continue;
    }
    if (next === 0xd9) return { end: i + 2, hasEoi: true };
    // Another segment between scans (progressive JPEG: DHT, SOS, DRI...): skip its payload.
    if (i + 4 > b.length) break;
    i += 2 + u16be(b, i + 2);
  }
  return { end: Math.min(i, b.length), hasEoi: false };
}

export type JpegInfo = { orientation: number; width: number; height: number };

/** Walks the segments before the image data. Throws when the structure is broken. */
function walkJpeg(
  b: Uint8Array,
  visit: (marker: number, start: number, end: number) => void,
): { sosStart: number; sosHeaderEnd: number } {
  if (!(b[0] === 0xff && b[1] === 0xd8)) throw new ImageParseError();
  let o = 2;
  for (;;) {
    while (b[o] === 0xff && b[o + 1] === 0xff) o++;
    if (o + 4 > b.length || b[o] !== 0xff) throw new ImageParseError();
    const marker = b[o + 1]!;
    if (marker === 0xd9) throw new ImageParseError(); // EOI before any image data
    if (standalone(marker)) {
      visit(marker, o, o + 2);
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    const end = o + 2 + len;
    if (len < 2 || end > b.length) throw new ImageParseError();
    if (marker === 0xda) return { sosStart: o, sosHeaderEnd: end };
    visit(marker, o, end);
    o = end;
  }
}

export function jpegInfo(b: Uint8Array): JpegInfo | null {
  let orientation = 1;
  let size: { width: number; height: number } | null = null;
  try {
    walkJpeg(b, (marker, start, end) => {
      if (marker === 0xe1 && startsWithAscii(b, "Exif\0", start + 4)) {
        orientation = tiffOrientation(b.subarray(start + 10, end)) ?? orientation;
      }
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC)
      if (!size && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        size = { height: u16be(b, start + 5), width: u16be(b, start + 7) };
      }
    });
  } catch {
    return null;
  }
  return size ? { orientation, ...(size as { width: number; height: number }) } : null;
}

export function stripJpeg(b: Uint8Array): Uint8Array {
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  let orientation = 1;
  let exifAt = -1;
  const { sosStart, sosHeaderEnd } = walkJpeg(b, (marker, start, end) => {
    const at = start + 4;
    let kept = true;
    if (marker >= 0xe0 && marker <= 0xef) {
      // APPn: keep JFIF, ICC profile and Adobe (colour transform); drop EXIF, XMP, MPF, IPTC...
      kept =
        (marker === 0xe0 && startsWithAscii(b, "JFIF\0", at)) ||
        (marker === 0xe2 && startsWithAscii(b, "ICC_PROFILE\0", at)) ||
        (marker === 0xee && startsWithAscii(b, "Adobe", at));
      if (marker === 0xe1 && startsWithAscii(b, "Exif\0", at)) {
        orientation = tiffOrientation(b.subarray(start + 10, end)) ?? orientation;
        if (exifAt < 0) exifAt = keep.length;
      }
    } else if (marker === 0xfe) {
      kept = false; // comment
    }
    if (kept) keep.push(b.subarray(start, end));
  });
  const data = jpegDataEnd(b, sosHeaderEnd);
  keep.push(b.subarray(sosStart, data.end));
  if (!data.hasEoi) keep.push(new Uint8Array([0xff, 0xd9]));
  if (orientation !== 1) keep.splice(exifAt < 0 ? 1 : exifAt, 0, orientationSegment(orientation));
  return concat(keep);
}

/* ---------------------------------- PNG --------------------------------- */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Ancillary chunks that affect how the image looks (colour, transparency, animation). */
const PNG_KEEP = new Set([
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "pHYs",
  "hIST",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
  "cICP",
  "mDCV",
  "cLLI",
  "mDCv",
  "cLLi",
]);

export function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
}

export function stripPng(b: Uint8Array): Uint8Array {
  if (!isPng(b)) throw new ImageParseError();
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let o = 8;
  let first = true;
  for (;;) {
    if (o + 12 > b.length) throw new ImageParseError();
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    const end = o + 12 + len;
    if (end > b.length || (first && type !== "IHDR")) throw new ImageParseError();
    first = false;
    const critical = (b[o + 4]! & 0x20) === 0;
    if (critical || PNG_KEEP.has(type)) keep.push(b.subarray(o, end));
    o = end;
    if (type === "IEND") return concat(keep); // anything appended after IEND is dropped
  }
}

/* --------------------------------- WebP --------------------------------- */

const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);

export function stripWebp(b: Uint8Array): Uint8Array {
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") throw new ImageParseError();
  const limit = Math.min(b.length, 8 + u32le(b, 4));
  const chunks: Uint8Array[] = [];
  let o = 12;
  while (o + 8 <= limit) {
    const type = ascii(b, o, 4);
    const size = u32le(b, o + 4);
    const dataEnd = o + 8 + size;
    if (dataEnd > limit) throw new ImageParseError();
    const end = Math.min(dataEnd + (size % 2), limit); // chunks are padded to an even size
    if (WEBP_KEEP.has(type)) {
      const chunk = b.slice(o, end);
      if (type === "VP8X") chunk[8] = chunk[8]! & ~(0x08 | 0x04); // clear the EXIF and XMP flags
      chunks.push(chunk);
    }
    o = end;
  }
  if (chunks.length === 0) throw new ImageParseError();
  const body = concat(chunks);
  const header = b.slice(0, 12);
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >>> 8) & 0xff;
  header[6] = (riffSize >>> 16) & 0xff;
  header[7] = (riffSize >>> 24) & 0xff;
  return concat([header, body]);
}

/* ---------------------------------- GIF --------------------------------- */

function subBlocksEnd(b: Uint8Array, o: number): number {
  let i = o;
  for (;;) {
    if (i >= b.length) throw new ImageParseError();
    const n = b[i]!;
    if (n === 0) return i + 1;
    i += 1 + n;
  }
}

/** Drops comment and unknown application extensions (XMP lives there) and trailing data. */
export function stripGif(b: Uint8Array): Uint8Array {
  if (!(ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") || b.length < 13) {
    throw new ImageParseError();
  }
  const flags = b[10]!;
  let o = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  const keep: Uint8Array[] = [b.subarray(0, o)];
  for (;;) {
    if (o >= b.length) throw new ImageParseError();
    const block = b[o]!;
    if (block === 0x3b) {
      keep.push(b.subarray(o, o + 1));
      return concat(keep);
    }
    if (block === 0x2c) {
      if (o + 10 > b.length) throw new ImageParseError();
      const f = b[o + 9]!;
      const tableEnd = o + 10 + (f & 0x80 ? 3 * 2 ** ((f & 7) + 1) : 0);
      const end = subBlocksEnd(b, tableEnd + 1); // +1: LZW minimum code size
      keep.push(b.subarray(o, end));
      o = end;
      continue;
    }
    if (block === 0x21) {
      const label = b[o + 1];
      const end = subBlocksEnd(b, o + 2);
      let kept = label === 0xf9 || label === 0x01; // graphic control, plain text
      if (label === 0xff) {
        const app = ascii(b, o + 3, 11);
        kept = app === "NETSCAPE2.0" || app === "ANIMEXTS1.0"; // looping
      }
      if (kept) keep.push(b.subarray(o, end));
      o = end;
      continue;
    }
    throw new ImageParseError();
  }
}
