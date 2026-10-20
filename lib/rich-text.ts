import { z } from "zod";

/**
 * Rich text for descriptions (07 §3.7, 14 §2 "rich text sanitized"). The editor stores a
 * Tiptap JSON document; the server checks it against this allowlist and renders HTML from it.
 * Nothing the browser sends is ever used as HTML, so there is nothing to sanitise afterwards.
 */

const MAX_TEXT = 20_000;
const MAX_NODES = 2_000;

/** http(s), mailto and tel only: no javascript:, data: or relative links. */
const SAFE_HREF = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[\d\s().-]+)$/i;

export const isSafeHref = (href: string): boolean => SAFE_HREF.test(href);

const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: z
            .string()
            .max(2000)
            .regex(SAFE_HREF, "Links must start with https://, mailto: or tel:"),
          // Set by the editor; ignored when rendering (we decide target and rel).
          target: z.string().nullable().optional(),
          rel: z.string().nullable().optional(),
          class: z.string().nullable().optional(),
          title: z.string().nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const textNode = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(MAX_TEXT),
    marks: z.array(markSchema).max(3).optional(),
  })
  .strict();
const hardBreak = z.object({ type: z.literal("hardBreak") }).strict();
const inline = z.union([textNode, hardBreak]);

const paragraph = z
  .object({ type: z.literal("paragraph"), content: z.array(inline).max(500).optional() })
  .strict();
const heading = z
  .object({
    type: z.literal("heading"),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
    content: z.array(inline).max(200).optional(),
  })
  .strict();

type ListNode = {
  type: "bulletList" | "orderedList";
  attrs?: { start?: number; type?: string | null };
  content: Array<{ type: "listItem"; content: Array<z.infer<typeof paragraph> | ListNode> }>;
};
const list: z.ZodType<ListNode> = z.lazy(() =>
  z
    .object({
      type: z.enum(["bulletList", "orderedList"]),
      attrs: z
        .object({
          start: z.number().int().min(1).max(10_000).optional(),
          type: z.string().nullable().optional(),
        })
        .strict()
        .optional(),
      content: z
        .array(
          z
            .object({
              type: z.literal("listItem"),
              content: z
                .array(z.union([paragraph, list]))
                .min(1)
                .max(50),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
);

const block = z.union([paragraph, heading, list]);

export const richDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(block).max(500).optional() })
  .strict()
  .superRefine((doc, ctx) => {
    let nodes = 0;
    const walk = (n: unknown) => {
      nodes++;
      const content = (n as { content?: unknown[] }).content;
      if (Array.isArray(content)) content.forEach(walk);
    };
    walk(doc);
    if (nodes > MAX_NODES) ctx.addIssue({ code: "custom", message: "The text is too long." });
  });

export type RichDoc = z.infer<typeof richDocSchema>;
type Inline = z.infer<typeof inline>;
type Block = z.infer<typeof block>;

export const emptyDoc = (): RichDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function renderInline(nodes: Inline[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "<br>";
      let html = escapeHtml(n.text);
      // Fixed nesting order so equal documents always give equal HTML.
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "italic")) html = `<em>${html}</em>`;
      if (marks.some((m) => m.type === "bold")) html = `<strong>${html}</strong>`;
      const link = marks.find((m) => m.type === "link");
      if (link && link.type === "link" && SAFE_HREF.test(link.attrs.href)) {
        const external = /^https?:/i.test(link.attrs.href);
        html = `<a href="${escapeHtml(link.attrs.href)}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${html}</a>`;
      }
      return html;
    })
    .join("");
}

function renderBlock(node: Block): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.content)}</p>`;
    case "heading":
      return `<h${node.attrs.level}>${renderInline(node.content)}</h${node.attrs.level}>`;
    case "bulletList":
    case "orderedList": {
      const tag = node.type === "bulletList" ? "ul" : "ol";
      const start =
        node.type === "orderedList" && node.attrs?.start && node.attrs.start !== 1
          ? ` start="${node.attrs.start}"`
          : "";
      const items = node.content
        .map((li) => `<li>${li.content.map((c) => renderBlock(c as Block)).join("")}</li>`)
        .join("");
      return `<${tag}${start}>${items}</${tag}>`;
    }
  }
}

/** HTML for a validated document. Empty paragraphs are dropped. */
export function renderRichText(doc: RichDoc | null | undefined): string {
  if (!doc?.content) return "";
  return doc.content
    .map((b) => renderBlock(b))
    .filter((html) => html !== "<p></p>")
    .join("");
}

/** Plain text (for word counts, search and meta description fallbacks). */
export function richTextToPlain(doc: RichDoc | null | undefined): string {
  if (!doc?.content) return "";
  const parts: string[] = [];
  const walk = (n: { type: string; text?: string; content?: unknown[] }) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    if (n.type === "hardBreak") parts.push(" ");
    n.content?.forEach((c) => walk(c as never));
    if (["paragraph", "heading", "listItem"].includes(n.type)) parts.push("\n");
  };
  walk(doc as never);
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function wordCount(doc: RichDoc | null | undefined): number {
  const text = richTextToPlain(doc);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}
