import { describe, expect, it } from "vitest";
import { pageHeadings, withHeadingIds } from "@/features/cms/headings";
import { pageSettingsSchema, pageSlugSchema } from "@/features/cms/page-schema";
import { sectionProblems, starterSection } from "@/features/cms/section-rules";
import {
  parseSection,
  sectionInputSchema,
  sectionMediaIds,
  sectionTypes,
  type Section,
} from "@/features/cms/sections";
import { renderRichText } from "@/lib/rich-text";

const ID = "0192f000-0000-7000-8000-00000000abcd";

function parsed(raw: unknown): Section {
  const s = parseSection(raw);
  if (!s) throw new Error("did not parse");
  return s;
}

const heading = (text: string) => ({
  type: "heading" as const,
  attrs: { level: 2 as const },
  content: [{ type: "text" as const, text }],
});

describe("page builder sections", () => {
  it("every section type starts valid, with empty content and no invented copy", () => {
    const schema = sectionInputSchema();
    for (const type of sectionTypes) {
      const s = starterSection(type);
      expect(schema.safeParse(s).success, type).toBe(true);
      expect(s.id).toMatch(/^s[0-9a-z]+$/);
    }
    expect(starterSection("cta").props.heading).toBe("");
    expect(starterSection("hero_simple", "About us").props.heading).toBe("About us");
    expect(new Set(sectionTypes.map(() => starterSection("text").id)).size).toBe(
      sectionTypes.length,
    );
  });

  it("keeps the hidden flag and fills defaults of the new types", () => {
    expect(parsed({ id: "a", type: "faq", props: {}, hidden: true })).toMatchObject({
      hidden: true,
      props: { source: "group", group: "general", count: 8, schema: true },
    });
    expect(parsed({ id: "a", type: "divider", props: {} }).hidden).toBeUndefined();
    expect(parsed({ id: "a", type: "featured_listings", props: {} }).props).toMatchObject({
      layout: "grid",
    });
  });

  it("only plays real video links", () => {
    const ok = (url: string) => parseSection({ id: "v", type: "video", props: { url } }) !== null;
    expect(ok("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(ok("https://vimeo.com/123456")).toBe(true);
    expect(ok("https://cdn.example.com/tour.mp4")).toBe(true);
    expect(ok("http://cdn.example.com/tour.mp4")).toBe(false);
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("https://example.com/page")).toBe(false);
  });

  it("says what is missing before a page can be published", () => {
    expect(sectionProblems(parsed({ id: "h", type: "hero_simple", props: {} }))).toEqual([
      { field: "props.heading", message: "Add the heading." },
    ]);
    expect(
      sectionProblems(
        parsed({ id: "g", type: "gallery", props: {}, style: { background: "image" } }),
      ).map((p) => p.field),
    ).toEqual(["props.images", "style.backgroundImageId"]);
    expect(
      sectionProblems(
        parsed({
          id: "s",
          type: "stats",
          props: { items: [{ value: "120", label: "", source: "" }] },
        }),
      ).map((p) => p.field),
    ).toEqual(["props.items.0.label"]);
    expect(
      sectionProblems(parsed({ id: "f", type: "faq", props: { source: "manual" } }))[0]?.field,
    ).toBe("props.faqIds");
    expect(sectionProblems(parsed({ id: "d", type: "divider", props: {} }))).toEqual([]);
  });

  it("finds the images a section uses", () => {
    expect(
      sectionMediaIds({
        type: "gallery",
        props: { images: [{ mediaId: ID }, { mediaId: "not-an-id" }] },
        style: { backgroundImageId: ID },
      }),
    ).toEqual([ID, ID]);
    expect(sectionMediaIds({ type: "video", props: { posterId: ID } })).toEqual([ID]);
  });

  it("refuses addresses the site uses, and unsafe canonical links", () => {
    expect(pageSlugSchema.safeParse("About-Us").data).toBe("about-us");
    expect(pageSlugSchema.safeParse("buy").success).toBe(false);
    expect(pageSlugSchema.safeParse("a--b").success).toBe(false);
    const base = {
      title: "About",
      slug: "about",
      template: "default",
      seoTitle: null,
      seoDescription: null,
      ogImageId: null,
      noindex: false,
    };
    expect(pageSettingsSchema.safeParse({ ...base, canonicalUrl: "/about" }).success).toBe(true);
    expect(
      pageSettingsSchema.safeParse({ ...base, canonicalUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("gives h2 headings ids that are unique on the page, for anchors and the contents", () => {
    const sections = [
      parsed({
        id: "a",
        type: "text",
        props: { body: { type: "doc", content: [heading("Cookies"), heading("Your rights")] } },
      }),
      parsed({
        id: "b",
        type: "text",
        props: { body: { type: "doc", content: [heading("Cookies")] } },
      }),
    ];
    const { toc, bySection } = pageHeadings(sections);
    expect(toc).toEqual([
      { id: "cookies", text: "Cookies" },
      { id: "your-rights", text: "Your rights" },
      { id: "cookies-2", text: "Cookies" },
    ]);
    const html = renderRichText((sections[0] as Extract<Section, { type: "text" }>).props.body);
    expect(withHeadingIds(html, bySection.get("a"))).toBe(
      '<h2 id="cookies">Cookies</h2><h2 id="your-rights">Your rights</h2>',
    );
    expect(withHeadingIds('<h2 id="x" class="y">A</h2>', ["a"])).toBe(
      '<h2 id="a" class="y">A</h2>',
    );
  });
});

describe("section links", () => {
  it("accepts paths, anchors, full links, mailto and tel, and nothing that runs code", () => {
    const ok = (href: string) =>
      parseSection({ id: "c", type: "cta", props: { buttons: [{ label: "Go", href }] } }) !== null;
    for (const href of [
      "/contact",
      "#valuation",
      "https://wa.me/971500000000",
      "tel:+97140000000",
      "mailto:hello@agency.example",
    ])
      expect(ok(href), href).toBe(true);
    for (const href of ["javascript:alert(1)", "data:text/html,x", "#Bad Anchor", "ftp://x"])
      expect(ok(href), href).toBe(false);
  });
});
