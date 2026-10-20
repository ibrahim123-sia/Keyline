import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ImageParseError,
  readDimensions,
  sniffFormat,
  stripMetadata,
  type FileFormat,
} from "@/lib/images/inspect";
import { tiffOrientation } from "@/lib/images/strip";
import { svgDimensions, svgProblem } from "@/lib/images/svg";

const OWNER = "Probe Owner"; // written into EXIF IFD0 so we can look for it in the bytes
const exif = {
  IFD0: { Copyright: OWNER },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "25/1 4/1 50/1",
    GPSLongitudeRef: "E",
    GPSLongitude: "55/1 8/1 25/1",
  },
};
const xmp =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="25,4.83N"/></rdf:RDF></x:xmpmeta>';

/** A 40x30 photo with GPS, copyright, XMP, an ICC profile and EXIF orientation 6 (rotate 90). */
async function photo(
  format: "jpeg" | "png" | "webp" | "avif",
  options: { progressive?: boolean } = {},
) {
  const p = sharp({ create: { width: 40, height: 30, channels: 3, background: "#c96442" } })
    .withMetadata({ orientation: 6 })
    .withExifMerge(exif)
    .withXmp(xmp);
  const out =
    format === "jpeg" ? p.jpeg({ progressive: options.progressive ?? false }) : p.toFormat(format);
  return new Uint8Array(await out.toBuffer());
}

const bytesInclude = (b: Uint8Array, text: string) => Buffer.from(b).includes(Buffer.from(text));
const withJunk = (b: Uint8Array) => new Uint8Array([...b, ...Buffer.from("APPENDED-PAYLOAD")]);

async function decodes(b: Uint8Array) {
  const { info } = await sharp(b).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

describe("sniffFormat", () => {
  it("reads the real format from the bytes", async () => {
    for (const f of ["jpeg", "png", "webp", "avif"] as const) {
      expect(sniffFormat(await photo(f))).toBe(f);
    }
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer();
    expect(sniffFormat(gif)).toBe("gif");
    expect(sniffFormat(Buffer.from("%PDF-1.7\n%..."))).toBe("pdf");
    const heic = Buffer.alloc(24);
    heic.writeUInt32BE(24, 0);
    heic.write("ftypheic", 4, "latin1");
    expect(sniffFormat(heic)).toBe("heic");
    expect(
      sniffFormat(
        Buffer.from(
          '﻿<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"/>',
        ),
      ),
    ).toBe("svg");
    expect(sniffFormat(Buffer.from("<html><svg></svg></html>"))).toBe("unknown");
    expect(sniffFormat(Buffer.from("MZ\x90\x00 executable"))).toBe("unknown");
  });
});

describe("stripMetadata", () => {
  it("JPEG: drops GPS, XMP and appended data, keeps orientation and the colour profile", async () => {
    const input = withJunk(await photo("jpeg"));
    expect(bytesInclude(input, OWNER)).toBe(true);
    const before = await sharp(input).metadata();
    expect(before.exif && before.xmp && before.icc).toBeTruthy();

    const out = stripMetadata(input, "jpeg");
    expect(bytesInclude(out, OWNER)).toBe(false);
    expect(bytesInclude(out, "GPSLatitude")).toBe(false);
    expect(bytesInclude(out, "APPENDED-PAYLOAD")).toBe(false);
    const after = await sharp(out).metadata();
    expect(after.xmp).toBeUndefined();
    expect(after.icc?.length).toBe(before.icc?.length);
    expect(after.orientation).toBe(6);
    expect(tiffOrientation(new Uint8Array(after.exif!).subarray(6))).toBe(6);
    expect(after.exif!.length).toBeLessThan(40);
    expect(await decodes(out)).toEqual({ width: 40, height: 30 });
    // Displayed upright: orientation 6 swaps the sides.
    expect(readDimensions(out, "jpeg")).toEqual({ width: 30, height: 40 });
  });

  it("JPEG: progressive files with several scans survive intact", async () => {
    const input = withJunk(await photo("jpeg", { progressive: true }));
    const out = stripMetadata(input, "jpeg");
    expect(bytesInclude(out, "APPENDED-PAYLOAD")).toBe(false);
    expect(bytesInclude(out, OWNER)).toBe(false);
    expect(await decodes(out)).toEqual({ width: 40, height: 30 });
    const original = await sharp(input).raw().toBuffer();
    expect(Buffer.compare(await sharp(out).raw().toBuffer(), original)).toBe(0); // lossless
  });

  it("JPEG: refuses a broken file instead of keeping its metadata", () => {
    expect(() =>
      stripMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "jpeg"),
    ).toThrow(ImageParseError);
  });

  it.each(["png", "webp"] as const)(
    "%s: drops EXIF and XMP, still decodes the same pixels",
    async (f) => {
      const input = withJunk(await photo(f));
      const before = await sharp(input).metadata();
      expect(before.exif && before.xmp).toBeTruthy();
      const out = stripMetadata(input, f);
      expect(bytesInclude(out, OWNER)).toBe(false);
      expect(bytesInclude(out, "APPENDED-PAYLOAD")).toBe(false);
      const after = await sharp(out).metadata();
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      expect(after.icc?.length).toBe(before.icc?.length);
      const original = await sharp(input).raw().toBuffer();
      expect(Buffer.compare(await sharp(out).raw().toBuffer(), original)).toBe(0);
    },
  );

  it("AVIF: blanks the EXIF and XMP items in place", async () => {
    const input = await photo("avif");
    expect(bytesInclude(input, OWNER)).toBe(true);
    const out = stripMetadata(input, "avif");
    expect(out.length).toBe(input.length);
    expect(bytesInclude(out, OWNER)).toBe(false);
    expect(bytesInclude(out, "GPSLatitude")).toBe(false);
    expect(await decodes(out)).toEqual(await decodes(input));
    // Orientation 6 is stored as an `irot` box; decoders apply it, so both read 30x40.
    expect(readDimensions(out, "avif")).toEqual({ width: 30, height: 40 });
    expect(await decodes(out)).toEqual({ width: 30, height: 40 });
  });

  it("GIF: drops comments, XMP application blocks and appended data, keeps looping", async () => {
    const gif = new Uint8Array(
      await sharp({ create: { width: 3, height: 2, channels: 3, background: "#123456" } })
        .gif({ loop: 0 })
        .toBuffer(),
    );
    expect(gif.at(-1)).toBe(0x3b);
    const comment = [0x21, 0xfe, 5, ...Buffer.from("hello"), 0];
    const xmpBlock = [0x21, 0xff, 11, ...Buffer.from("XMP DataXMP"), 3, ...Buffer.from("abc"), 0];
    const input = new Uint8Array([
      ...gif.subarray(0, -1),
      ...comment,
      ...xmpBlock,
      0x3b,
      ...Buffer.from("APPENDED-PAYLOAD"),
    ]);
    const out = stripMetadata(input, "gif");
    expect(bytesInclude(out, "hello")).toBe(false);
    expect(bytesInclude(out, "XMP DataXMP")).toBe(false);
    expect(bytesInclude(out, "APPENDED-PAYLOAD")).toBe(false);
    expect(bytesInclude(out, "NETSCAPE2.0")).toBe(bytesInclude(gif, "NETSCAPE2.0"));
    expect(await decodes(out)).toEqual({ width: 3, height: 2 });
  });
});

describe("readDimensions", () => {
  it.each<[FileFormat, { width: number; height: number }]>([
    ["png", { width: 40, height: 30 }],
    ["webp", { width: 40, height: 30 }],
  ])("%s", async (f, size) => {
    expect(readDimensions(await photo(f as "png" | "webp"))).toEqual(size);
  });

  it("measures lossless WebP and plain GIF", async () => {
    const base = () =>
      sharp({ create: { width: 17, height: 9, channels: 4, background: "#00000080" } });
    expect(readDimensions(await base().webp({ lossless: true }).toBuffer())).toEqual({
      width: 17,
      height: 9,
    });
    expect(readDimensions(await base().gif().toBuffer())).toEqual({ width: 17, height: 9 });
  });
});

describe("SVG", () => {
  it("accepts plain drawings and reads their size", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40"><use href="#a"/><path d="M0 0h10"/></svg>',
    );
    expect(svgProblem(svg)).toBeNull();
    expect(svgDimensions(svg)).toEqual({ width: 120, height: 40 });
    expect(svgDimensions(Buffer.from('<svg width="64px" height="32" viewBox="0 0 1 1"/>'))).toEqual(
      {
        width: 64,
        height: 32,
      },
    );
  });

  it.each([
    ["<svg><script>alert(1)</script></svg>", "scripts"],
    ['<svg onload="alert(1)"></svg>', "event handlers"],
    ["<svg><foreignObject><div/></foreignObject></svg>", "embedded HTML"],
    ['<svg><a href="javascript:alert(1)">x</a></svg>', "script links"],
    ['<svg><image href="https://tracker.example/p.png"/></svg>', "links to other sites"],
    ["<svg><style>@import url(x.css)</style></svg>", "style imports"],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>', "entity declarations"],
    ['<svg><set attributeName="href" to="javascript:1"/></svg>', "active elements"],
  ])("refuses %s", (svg, reason) => {
    expect(svgProblem(Buffer.from(svg))).toContain(reason);
  });
});
