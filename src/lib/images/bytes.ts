/** Small byte readers shared by the image parsers. All bounds checks are the caller's job. */

export class ImageParseError extends Error {
  constructor(message = "The file looks damaged and could not be read.") {
    super(message);
    this.name = "ImageParseError";
  }
}

export const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
export const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
export const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
export const u32be = (b: Uint8Array, o: number) =>
  b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!);
export const u32le = (b: Uint8Array, o: number) =>
  b[o + 3]! * 0x1000000 + ((b[o + 2]! << 16) | (b[o + 1]! << 8) | b[o]!);

/** Big-endian unsigned integer of 0, 4 or 8 bytes (ISOBMFF size fields). */
export function uintBe(b: Uint8Array, o: number, size: number): number {
  if (size === 0) return 0;
  if (size === 2) return u16be(b, o);
  if (size === 4) return u32be(b, o);
  if (size === 8) return u32be(b, o) * 0x100000000 + u32be(b, o + 4);
  throw new ImageParseError();
}

export function ascii(b: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function startsWithAscii(b: Uint8Array, text: string, at = 0): boolean {
  if (b.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
