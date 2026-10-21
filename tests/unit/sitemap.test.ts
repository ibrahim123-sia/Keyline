import { describe, expect, it } from "vitest";
import { landingIndexable } from "@/features/seo/landing";
import {
  SITEMAP_CHUNK,
  canonicalElsewhere,
  parseSitemapFile,
  sectionFiles,
  sitemapIndexXml,
  urlsetXml,
} from "@/features/seo/sitemap";

const origin = "https://agency.example";

describe("sitemap helpers", () => {
  it("leaves out items whose canonical is another address", () => {
    expect(canonicalElsewhere(null, "/property/a", origin)).toBe(false);
    expect(canonicalElsewhere("/property/a", "/property/a", origin)).toBe(false);
    expect(canonicalElsewhere("https://agency.example/property/a/", "/property/a", origin)).toBe(
      false,
    );
    expect(canonicalElsewhere("/property/b", "/property/a", origin)).toBe(true);
    expect(canonicalElsewhere("https://portal.example/x", "/property/a", origin)).toBe(true);
  });

  it("names and parses section files", () => {
    expect(sectionFiles("properties", 0)).toEqual(["properties.xml"]);
    expect(sectionFiles("properties", SITEMAP_CHUNK + 1)).toEqual([
      "properties.xml",
      "properties-2.xml",
    ]);
    expect(parseSitemapFile("properties.xml")).toEqual({ section: "properties", chunk: 1 });
    expect(parseSitemapFile("properties-2.xml")).toEqual({ section: "properties", chunk: 2 });
    expect(parseSitemapFile("properties-1.xml")).toBeNull();
    expect(parseSitemapFile("secrets.xml")).toBeNull();
    expect(parseSitemapFile("pages.json")).toBeNull();
  });

  it("writes valid, escaped XML", () => {
    const xml = urlsetXml(
      [
        { path: "/property/a&b", lastModified: "2026-10-01T00:00:00.000Z" },
        { path: "/", lastModified: null },
      ],
      origin,
    );
    expect(xml).toContain("<loc>https://agency.example/property/a&amp;b</loc>");
    expect(xml).toContain("<lastmod>2026-10-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<url><loc>https://agency.example/</loc></url>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const index = sitemapIndexXml([{ file: "pages.xml", lastModified: null }], origin);
    expect(index).toContain(
      "<sitemap><loc>https://agency.example/sitemaps/pages.xml</loc></sitemap>",
    );
  });
});

describe("landing pages", () => {
  const rules = { thinPageMinListings: 3, landingTypeMinListings: 5 };
  it("indexes area pages from the thin-page minimum and type pages from their own", () => {
    expect(landingIndexable("area", 2, rules)).toBe(false);
    expect(landingIndexable("area", 3, rules)).toBe(true);
    expect(landingIndexable("type", 4, rules)).toBe(false);
    expect(landingIndexable("type", 5, rules)).toBe(true);
    expect(landingIndexable("hub", 0, { ...rules, thinPageMinListings: 0 })).toBe(true);
  });
});
