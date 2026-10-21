import { z } from "zod";

/**
 * Rich text for descriptions (07 §3.7, 14 §2 "rich text sanitized"). The editor stores a
 * Tiptap JSON document; the server checks it against this allowlist and renders HTML from it.
 * Nothing the browser sends is ever used as HTML, so there is nothing to sanitise afterwards.
 * Posts and area guides use a larger profile built from the same grammar (lib/rich-text-post.ts).
 */

const MAX_TEXT = 20_000;
const MAX_NODES = 2_000;

/** http(s), mailto and tel only: no javascript:, data: or relative links. */
const SAFE_HREF = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:\+?[\d\s().-]+)$/i;

export const isSafeHref = (href: string): boolean => SAFE_HREF.test(href);

export type RichMark =
  | { type: "bold" }
  | { type: "italic" }
  | {
      type: "link";
      attrs: {
        href: string;
        target?: string | null;
        rel?: string | null;
        class?: string | null;
        title?: string | null;
      };
    };
export type RichInline = { type: "text"; text: string; marks?: RichMark[] } | { type: "hardBreak" };
export type RichParagraph = { type: "paragraph"; content?: RichInline[] };
export type RichHeading = { type: "heading"; attrs: { level: 2 | 3 }; content?: RichInline[] };
export type RichList = {
  type: "bulletList" | "orderedList";
  attrs?: { start?: number; type?: string | null };
  content: Array<{ type: "listItem"; content: Array<RichParagraph | RichList> }>;
};
export type RichBlock = RichParagraph | RichHeading | RichList;

/** Which links a profile accepts, and how they render. */
export type LinkRules = {
  allows: (href: string) => boolean;
  message: string;
  /** Links that stay on the site: same tab, no rel. */
  isInternal: (href: string) => boolean;
  /** rel for links to other sites (they open in a new tab). */
  externalRel: string;
};

/** Descriptions: absolute links only; links to other sites get nofollow. */
const descriptionLinks: LinkRules = {
  allows: isSafeHref,
  message: "Links must start with https://, mailto: or tel:",
  isInternal: () => false,
  externalRel: "noopener noreferrer nofollow",
};

/** Text with bold, italic and links; paragraphs, headings (2 and 3) and nested lists. */
export function richTextGrammar(links: LinkRules) {
  const mark: z.ZodType<RichMark> = z.discriminatedUnion("type", [
    z.object({ type: z.literal("bold") }).strict(),
    z.object({ type: z.literal("italic") }).strict(),
    z
      .object({
        type: z.literal("link"),
        attrs: z
          .object({
            href: z.string().max(2000).refine(links.allows, links.message),
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

  const text = z
    .object({
      type: z.literal("text"),
      text: z.string().min(1).max(MAX_TEXT),
      marks: z.array(mark).max(3).optional(),
    })
    .strict();
  const hardBreak = z.object({ type: z.literal("hardBreak") }).strict();
  const inline: z.ZodType<RichInline> = z.union([text, hardBreak]);

  const paragraph: z.ZodType<RichParagraph> = z
    .object({ type: z.literal("paragraph"), content: z.array(inline).max(500).optional() })
    .strict();
  const heading: z.ZodType<RichHeading> = z
    .object({
      type: z.literal("heading"),
      attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
      content: z.array(inline).max(200).optional(),
    })
    .strict();

  const list: z.ZodType<RichList> = z.lazy(() =>
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

  const block: z.ZodType<RichBlock> = z.union([paragraph, heading, list]);
  return { inline, paragraph, heading, list, block };
}

/** Every node in a document, so it cannot be made huge out of many small pieces. */
export function nodeCount(node: unknown): number {
  const content = (node as { content?: unknown[] }).content;
  return 1 + (Array.isArray(content) ? content.reduce<number>((n, c) => n + nodeCount(c), 0) : 0);
}

const description = richTextGrammar(descriptionLinks);

export const richDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(description.block).max(500).optional() })
  .strict()
  .superRefine((doc, ctx) => {
    if (nodeCount(doc) > MAX_NODES)
      ctx.addIssue({ code: "custom", message: "The text is too long." });
  });

export type RichDoc = z.infer<typeof richDocSchema>;

export const emptyDoc = (): RichDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The opening tag of a link under these rules, or null when the address is not allowed. */
export function linkOpenTag(href: string, links: LinkRules, className?: string): string | null {
  if (!links.allows(href)) return null;
  const external = !links.isInternal(href) && /^https?:/i.test(href);
  return (
    `<a${className ? ` class="${escapeHtml(className)}"` : ""} href="${escapeHtml(href)}"` +
    `${external ? ` target="_blank" rel="${links.externalRel}"` : ""}>`
  );
}

export function renderInline(
  nodes: RichInline[] | undefined,
  links: LinkRules = descriptionLinks,
): string {
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
      const open = link?.type === "link" ? linkOpenTag(link.attrs.href, links) : null;
      if (open) html = `${open}${html}</a>`;
      return html;
    })
    .join("");
}

export function renderBlock(node: RichBlock, links: LinkRules = descriptionLinks): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.content, links)}</p>`;
    case "heading":
      return `<h${node.attrs.level}>${renderInline(node.content, links)}</h${node.attrs.level}>`;
    case "bulletList":
    case "orderedList": {
      const tag = node.type === "bulletList" ? "ul" : "ol";
      const start =
        node.type === "orderedList" && node.attrs?.start && node.attrs.start !== 1
          ? ` start="${node.attrs.start}"`
          : "";
      const items = node.content
        .map((li) => `<li>${li.content.map((c) => renderBlock(c, links)).join("")}</li>`)
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

type AnyDoc = { type: "doc"; content?: readonly unknown[] } | null | undefined;

/** Plain text (for word counts, search and meta description fallbacks). Any profile. */
export function richTextToPlain(doc: AnyDoc): string {
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

export function wordCount(doc: AnyDoc): number {
  const text = richTextToPlain(doc);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}
