import { describe, expect, it } from "vitest";
import {
  areaGuideSeoTitle,
  fillPattern,
  listingSeoTitle,
  patternVariables,
  postSeoTitle,
  projectSeoTitle,
  siteTitleTemplate,
} from "@/features/seo/titles";

const listing = {
  title: "Sea-view flat with a terrace",
  beds: 2,
  purpose: "sale" as const,
  typeName: "Apartment",
  area: "Old Harbour",
  city: "Coastal City",
  price: 125_000_000,
  currency: "AED",
  decimals: 2,
  reference: "LT-1001",
  agency: "Haven & Dune",
};

describe("title patterns", () => {
  it("fills listing titles, with studios and prices", () => {
    const pattern = "%beds% bed %type% for %purpose% in %area%";
    expect(listingSeoTitle(pattern, listing)).toBe("2 bed Apartment for sale in Old Harbour");
    expect(listingSeoTitle(pattern, { ...listing, beds: 0 })).toBe(
      "Studio Apartment for sale in Old Harbour",
    );
    expect(listingSeoTitle("%type% · %price% · %reference%", listing)).toBe(
      "Apartment · AED 1.25M · LT-1001",
    );
    expect(
      listingSeoTitle("%beds%-bedroom %type% to %purpose%", {
        ...listing,
        beds: 0,
        purpose: "rent",
      }),
    ).toBe("Studio Apartment to rent");
  });

  it("falls back to the item's own name when a value is missing", () => {
    const pattern = "%beds% bed %type% for %purpose% in %area%";
    expect(listingSeoTitle(pattern, { ...listing, beds: null })).toBe(listing.title);
    expect(listingSeoTitle(pattern, { ...listing, area: null })).toBe(listing.title);
    expect(fillPattern("", {}, "Fallback")).toBe("Fallback");
    expect(fillPattern("  %a%   and  %b% ", { a: "One", b: "Two" }, "x")).toBe("One and Two");
  });

  it("fills project, area guide and post titles", () => {
    expect(
      projectSeoTitle("%project% by %developer% in %area%", {
        name: "Pier Seven",
        developer: "Dune Homes",
        area: "Old Harbour",
        agency: "Haven & Dune",
      }),
    ).toBe("Pier Seven by Dune Homes in Old Harbour");
    expect(
      projectSeoTitle("%project% by %developer%", {
        name: "Pier Seven",
        developer: null,
        area: null,
        agency: "A",
      }),
    ).toBe("Pier Seven");
    expect(
      areaGuideSeoTitle("Living in %area%: area guide", {
        title: "Old Harbour",
        area: "Old Harbour",
        city: null,
        agency: "A",
      }),
    ).toBe("Living in Old Harbour: area guide");
    expect(
      postSeoTitle("%title% | %category%", { title: "How to buy", category: null, agency: "A" }),
    ).toBe("How to buy");
    expect(patternVariables("%beds% bed %type%")).toEqual(["beds", "type"]);
  });

  it("turns the site pattern into a Next.js title template", () => {
    expect(siteTitleTemplate("%page% | %agency%", "Haven & Dune")).toBe("%s | Haven & Dune");
    expect(siteTitleTemplate("%agency% · %page% · %agency%", "H")).toBe("H · %s · H");
    expect(siteTitleTemplate("| %agency%", "H")).toBe("%s | H");
  });
});
