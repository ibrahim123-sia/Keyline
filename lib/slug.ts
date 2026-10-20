/**
 * URL slugs (01 §4): generated from the title, editable, unique per content type.
 * Lowercase ASCII, words joined by single hyphens, max 80 characters.
 */
export function slugify(input: string, maxLength = 80): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[ßẞ]/g, "ss")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/&/g, " and ")
    .toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "item";
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 80;
}

/**
 * First free slug: `base`, then `base-2`, `base-3`... `taken` gets every candidate's
 * "already used" answer from the database in one query.
 */
export async function uniqueSlug(
  base: string,
  taken: (candidates: string[]) => Promise<Set<string>>,
): Promise<string> {
  const root = slugify(base);
  for (let start = 1; start < 1000; start += 20) {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      start + i === 1 ? root : `${root}-${start + i}`,
    );
    const used = await taken(candidates);
    const free = candidates.find((c) => !used.has(c));
    if (free) return free;
  }
  return `${root}-${Date.now().toString(36)}`;
}
