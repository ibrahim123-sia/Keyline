import { fillPattern } from "@/features/seo/titles";

/**
 * Title patterns from Settings -> SEO ("%project% by %developer% in %area%"): filled with the
 * page's values; when a value the pattern needs is missing, the fallback is used instead of a
 * title with gaps. Same rules as features/seo/titles.ts (studios, spacing).
 */
export function fillTitlePattern(
  pattern: string,
  values: Record<string, string | null | undefined>,
  fallback: string,
): string {
  return fillPattern(pattern, values, fallback);
}

/** Plain text from stored rich-text HTML, for meta descriptions. */
export function htmlToText(html: string | null | undefined, max = 155): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}
