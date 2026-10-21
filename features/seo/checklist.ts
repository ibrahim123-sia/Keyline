/**
 * The SEO checklist under every SEO panel (08 §6): title and description length, H1, image
 * alt texts, internal links and word count. Facts a screen does not know are left out.
 */

/** Rough pixel width of a Google title (about 580 px fits on desktop). */
export function titlePixels(text: string): number {
  let px = 0;
  for (const ch of text) {
    if ("iljtfI.,;:!|' ".includes(ch)) px += 4.5;
    else if ("mwMW".includes(ch)) px += 14;
    else if (ch === ch.toUpperCase() && /[A-Z]/.test(ch)) px += 11;
    else px += 8.5;
  }
  return Math.round(px);
}

export const TITLE_MAX_PX = 580;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

export type ChecklistFacts = {
  /** The page has one main heading. */
  h1?: boolean;
  /** Images on the page without alt text. */
  imagesWithoutAlt?: number;
  /** Links from the page to other pages of the site. */
  internalLinks?: number;
  /** Words of text on the page, and how many it should have. */
  words?: number;
  minWords?: number;
};

export type CheckLevel = "ok" | "warn" | "fail";
export type CheckItem = { key: string; label: string; level: CheckLevel; hint: string };

export function seoChecklist(
  input: { title: string; description: string } & ChecklistFacts,
): CheckItem[] {
  const items: CheckItem[] = [];
  const px = titlePixels(input.title);
  const title = input.title.trim();
  items.push(
    !title
      ? { key: "title", label: "Title", level: "fail", hint: "Add a title." }
      : px > TITLE_MAX_PX
        ? {
            key: "title",
            label: "Title length",
            level: "warn",
            hint: `About ${px} px: Google cuts titles after about ${TITLE_MAX_PX} px.`,
          }
        : title.length < 15
          ? {
              key: "title",
              label: "Title length",
              level: "warn",
              hint: "Short: say what and where.",
            }
          : { key: "title", label: "Title length", level: "ok", hint: `${px} px, fits.` },
  );
  const d = input.description.trim().length;
  items.push(
    d === 0
      ? {
          key: "description",
          label: "Meta description",
          level: "fail",
          hint: "Missing: Google picks a snippet from the page.",
        }
      : d > DESCRIPTION_MAX
        ? {
            key: "description",
            label: "Description length",
            level: "warn",
            hint: `${d} characters: aim for ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}.`,
          }
        : d < DESCRIPTION_MIN
          ? {
              key: "description",
              label: "Description length",
              level: "warn",
              hint: `${d} characters: a little short (aim for ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}).`,
            }
          : {
              key: "description",
              label: "Description length",
              level: "ok",
              hint: `${d} characters.`,
            },
  );
  if (input.h1 !== undefined)
    items.push(
      input.h1
        ? { key: "h1", label: "Main heading (H1)", level: "ok", hint: "Present." }
        : {
            key: "h1",
            label: "Main heading (H1)",
            level: "fail",
            hint: "The page has no main heading.",
          },
    );
  if (input.imagesWithoutAlt !== undefined)
    items.push(
      input.imagesWithoutAlt === 0
        ? { key: "alts", label: "Image alt texts", level: "ok", hint: "Every image has one." }
        : {
            key: "alts",
            label: "Image alt texts",
            level: "warn",
            hint: `${input.imagesWithoutAlt} image${input.imagesWithoutAlt === 1 ? "" : "s"} without alt text.`,
          },
    );
  if (input.internalLinks !== undefined)
    items.push(
      input.internalLinks > 0
        ? {
            key: "links",
            label: "Internal links",
            level: "ok",
            hint: `${input.internalLinks} link${input.internalLinks === 1 ? "" : "s"} to other pages.`,
          }
        : {
            key: "links",
            label: "Internal links",
            level: "warn",
            hint: "Link to related listings, areas or posts.",
          },
    );
  if (input.words !== undefined) {
    const min = input.minWords ?? 300;
    items.push(
      input.words >= min
        ? { key: "words", label: "Word count", level: "ok", hint: `${input.words} words.` }
        : {
            key: "words",
            label: "Word count",
            level: "warn",
            hint: `${input.words} words: pages with at least ${min} rank better.`,
          },
    );
  }
  return items;
}
