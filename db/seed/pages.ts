import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pageRevisions, pages, type StoredSection } from "@/db/schema/cms";
import type { PageTemplate } from "@/features/cms/page-schema";
import { sectionInputSchema, type SectionType } from "@/features/cms/sections";
import { patchSettings } from "@/features/settings/mutations";
import { havenDunePages } from "./presets/haven-dune-pages";

/**
 * The page builder pages of a demo preset (08 §1 "Seed pages"): About, Contact, Sell with us,
 * Off-plan guide, How we verify and the policies, published with a first revision, plus the
 * testimonials, blog and FAQ sections at the end of the home page. Every section is checked
 * with the same strict schema the page builder saves with.
 */
export type SeedSection = {
  type: SectionType;
  props: Record<string, unknown>;
  style?: Record<string, unknown>;
};

export type SeedPage = {
  title: string;
  slug: string;
  template: PageTemplate;
  seoTitle?: string;
  seoDescription?: string;
  /** The policy it is in Settings -> Legal. */
  legal?: "privacy" | "terms" | "cookies" | "verify";
  sections: SeedSection[];
};

export type SeedPagesCopy = { home: SeedSection[]; pages: SeedPage[] };

const copies: Record<string, SeedPagesCopy> = { "haven-dune": havenDunePages };

const system = { type: "system", id: null } as const;

/** "$living" -> the id of a picture the seed drew ("living", "villa", "tower"). */
function withImages(value: unknown, images: Record<string, string | undefined>): unknown {
  if (typeof value === "string" && value.startsWith("$")) return images[value.slice(1)] ?? null;
  if (Array.isArray(value)) return value.map((v) => withImages(v, images));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withImages(v, images)]));
  return value;
}

function build(sections: SeedSection[], images: Record<string, string | undefined>, from = 1) {
  const schema = sectionInputSchema();
  return sections.map((s, i) => {
    const raw = withImages(
      {
        id: `${s.type.replace(/_/g, "-")}-${from + i}`,
        type: s.type,
        props: s.props,
        style: s.style ?? {},
      },
      images,
    );
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new Error(`Seed page section ${s.type} is invalid: ${parsed.error.message}`);
    return parsed.data as unknown as StoredSection;
  });
}

export async function seedPages(
  db: Db,
  presetKey: string,
  opts: { images: Record<string, string | undefined> },
): Promise<{ pages: number }> {
  const copy = copies[presetKey];
  if (!copy) return { pages: 0 };
  const legal: Record<string, string> = {};
  for (const page of copy.pages) {
    const sections = build(page.sections, opts.images);
    const [row] = await db
      .insert(pages)
      .values({
        title: page.title,
        slug: page.slug,
        template: page.template,
        status: "published",
        sections,
        seoTitle: page.seoTitle ?? null,
        seoDescription: page.seoDescription ?? null,
        version: 2,
      })
      .returning();
    await db.insert(pageRevisions).values({
      pageId: row!.id,
      sections,
      seo: { title: row!.title, slug: row!.slug, template: row!.template },
    });
    if (page.legal) legal[page.legal] = row!.id;
  }

  const [home] = await db
    .select()
    .from(pages)
    .where(
      and(eq(pages.agencyId, currentAgencyId()), eq(pages.isHome, true), isNull(pages.deletedAt)),
    );
  if (home) {
    const sections = [...home.sections, ...build(copy.home, opts.images, home.sections.length + 1)];
    await db.update(pages).set({ sections, version: 2 }).where(eq(pages.id, home.id));
    await db.insert(pageRevisions).values({
      pageId: home.id,
      sections,
      seo: { title: home.title, slug: home.slug, template: home.template },
    });
  }

  await patchSettings(
    db,
    "legal",
    {
      privacyPageId: legal.privacy ?? null,
      termsPageId: legal.terms ?? null,
      cookiePageId: legal.cookies ?? null,
      howWeVerifyPageId: legal.verify ?? null,
    },
    system,
  );
  return { pages: copy.pages.length + (home ? 1 : 0) };
}
