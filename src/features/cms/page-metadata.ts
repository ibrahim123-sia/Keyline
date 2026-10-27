import "server-only";
import type { Metadata } from "next";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { mediaVariant } from "@/lib/media-src";
import { richTextToPlain } from "@/lib/rich-text";
import type { PublicPage } from "./page-public";

/** The first words of the page's text, for a description when none was written. */
export function pageDescription(page: PublicPage, max = 155): string {
  for (const s of page.sections) {
    const text =
      s.type === "text" || s.type === "text_image"
        ? richTextToPlain(s.props.body)
        : s.type === "hero_simple" || s.type === "hero_search"
          ? s.props.subheading
          : "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
  }
  return "";
}

/** Title, description, canonical, robots and share image of a page (08 §6 SEO panel). */
export async function pageMetadata(page: PublicPage, path: string): Promise<Metadata> {
  const seo = await getSettings("seo");
  const og = await getPublicMedia(page.ogImageId ?? seo.defaultOgImageId);
  const title = page.seoTitle || page.title;
  const description =
    page.seoDescription || pageDescription(page) || seo.defaultMetaDescription || undefined;
  const canonical = page.canonicalUrl || path;
  return {
    title,
    description,
    alternates: { canonical },
    robots: page.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: og ? [{ url: mediaVariant(og.url, 1200), width: 1200 }] : undefined,
    },
  };
}
