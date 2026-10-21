import "server-only";
import type { Metadata } from "next";
import { getSettings } from "@/features/settings/queries";
import { format } from "@/lib/i18n";
import { search as t } from "@/lib/i18n/dictionaries/search";
import { countText, searchHeading } from "./labels";
import { countListings, searchLabels } from "./page-data";
import { hasExtraFilters, parseSearch, searchPath, type SearchFilters } from "./params";

type Params = Record<string, string | string[] | undefined>;

/**
 * Title, description, canonical and robots for a search page (08 §6): filtered combinations
 * and thin pages are not indexed; the canonical is the landing route.
 */
export async function searchMetadata(
  preset: Partial<Pick<SearchFilters, "purpose" | "completion" | "loc" | "type">>,
  searchParams: Promise<Params>,
): Promise<Metadata> {
  const f = parseSearch(await searchParams, preset);
  const [labels, count, seo] = await Promise.all([
    searchLabels(f),
    countListings(f),
    getSettings("seo"),
  ]);
  const heading = searchHeading(f, labels);
  const { path } = searchPath(f);
  const filtered = hasExtraFilters(f);
  const typeLanding = f.type.length === 1 && f.loc.length === 1;
  const thin =
    count < seo.thinPageMinListings || (typeLanding && count < seo.landingTypeMinListings);
  const canonical = f.page > 1 && !filtered ? `${path}?page=${f.page}` : path;
  const description =
    count > 0
      ? format(t.meta.description, { heading, count: countText(count).toLowerCase() })
      : format(t.meta.descriptionNone, { heading });
  return {
    title: heading,
    description,
    alternates: { canonical },
    robots: filtered || thin || !seo.allowIndexing ? { index: false, follow: true } : undefined,
    openGraph: { title: heading, description, url: canonical },
  };
}
