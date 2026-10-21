import { slugify } from "@/lib/slug";
import type { Section } from "./sections";

export type TocEntry = { id: string; text: string };

/**
 * The h2 headings in a page's text, with ids unique on the page: anchors for links like
 * "/privacy-policy#cookies" and the legal template's table of contents (08 §1 Templates).
 */
export function pageHeadings(sections: Section[]): {
  toc: TocEntry[];
  bySection: Map<string, string[]>;
} {
  const used = new Set<string>();
  const toc: TocEntry[] = [];
  const bySection = new Map<string, string[]>();
  for (const s of sections) {
    if (s.type !== "text" && s.type !== "text_image") continue;
    const ids: string[] = [];
    for (const block of s.props.body.content ?? []) {
      if (block.type !== "heading" || block.attrs.level !== 2) continue;
      const text = (block.content ?? [])
        .map((n) => (n.type === "text" ? n.text : " "))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      const base = text ? slugify(text, 60) : "section";
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      ids.push(id);
      if (text) toc.push({ id, text });
    }
    bySection.set(s.id, ids);
  }
  return { toc, bySection };
}

/** Gives the h2 tags of rendered rich text these ids, in order (our own renderer's HTML). */
export function withHeadingIds(html: string, ids: readonly string[] | undefined): string {
  if (!ids?.length) return html;
  let i = 0;
  return html.replace(/<h2(\s[^>]*)?>/g, (tag, attrs: string | undefined) => {
    if (i >= ids.length) return tag;
    const rest = (attrs ?? "").replace(/\s+id="[^"]*"/, "");
    return `<h2 id="${ids[i++]}"${rest}>`;
  });
}
