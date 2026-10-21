import { z } from "zod";
import { mediaSrcSet, mediaVariant } from "./media-src";
import {
  escapeHtml,
  isSafeHref,
  linkOpenTag,
  nodeCount,
  renderBlock,
  renderInline,
  richTextGrammar,
  wordCount,
  type LinkRules,
} from "./rich-text";

/**
 * Rich text for blog posts and area guides (08 §3-4): everything descriptions have, plus
 * quotes, tables, library images, YouTube videos, listing cards (by reference, so price and
 * status stay current) and call-to-action buttons. Same rule as lib/rich-text.ts: the server
 * checks the editor's JSON against this allowlist and builds every tag itself.
 */

const MAX_NODES = 8_000;

/** A path on this site ("/buy/marina"): one leading slash, no backslashes, quotes or spaces. */
const SITE_PATH = /^\/(?![/\\])[^\s<>"'\\]*$/;

export const isSitePath = (href: string): boolean => SITE_PATH.test(href);
export const isPostHref = (href: string): boolean => isSafeHref(href) || isSitePath(href);

/** Posts link to the site's own pages too; those stay in the tab and are followed. */
export function postLinkRules(siteOrigin?: string): LinkRules {
  const origin = siteOrigin?.replace(/\/+$/, "").toLowerCase();
  return {
    allows: isPostHref,
    message: "Links must start with https://, mailto:, tel: or / (a page on this site)",
    isInternal: (href) => {
      if (isSitePath(href)) return true;
      const h = href.toLowerCase();
      return !!origin && (h === origin || h.startsWith(`${origin}/`));
    },
    externalRel: "noopener noreferrer",
  };
}

const g = richTextGrammar(postLinkRules());

const blockquote = z
  .object({ type: z.literal("blockquote"), content: z.array(g.paragraph).min(1).max(50) })
  .strict();

const cellAligns = ["left", "center", "right", "justify"] as const;

const cell = z
  .object({
    type: z.enum(["tableHeader", "tableCell"]),
    attrs: z
      .object({
        colspan: z.number().int().min(1).max(20).optional(),
        rowspan: z.number().int().min(1).max(50).optional(),
        // Column widths from resizing; resizing is off and the site never uses them.
        colwidth: z.array(z.number().int().min(0).max(5000)).max(20).nullable().optional(),
        align: z.enum(cellAligns).nullable().optional(),
      })
      .strict()
      .optional(),
    content: z.array(g.paragraph).min(1).max(20),
  })
  .strict();

const table = z
  .object({
    type: z.literal("table"),
    content: z
      .array(
        z.object({ type: z.literal("tableRow"), content: z.array(cell).min(1).max(20) }).strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const image = z
  .object({
    type: z.literal("image"),
    attrs: z
      .object({
        mediaId: z.uuid(),
        alt: z.string().max(300).nullable().optional(),
        caption: z.string().max(300).nullable().optional(),
        /** For the editor only: set by the server from the library, never rendered. */
        src: z.string().max(2000).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const youtube = z
  .object({
    type: z.literal("youtube"),
    attrs: z
      .object({
        videoId: z.string().regex(YOUTUBE_ID, "This is not a YouTube video address."),
        start: z.number().int().min(0).max(86_400).nullable().optional(),
        title: z.string().max(200).nullable().optional(),
      })
      .strict(),
  })
  .strict();

const propertyCard = z
  .object({
    type: z.literal("propertyCard"),
    attrs: z
      .object({
        propertyId: z.uuid(),
        /** For the editor only ("REF · title"): refreshed from the listing on save. */
        label: z.string().max(300).nullable().optional(),
      })
      .strict(),
  })
  .strict();

const ctaButton = z
  .object({
    type: z.literal("ctaButton"),
    attrs: z
      .object({
        label: z.string().trim().min(1, "Give the button a label.").max(80),
        href: z
          .string()
          .trim()
          .max(2000)
          .refine(isPostHref, "Button links must start with https://, mailto:, tel: or /"),
        variant: z.enum(["primary", "secondary"]).nullable().optional(),
      })
      .strict(),
  })
  .strict();

const postBlock = z.union([
  g.paragraph,
  g.heading,
  g.list,
  blockquote,
  table,
  image,
  youtube,
  propertyCard,
  ctaButton,
]);

export const postDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(postBlock).max(2000).optional() })
  .strict()
  .superRefine((doc, ctx) => {
    if (nodeCount(doc) > MAX_NODES)
      ctx.addIssue({ code: "custom", message: "The text is too long." });
  });

export type PostDoc = z.infer<typeof postDocSchema>;
export type PostBlock = NonNullable<PostDoc["content"]>[number];
type Block<T extends PostBlock["type"]> = Extract<PostBlock, { type: T }>;

export const emptyPostDoc = (): PostDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

/* Reading --------------------------------------------------------------------------- */

/** Words a minute for "5 min read". */
const WORDS_PER_MINUTE = 225;

export function postWordCount(doc: PostDoc | null | undefined): number {
  return wordCount(doc);
}

/** Minutes to read, never less than one (08 §3 "reading time computed"). */
export function readingMinutes(doc: PostDoc | null | undefined): number {
  return Math.max(1, Math.round(postWordCount(doc) / WORDS_PER_MINUTE));
}

/** Library files and listings the document points at (for checks, usage and rendering). */
export function postReferences(doc: PostDoc | null | undefined): {
  mediaIds: string[];
  propertyIds: string[];
} {
  const mediaIds = new Set<string>();
  const propertyIds = new Set<string>();
  for (const b of doc?.content ?? []) {
    if (b.type === "image") mediaIds.add(b.attrs.mediaId);
    if (b.type === "propertyCard") propertyIds.add(b.attrs.propertyId);
  }
  return { mediaIds: [...mediaIds], propertyIds: [...propertyIds] };
}

/** The document with its editor-only labels (image address, listing name) set by the server. */
export function withEditorLabels(
  doc: PostDoc,
  labels: { media: ReadonlyMap<string, string>; properties: ReadonlyMap<string, string> },
): PostDoc {
  if (!doc.content) return doc;
  return {
    ...doc,
    content: doc.content.map((b) => {
      if (b.type === "image")
        return { ...b, attrs: { ...b.attrs, src: labels.media.get(b.attrs.mediaId) ?? null } };
      if (b.type === "propertyCard")
        return {
          ...b,
          attrs: { ...b.attrs, label: labels.properties.get(b.attrs.propertyId) ?? null },
        };
      return b;
    }),
  };
}

/** A video id and start second from any usual YouTube address, or null. */
export function parseYouTubeUrl(input: string): { videoId: string; start: number | null } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") id = url.searchParams.get("v");
    else if (first === "embed" || first === "shorts" || first === "live") id = second ?? null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    videoId: id,
    start: parseStart(url.searchParams.get("t") ?? url.searchParams.get("start")),
  };
}

/** "90", "90s", "1m30s" or "1h2m3s" in seconds. */
function parseStart(value: string | null): number | null {
  if (!value) return null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!m || !m[0]) return null;
  const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return seconds > 0 && seconds <= 86_400 ? seconds : null;
}

/* Rendering ------------------------------------------------------------------------- */

export type PostMedia = { url: string; width: number | null; height: number | null; alt: string };

export type PostRenderContext = {
  /** Ready library files by id; an image whose file is missing is left out. */
  media: ReadonlyMap<string, PostMedia>;
  /** The site's address, so full links to its own pages count as internal. */
  siteOrigin?: string;
};

/**
 * The page renders posts as HTML pieces with live listing cards between them: a card shows
 * today's price and status, so it is never baked into the HTML.
 */
export type PostSegment = { kind: "html"; html: string } | { kind: "property"; propertyId: string };

function renderImage(node: Block<"image">, ctx: PostRenderContext): string {
  const file = ctx.media.get(node.attrs.mediaId);
  if (!file) return "";
  const alt = node.attrs.alt?.trim() || file.alt;
  const srcset = mediaSrcSet(file.url, 1920, 384);
  const size = file.width && file.height ? ` width="${file.width}" height="${file.height}"` : "";
  const caption = node.attrs.caption?.trim();
  return (
    `<figure class="rt-figure"><img src="${escapeHtml(mediaVariant(file.url, 1200))}"` +
    (srcset ? ` srcset="${escapeHtml(srcset)}" sizes="(min-width: 800px) 720px, 100vw"` : "") +
    ` alt="${escapeHtml(alt)}"${size} loading="lazy" decoding="async">` +
    (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "") +
    "</figure>"
  );
}

function renderVideo(node: Block<"youtube">): string {
  const { videoId, start, title } = node.attrs;
  if (!YOUTUBE_ID.test(videoId)) return "";
  const src = `https://www.youtube-nocookie.com/embed/${videoId}${start ? `?start=${start}` : ""}`;
  return (
    `<figure class="rt-video"><iframe src="${src}" title="${escapeHtml(title?.trim() || "YouTube video")}"` +
    ' loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
    ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></figure>'
  );
}

function renderCta(node: Block<"ctaButton">, links: LinkRules): string {
  const className =
    node.attrs.variant === "secondary" ? "rt-cta-link rt-cta-secondary" : "rt-cta-link";
  const open = linkOpenTag(node.attrs.href, links, className);
  return open ? `<p class="rt-cta">${open}${escapeHtml(node.attrs.label)}</a></p>` : "";
}

function renderTable(node: Block<"table">, links: LinkRules): string {
  const rows = node.content
    .map((row, r) => {
      const cells = row.content
        .map((c) => {
          const header = c.type === "tableHeader";
          const tag = header ? "th" : "td";
          const scope = header ? ` scope="${r === 0 ? "col" : "row"}"` : "";
          const colspan = (c.attrs?.colspan ?? 1) > 1 ? ` colspan="${c.attrs!.colspan}"` : "";
          const rowspan = (c.attrs?.rowspan ?? 1) > 1 ? ` rowspan="${c.attrs!.rowspan}"` : "";
          const align = c.attrs?.align ? ` class="rt-align-${c.attrs.align}"` : "";
          // One paragraph is the usual cell: its text goes straight into the cell.
          const inner =
            c.content.length === 1
              ? renderInline(c.content[0]!.content, links)
              : c.content.map((p) => renderBlock(p, links)).join("");
          return `<${tag}${scope}${colspan}${rowspan}${align}>${inner}</${tag}>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="rt-table" tabindex="0"><table><tbody>${rows}</tbody></table></div>`;
}

function renderPostBlock(node: PostBlock, ctx: PostRenderContext, links: LinkRules): string {
  switch (node.type) {
    case "blockquote":
      return `<blockquote>${node.content.map((p) => renderBlock(p, links)).join("")}</blockquote>`;
    case "table":
      return renderTable(node, links);
    case "image":
      return renderImage(node, ctx);
    case "youtube":
      return renderVideo(node);
    case "ctaButton":
      return renderCta(node, links);
    case "propertyCard":
      return ""; // a segment of its own
    default:
      return renderBlock(node, links);
  }
}

/** HTML pieces and listing cards, in document order. Empty paragraphs are dropped. */
export function renderPostSegments(
  doc: PostDoc | null | undefined,
  ctx: PostRenderContext,
): PostSegment[] {
  const links = postLinkRules(ctx.siteOrigin);
  const segments: PostSegment[] = [];
  let html = "";
  for (const block of doc?.content ?? []) {
    if (block.type === "propertyCard") {
      if (html) segments.push({ kind: "html", html });
      html = "";
      segments.push({ kind: "property", propertyId: block.attrs.propertyId });
      continue;
    }
    const piece = renderPostBlock(block, ctx, links);
    if (piece !== "<p></p>") html += piece;
  }
  if (html) segments.push({ kind: "html", html });
  return segments;
}

/**
 * The whole document as one HTML string (stored as `body_html` for search, checks and the
 * assistant). Listing cards become a link to the listing; listings not given are left out.
 */
export function renderPostHtml(
  doc: PostDoc | null | undefined,
  ctx: PostRenderContext & {
    properties?: ReadonlyMap<string, { href: string; title: string }>;
  },
): string {
  return renderPostSegments(doc, ctx)
    .map((s) => {
      if (s.kind === "html") return s.html;
      const p = ctx.properties?.get(s.propertyId);
      return p
        ? `<p class="rt-listing"><a href="${escapeHtml(p.href)}">${escapeHtml(p.title)}</a></p>`
        : "";
    })
    .join("");
}
