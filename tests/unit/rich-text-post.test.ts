import { getSchema } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { postTextExtensions } from "@/lib/rich-text-post-extensions";
import {
  emptyPostDoc,
  isSitePath,
  parseYouTubeUrl,
  postDocSchema,
  postReferences,
  readingMinutes,
  renderPostHtml,
  renderPostSegments,
  withEditorLabels,
  type PostDoc,
  type PostMedia,
} from "@/lib/rich-text-post";

const IMG = "0192f000-0000-7000-8000-00000000a001";
const HOME = "0192f000-0000-7000-8000-00000000b001";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const link = (text: string, href: string) => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }],
});

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why the marina" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See " },
        link("homes for sale", "/buy/marina"),
        { type: "text", text: ", our " },
        link("guide", "https://agency.example/areas/marina"),
        { type: "text", text: " and " },
        link("the land registry", "https://registry.example/rules"),
      ],
    },
    { type: "blockquote", content: [p("Walk to the beach in five minutes.")] },
    {
      type: "image",
      attrs: { mediaId: IMG, alt: null, caption: "The <promenade> at dusk", src: "/media/x.jpg" },
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [p("Type")] },
            { type: "tableHeader", content: [p("From")] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p("Studio")] },
            { type: "tableCell", attrs: { colspan: 1, align: "right" }, content: [p("AED 900k")] },
          ],
        },
      ],
    },
    { type: "propertyCard", attrs: { propertyId: HOME, label: "HD-0001 · Old name" } },
    { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ", start: 42, title: 'Tour "A"' } },
    { type: "ctaButton", attrs: { label: "Book a viewing", href: "/contact", variant: "primary" } },
    { type: "paragraph" },
  ],
};

const media = new Map<string, PostMedia>([
  [IMG, { url: "/media/a/promenade.jpg", width: 1600, height: 900, alt: "The promenade" }],
]);

describe("post rich text", () => {
  it("accepts quotes, tables, library images, videos, listing cards and buttons", () => {
    expect(postDocSchema.safeParse(doc).error?.issues ?? []).toEqual([]);
  });

  it("renders HTML pieces with the listing card between them", () => {
    const parsed = postDocSchema.parse(doc);
    const segments = renderPostSegments(parsed, { media, siteOrigin: "https://agency.example" });
    expect(segments.map((s) => s.kind)).toEqual(["html", "property", "html"]);
    expect(segments[1]).toEqual({ kind: "property", propertyId: HOME });

    const [first, , last] = segments as Array<{ kind: "html"; html: string }>;
    // Site paths and full links to the site stay in the tab; other sites open a new one.
    expect(first!.html).toContain('<a href="/buy/marina">homes for sale</a>');
    expect(first!.html).toContain('<a href="https://agency.example/areas/marina">guide</a>');
    expect(first!.html).toContain(
      '<a href="https://registry.example/rules" target="_blank" rel="noopener noreferrer">the land registry</a>',
    );
    expect(first!.html).toContain(
      "<blockquote><p>Walk to the beach in five minutes.</p></blockquote>",
    );
    // Library image: resized copies, the library's alt text when the post gives none.
    expect(first!.html).toContain(
      '<figure class="rt-figure"><img src="/media/a/promenade.jpg?w=1200&amp;q=75" srcset="/media/a/promenade.jpg?w=384&amp;q=75 384w',
    );
    expect(first!.html).toContain(
      'sizes="(min-width: 800px) 720px, 100vw" alt="The promenade" width="1600" height="900" loading="lazy" decoding="async"><figcaption>The &lt;promenade&gt; at dusk</figcaption></figure>',
    );
    expect(first!.html).toContain(
      '<div class="rt-table" tabindex="0"><table><tbody><tr><th scope="col">Type</th><th scope="col">From</th></tr><tr><td>Studio</td><td class="rt-align-right">AED 900k</td></tr></tbody></table></div>',
    );
    expect(last!.html).toBe(
      '<figure class="rt-video"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42" title="Tour &quot;A&quot;" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></figure>' +
        '<p class="rt-cta"><a class="rt-cta-link" href="/contact">Book a viewing</a></p>',
    );
  });

  it("stores one HTML string with listing cards as links, and leaves out what is gone", () => {
    const parsed = postDocSchema.parse(doc);
    const html = renderPostHtml(parsed, {
      media,
      properties: new Map([[HOME, { href: "/property/two-bed", title: "Two bed <sea view>" }]]),
    });
    expect(html).toContain(
      '<p class="rt-listing"><a href="/property/two-bed">Two bed &lt;sea view&gt;</a></p>',
    );
    // Without the site's address, a full link to it is treated like any other site.
    expect(html).toContain('href="https://agency.example/areas/marina" target="_blank"');

    const bare = renderPostHtml(parsed, { media: new Map() });
    expect(bare).not.toContain("rt-figure");
    expect(bare).not.toContain("rt-listing");
  });

  it("escapes button labels, alt text and captions", () => {
    const parsed = postDocSchema.parse({
      type: "doc",
      content: [
        { type: "ctaButton", attrs: { label: '<b onclick="x">Go</b>', href: "https://x.example" } },
        { type: "image", attrs: { mediaId: IMG, alt: '"><script>', caption: null } },
      ],
    });
    const html = renderPostHtml(parsed, { media });
    expect(html).toContain(
      '<a class="rt-cta-link" href="https://x.example" target="_blank" rel="noopener noreferrer">&lt;b onclick=&quot;x&quot;&gt;Go&lt;/b&gt;</a>',
    );
    expect(html).toContain('alt="&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain("<script");
  });

  it.each([
    ["a protocol-relative link", { type: "paragraph", content: [link("x", "//evil.example")] }],
    ["a backslash link", { type: "paragraph", content: [link("x", "/\\evil.example")] }],
    ["a script link", { type: "paragraph", content: [link("x", "javascript:alert(1)")] }],
    ["an image from elsewhere", { type: "image", attrs: { src: "https://x.example/a.png" } }],
    ["an image with a style", { type: "image", attrs: { mediaId: IMG, style: "x" } }],
    ["a bad video id", { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ&autoplay=1" } }],
    ["a script button", { type: "ctaButton", attrs: { label: "Go", href: "javascript:x" } }],
    ["an empty button", { type: "ctaButton", attrs: { label: " ", href: "/contact" } }],
    ["a listing card without an id", { type: "propertyCard", attrs: { propertyId: "abc" } }],
    [
      "an image in a table",
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [{ type: "image", attrs: { mediaId: IMG } }] }],
          },
        ],
      },
    ],
    ["a table in a quote", { type: "blockquote", content: [{ type: "table", content: [] }] }],
    [
      "a listing card in a list",
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "propertyCard", attrs: { propertyId: HOME } }],
          },
        ],
      },
    ],
    ["an iframe", { type: "iframe", attrs: { src: "https://x.example" } }],
  ])("refuses %s", (_, node) => {
    expect(postDocSchema.safeParse({ type: "doc", content: [node] }).success).toBe(false);
  });

  it("knows a site path when it sees one", () => {
    expect(isSitePath("/buy/marina?beds=2#map")).toBe(true);
    expect(isSitePath("/")).toBe(true);
    expect(isSitePath("//evil.example")).toBe(false);
    expect(isSitePath("/\\evil.example")).toBe(false);
    expect(isSitePath("/a b")).toBe(false);
    expect(isSitePath("buy")).toBe(false);
  });

  it("reads YouTube addresses", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toEqual({
      videoId: "dQw4w9WgXcQ",
      start: 90,
    });
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toEqual({
      videoId: "dQw4w9WgXcQ",
      start: 42,
    });
    expect(parseYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.videoId).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")?.start).toBeNull();
    expect(parseYouTubeUrl("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeUrl("not a link")).toBeNull();
  });

  it("works out reading time and what the post points at", () => {
    const words = (n: number): PostDoc => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "word ".repeat(n).trim() }] }],
    });
    expect(readingMinutes(words(450))).toBe(2);
    expect(readingMinutes(words(10))).toBe(1);
    expect(readingMinutes(null)).toBe(1);

    const parsed = postDocSchema.parse(doc);
    expect(postReferences(parsed)).toEqual({ mediaIds: [IMG], propertyIds: [HOME] });
    const labelled = withEditorLabels(parsed, {
      media: new Map([[IMG, "/media/a/promenade.jpg"]]),
      properties: new Map([[HOME, "HD-0001 · Two bed"]]),
    });
    const blocks = labelled.content!;
    expect(blocks.find((b) => b.type === "image")?.attrs).toMatchObject({
      src: "/media/a/promenade.jpg",
    });
    expect(blocks.find((b) => b.type === "propertyCard")?.attrs).toMatchObject({
      label: "HD-0001 · Two bed",
    });
  });

  it("accepts everything the editor can produce", () => {
    const schema = getSchema(postTextExtensions());
    expect(Object.keys(schema.nodes).sort()).toEqual([
      "blockquote",
      "bulletList",
      "ctaButton",
      "doc",
      "hardBreak",
      "heading",
      "image",
      "listItem",
      "orderedList",
      "paragraph",
      "propertyCard",
      "table",
      "tableCell",
      "tableHeader",
      "tableRow",
      "text",
      "youtube",
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "italic", "link"]);
    // The editor adds its default attributes (cell spans and widths, button variant...).
    for (const sample of [doc, emptyPostDoc()]) {
      const fromEditor = schema.nodeFromJSON(sample).toJSON();
      expect(postDocSchema.safeParse(fromEditor).error?.issues ?? []).toEqual([]);
    }
    // And the editor's own model refuses what the server refuses.
    expect(() =>
      schema
        .nodeFromJSON({
          type: "doc",
          content: [{ type: "blockquote", content: [{ type: "table", content: [] }] }],
        })
        .check(),
    ).toThrow();
  });
});
