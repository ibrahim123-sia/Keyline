import { getSchema } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  emptyDoc,
  renderRichText,
  richDocSchema,
  richTextToPlain,
  wordCount,
} from "@/lib/rich-text";
import { richTextExtensions } from "@/lib/rich-text-extensions";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Living here" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bright " },
        { type: "text", text: "corner", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "text", text: " unit, see " },
        {
          type: "text",
          text: "the floor plan",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://agency.example/plan",
                target: "_blank",
                rel: null,
                class: null,
              },
            },
          ],
        },
        { type: "hardBreak" },
        { type: "text", text: "Call " },
        {
          type: "text",
          text: "us",
          marks: [{ type: "link", attrs: { href: "tel:+44 20 7946 0000" } }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Sea view" }] }],
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Two pools" }] },
            {
              type: "orderedList",
              attrs: { start: 3 },
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Kids" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: "paragraph" },
  ],
};

describe("rich text", () => {
  it("accepts the allowed nodes and renders clean HTML", () => {
    const parsed = richDocSchema.parse(doc);
    expect(renderRichText(parsed)).toBe(
      "<h2>Living here</h2>" +
        '<p>Bright <strong><em>corner</em></strong> unit, see <a href="https://agency.example/plan" target="_blank" rel="noopener noreferrer nofollow">the floor plan</a><br>Call <a href="tel:+44 20 7946 0000">us</a></p>' +
        '<ul><li><p>Sea view</p></li><li><p>Two pools</p><ol start="3"><li><p>Kids</p></li></ol></li></ul>',
    );
  });

  it("escapes text, so markup typed into the editor stays text", () => {
    const parsed = richDocSchema.parse({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: '<img src=x onerror="alert(1)">&' }] },
      ],
    });
    expect(renderRichText(parsed)).toBe(
      "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;</p>",
    );
  });

  it.each([
    ["a script link", { type: "link", attrs: { href: "javascript:alert(1)" } }],
    ["a data link", { type: "link", attrs: { href: "data:text/html,<b>x</b>" } }],
    ["a relative link", { type: "link", attrs: { href: "/admin" } }],
    ["an unknown mark", { type: "underline" }],
    [
      "extra attributes",
      { type: "link", attrs: { href: "https://x.example", style: "color:red" } },
    ],
  ])("refuses %s", (_, mark) => {
    const bad = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [mark] }] }],
    };
    expect(richDocSchema.safeParse(bad).success).toBe(false);
  });

  it.each([
    ["an image", { type: "image", attrs: { src: "https://x.example/a.png" } }],
    ["a code block", { type: "codeBlock", content: [{ type: "text", text: "x" }] }],
    ["a top-level heading", { type: "heading", attrs: { level: 1 }, content: [] }],
    ["raw HTML", { type: "html", content: "<script>alert(1)</script>" }],
  ])("refuses %s", (_, node) => {
    expect(richDocSchema.safeParse({ type: "doc", content: [node] }).success).toBe(false);
  });

  it("gives plain text and a word count", () => {
    const parsed = richDocSchema.parse(doc);
    expect(richTextToPlain(parsed)).toBe(
      "Living here\nBright corner unit, see the floor plan Call us\nSea view\nTwo pools\nKids",
    );
    expect(wordCount(parsed)).toBe(16);
    expect(wordCount(null)).toBe(0);
  });

  it("accepts everything the editor can produce", () => {
    const schema = getSchema(richTextExtensions());
    expect(Object.keys(schema.nodes).sort()).toEqual([
      "bulletList",
      "doc",
      "hardBreak",
      "heading",
      "listItem",
      "orderedList",
      "paragraph",
      "text",
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "italic", "link"]);
    // The editor adds its default attributes (link target and rel, list start and type).
    for (const sample of [doc, emptyDoc()]) {
      const fromEditor = schema.nodeFromJSON(sample).toJSON();
      expect(richDocSchema.safeParse(fromEditor).error?.issues ?? []).toEqual([]);
    }
  });
});
