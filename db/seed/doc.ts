import type { RichDoc } from "@/lib/rich-text";

/** Rich text for seed content: headings (h2), paragraphs and bullet lists. */
export const doc = (blocks: Array<{ h?: string; p?: string; list?: string[] }>): RichDoc => ({
  type: "doc",
  content: blocks.map((b) =>
    b.h
      ? {
          type: "heading" as const,
          attrs: { level: 2 as const },
          content: [{ type: "text" as const, text: b.h }],
        }
      : b.list
        ? {
            type: "bulletList" as const,
            content: b.list.map((item) => ({
              type: "listItem" as const,
              content: [
                { type: "paragraph" as const, content: [{ type: "text" as const, text: item }] },
              ],
            })),
          }
        : { type: "paragraph" as const, content: [{ type: "text" as const, text: b.p! }] },
  ),
});
