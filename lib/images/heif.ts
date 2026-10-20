import { ImageParseError, ascii, u16be, u32be, uintBe } from "./bytes";

/**
 * Just enough ISOBMFF (the AVIF and HEIC container) to read the image size and to blank out
 * metadata items (EXIF and XMP) in place, which keeps every offset in the file valid.
 */

type Box = { type: string; start: number; dataStart: number; end: number };

function readBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const boxes: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    let header = 8;
    if (size === 1) {
      if (o + 16 > to) throw new ImageParseError();
      size = uintBe(b, o + 8, 8);
      header = 16;
    } else if (size === 0) {
      size = to - o;
    }
    if (size < header || o + size > to) throw new ImageParseError();
    boxes.push({ type, start: o, dataStart: o + header, end: o + size });
    o += size;
  }
  return boxes;
}

const child = (b: Uint8Array, box: Box, type: string, fullBox = false) =>
  readBoxes(b, box.dataStart + (fullBox ? 4 : 0), box.end).find((x) => x.type === type);

function cString(b: Uint8Array, o: number, end: number): { value: string; next: number } {
  let i = o;
  while (i < end && b[i] !== 0) i++;
  return { value: ascii(b, o, i - o), next: i + 1 };
}

function metaBox(b: Uint8Array): Box | undefined {
  return readBoxes(b, 0, b.length).find((x) => x.type === "meta");
}

/** Item ids whose payload is metadata: EXIF, and XMP stored as a `mime` item. */
function metadataItemIds(b: Uint8Array, meta: Box): Set<number> {
  const ids = new Set<number>();
  const iinf = child(b, meta, "iinf", true);
  if (!iinf) return ids;
  const version = b[iinf.dataStart]!;
  const entriesStart = iinf.dataStart + 4 + (version === 0 ? 2 : 4);
  for (const infe of readBoxes(b, entriesStart, iinf.end)) {
    if (infe.type !== "infe") continue;
    const v = b[infe.dataStart]!;
    if (v < 2) continue; // versions 0/1 have no item type (not used by AVIF/HEIC writers)
    let o = infe.dataStart + 4;
    const id = v === 2 ? u16be(b, o) : u32be(b, o);
    o += (v === 2 ? 2 : 4) + 2; // item id, protection index
    const itemType = ascii(b, o, 4);
    o += 4;
    if (itemType === "Exif") ids.add(id);
    if (itemType === "mime") {
      const name = cString(b, o, infe.end);
      const contentType = cString(b, name.next, infe.end);
      if (/xml|xmp/i.test(contentType.value)) ids.add(id);
    }
  }
  return ids;
}

/** Overwrites EXIF and XMP item data with zeros. Returns a copy; the input is left as is. */
export function blankHeifMetadata(input: Uint8Array): Uint8Array {
  const meta = metaBox(input);
  if (!meta) return input;
  const targets = metadataItemIds(input, meta);
  if (targets.size === 0) return input;
  const iloc = child(input, meta, "iloc", true);
  if (!iloc) return input;
  const idat = child(input, meta, "idat", true);
  const out = input.slice();
  const b = input;

  const version = b[iloc.dataStart]!;
  let o = iloc.dataStart + 4;
  const offsetSize = b[o]! >> 4;
  const lengthSize = b[o]! & 0x0f;
  const baseOffsetSize = b[o + 1]! >> 4;
  const indexSize = version === 1 || version === 2 ? b[o + 1]! & 0x0f : 0;
  o += 2;
  const itemCount = version < 2 ? u16be(b, o) : u32be(b, o);
  o += version < 2 ? 2 : 4;

  for (let i = 0; i < itemCount; i++) {
    const id = version < 2 ? u16be(b, o) : u32be(b, o);
    o += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = u16be(b, o) & 0x0f;
      o += 2;
    }
    o += 2; // data reference index
    const base = uintBe(b, o, baseOffsetSize);
    o += baseOffsetSize;
    const extents = u16be(b, o);
    o += 2;
    for (let e = 0; e < extents; e++) {
      o += indexSize;
      const offset = uintBe(b, o, offsetSize);
      o += offsetSize;
      const length = uintBe(b, o, lengthSize);
      o += lengthSize;
      if (o > iloc.end) throw new ImageParseError();
      if (!targets.has(id) || length === 0) continue;
      const origin = method === 1 ? (idat?.dataStart ?? -1) : method === 0 ? 0 : -1;
      if (origin < 0) continue;
      const from = origin + base + offset;
      if (from + length > out.length) throw new ImageParseError();
      out.fill(0, from, from + length);
    }
  }
  return out;
}

/** Display size: the largest `ispe` (the full image, not a grid tile), swapped by `irot`. */
export function heifDimensions(b: Uint8Array): { width: number; height: number } | null {
  const meta = metaBox(b);
  if (!meta) return null;
  const iprp = child(b, meta, "iprp", true);
  const ipco = iprp ? child(b, iprp, "ipco") : undefined;
  if (!ipco) return null;
  let best: { width: number; height: number } | null = null;
  let quarterTurns = 0;
  for (const prop of readBoxes(b, ipco.dataStart, ipco.end)) {
    if (prop.type === "ispe" && prop.dataStart + 12 <= prop.end) {
      const width = u32be(b, prop.dataStart + 4);
      const height = u32be(b, prop.dataStart + 8);
      if (!best || width * height > best.width * best.height) best = { width, height };
    }
    if (prop.type === "irot" && prop.dataStart < prop.end) quarterTurns = b[prop.dataStart]! & 3;
  }
  if (!best) return null;
  return quarterTurns % 2 === 1 ? { width: best.height, height: best.width } : best;
}

/** Brands from the `ftyp` box (major + compatible). */
export function heifBrands(b: Uint8Array): string[] {
  if (b.length < 16 || ascii(b, 4, 4) !== "ftyp") return [];
  const size = Math.min(u32be(b, 0), b.length);
  const brands = [ascii(b, 8, 4)];
  for (let o = 16; o + 4 <= size; o += 4) brands.push(ascii(b, o, 4));
  return brands;
}
