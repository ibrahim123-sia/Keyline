import "server-only";
import type { PublicGuide } from "@/features/area-guides/public";
import type { PublicPost } from "@/features/blog/public";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { mediaVariant } from "@/lib/media-src";

/**
 * Structured data for website content (08 §6): Article for posts, FAQPage where FAQs show,
 * Place for area guides. Absolute URLs throughout.
 */

export type Publisher = { name: string; url: string; logo: string | null };

/** The agency as the publisher of its posts (Settings -> SEO organisation, else General). */
export async function publisher(origin: string): Promise<Publisher> {
  const [general, seo] = await Promise.all([getSettings("general"), getSettings("seo")]);
  const logo = await getPublicMedia(seo.organisation.logoId ?? general.logoLightId);
  return {
    name: seo.organisation.name || general.agencyName,
    url: `${origin}/`,
    logo: logo ? new URL(mediaVariant(logo.url, 640), origin).toString() : null,
  };
}

export function articleJsonLd(
  p: PublicPost,
  o: { url: string; origin: string; description: string; publisher: Publisher },
): Record<string, unknown> {
  const abs = (path: string) => new URL(path, o.origin).toString();
  const org = {
    "@type": "Organization",
    name: o.publisher.name,
    url: o.publisher.url,
    ...(o.publisher.logo ? { logo: { "@type": "ImageObject", url: o.publisher.logo } } : {}),
  };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title.slice(0, 110),
    description: o.description || undefined,
    image: p.cover ? [abs(mediaVariant(p.cover.url, 1200))] : undefined,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt,
    author: p.author
      ? {
          "@type": "Person",
          name: p.author.name,
          url: p.author.href ? abs(p.author.href) : undefined,
        }
      : { "@type": "Organization", name: o.publisher.name, url: o.publisher.url },
    publisher: org,
    mainEntityOfPage: { "@type": "WebPage", "@id": o.url },
    articleSection: p.category?.name,
    keywords: p.tags.length ? p.tags.map((t) => t.name).join(", ") : undefined,
    wordCount: p.wordCount,
  };
}

export function faqJsonLd(faqs: Array<{ question: string; answerHtml: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answerHtml },
    })),
  };
}

export function placeJsonLd(
  g: PublicGuide,
  o: { url: string; origin: string; description: string },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: g.location.name,
    description: o.description || undefined,
    url: o.url,
    image: g.cover ? [new URL(mediaVariant(g.cover.url, 1200), o.origin).toString()] : undefined,
    geo: g.location.center
      ? {
          "@type": "GeoCoordinates",
          latitude: g.location.center.lat,
          longitude: g.location.center.lng,
        }
      : undefined,
    containedInPlace: g.location.parentName
      ? { "@type": "Place", name: g.location.parentName }
      : undefined,
  };
}
