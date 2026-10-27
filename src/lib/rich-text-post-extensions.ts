import Blockquote from "@tiptap/extension-blockquote";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { Node as TiptapNode } from "@tiptap/react";
import { mediaVariant } from "@/lib/media-src";
import { richTextStarterKit } from "@/lib/rich-text-extensions";
import { isPostHref, YOUTUBE_ID } from "@/lib/rich-text-post";

/*
 * The post editor's document model (08 §3): the description model plus quotes, tables and
 * four blocks of our own. It must produce only what `postDocSchema` accepts;
 * tests/unit/rich-text-post.test.ts builds this schema and checks the two stay in step.
 * The blocks render here for the editor only; the site's HTML comes from lib/rich-text-post.ts.
 */

const fromAttr = (name: string) => (el: HTMLElement) => el.getAttribute(name) || null;

/** A picture from the media library, by id: posts never point at files elsewhere. */
const LibraryImage = TiptapNode.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null, parseHTML: fromAttr("data-media-id") },
      alt: {
        default: null,
        parseHTML: (el) => el.querySelector("img")?.getAttribute("alt") || null,
      },
      caption: {
        default: null,
        parseHTML: (el) => el.querySelector("figcaption")?.textContent?.trim() || null,
      },
      src: { default: null, parseHTML: fromAttr("data-src") },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-media-id]" }];
  },
  renderHTML({ node }) {
    const { mediaId, alt, caption, src } = node.attrs as Record<string, string | null>;
    const children: DOMOutputSpec[] = [
      src
        ? ["img", { src: mediaVariant(src, 750), alt: alt ?? "" }]
        : ["span", { class: "rt-embed" }, "Image (still processing)"],
    ];
    if (caption) children.push(["figcaption", {}, caption]);
    return [
      "figure",
      { "data-media-id": mediaId, "data-src": src, class: "rt-figure" },
      ...children,
    ];
  },
});

/** A YouTube video by id; the site embeds it from youtube-nocookie.com. */
const YouTube = TiptapNode.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      videoId: { default: null, parseHTML: fromAttr("data-youtube") },
      start: { default: null, parseHTML: (el) => Number(el.getAttribute("data-start")) || null },
      title: { default: null, parseHTML: fromAttr("data-title") },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-youtube]" }];
  },
  renderHTML({ node }) {
    const { videoId, start, title } = node.attrs as {
      videoId: string | null;
      start: number | null;
      title: string | null;
    };
    const children: DOMOutputSpec[] = [];
    if (videoId && YOUTUBE_ID.test(videoId))
      children.push(["img", { src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, alt: "" }]);
    children.push(["span", {}, title ? `YouTube video: ${title}` : "YouTube video"]);
    return [
      "div",
      {
        "data-youtube": videoId,
        "data-start": start,
        "data-title": title,
        class: "rt-embed rt-embed-video",
      },
      ...children,
    ];
  },
});

/** A listing card by reference: the site shows the listing's current price and status. */
const PropertyCard = TiptapNode.create({
  name: "propertyCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      propertyId: { default: null, parseHTML: fromAttr("data-property-card") },
      label: { default: null, parseHTML: fromAttr("data-label") },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-property-card]" }];
  },
  renderHTML({ node }) {
    const { propertyId, label } = node.attrs as Record<string, string | null>;
    return [
      "div",
      { "data-property-card": propertyId, "data-label": label, class: "rt-embed rt-embed-listing" },
      `Listing card: ${label ?? "a listing"}`,
    ];
  },
});

/** A call-to-action button: a label and where it goes. */
const CtaButton = TiptapNode.create({
  name: "ctaButton",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      label: { default: null, parseHTML: (el) => el.textContent?.trim() || null },
      href: { default: null, parseHTML: fromAttr("data-href") },
      variant: {
        default: "primary",
        parseHTML: (el) =>
          el.getAttribute("data-variant") === "secondary" ? "secondary" : "primary",
      },
    };
  },
  parseHTML() {
    return [{ tag: "p[data-cta]" }];
  },
  renderHTML({ node }) {
    const { label, href, variant } = node.attrs as Record<string, string | null>;
    return [
      "p",
      { "data-cta": "", "data-href": href, "data-variant": variant, class: "rt-cta" },
      [
        "span",
        { class: variant === "secondary" ? "rt-cta-link rt-cta-secondary" : "rt-cta-link" },
        label ?? "",
      ],
    ];
  },
});

export function postTextExtensions(placeholder = "") {
  return [
    richTextStarterKit(isPostHref),
    Blockquote.extend({ content: "paragraph+" }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader.extend({ content: "paragraph+" }),
    TableCell.extend({ content: "paragraph+" }),
    LibraryImage,
    YouTube,
    PropertyCard,
    CtaButton,
    Placeholder.configure({ placeholder }),
  ];
}
