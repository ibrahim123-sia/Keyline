import { describe, expect, it } from "vitest";
import { seoChecklist, titlePixels } from "@/features/seo/checklist";
import { placeOf } from "@/features/seo/places";

const levels = (items: ReturnType<typeof seoChecklist>) =>
  Object.fromEntries(items.map((i) => [i.key, i.level]));

describe("SEO checklist", () => {
  it("checks title and description length", () => {
    const good = seoChecklist({
      title: "2 bed apartment for sale in Old Harbour | Haven & Dune",
      description:
        "Bright two-bedroom apartment with a sea view, a short walk from the metro and the beach, ready to move in.",
    });
    expect(levels(good)).toEqual({ title: "ok", description: "ok" });
    expect(levels(seoChecklist({ title: "W".repeat(60), description: "" }))).toEqual({
      title: "warn",
      description: "fail",
    });
    expect(levels(seoChecklist({ title: "", description: "x".repeat(200) }))).toEqual({
      title: "fail",
      description: "warn",
    });
    expect(titlePixels("Wi")).toBe(19);
  });

  it("adds the facts a screen knows", () => {
    const items = seoChecklist({
      title: "Living in Old Harbour: area guide",
      description:
        "Schools, beaches, cafés and what homes cost in Old Harbour, with listings to buy and rent.",
      h1: false,
      imagesWithoutAlt: 2,
      internalLinks: 0,
      words: 120,
      minWords: 300,
    });
    expect(levels(items)).toEqual({
      title: "ok",
      description: "ok",
      h1: "fail",
      alts: "warn",
      links: "warn",
      words: "warn",
    });
    expect(items.find((i) => i.key === "alts")?.hint).toBe("2 images without alt text.");
    expect(
      levels(
        seoChecklist({
          title: "A good long title",
          description: "",
          h1: true,
          imagesWithoutAlt: 0,
          internalLinks: 3,
          words: 400,
        }),
      ),
    ).toMatchObject({ h1: "ok", alts: "ok", links: "ok", words: "ok" });
  });

  it("finds the area and city of a listing's place", () => {
    const nodes = [
      { id: "c", parentId: null, name: "Coastal City", level: "city" },
      { id: "a", parentId: "c", name: "Old Harbour", level: "area" },
      { id: "b", parentId: "a", name: "Pier Tower", level: "building" },
    ];
    expect(placeOf(nodes, "b")).toEqual({ area: "Old Harbour", city: "Coastal City" });
    expect(placeOf(nodes, "c")).toEqual({ area: "Coastal City", city: "Coastal City" });
    expect(placeOf(nodes, null)).toEqual({ area: null, city: null });
  });
});
