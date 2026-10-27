import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { InsightsNav, InsightsPager } from "@/components/site/content/insights-nav";
import { PostCard } from "@/components/site/content/post-card";
import {
  getPublicCategory,
  listPublicPosts,
  parseInsightsQuery,
  publicCategories,
} from "@/features/blog/public";
import { getPublicMedia } from "@/features/media/queries";
import { followRedirect } from "@/features/content/redirect";
import { getSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { format, pages, site } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

/** Per request: the slug decides what renders (unknown ones are a 404); the data is cached. */
export const instant = false;

export async function generateMetadata(
  props: PageProps<"/insights/category/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const category = await getPublicCategory(slug);
  if (!category) return { title: site.errors.notFoundTitle };
  const query = parseInsightsQuery(await props.searchParams, slug);
  const title = category.seo.title || `${category.name} · ${content.insights.title}`;
  const description = category.seo.description || category.description || undefined;
  const og = category.seo.ogImageId ? await getPublicMedia(category.seo.ogImageId) : null;
  const path = `/insights/category/${category.slug}`;
  return {
    title,
    description,
    alternates: {
      canonical:
        category.seo.canonicalUrl ||
        (query.page > 1 && !query.q ? `${path}?page=${query.page}` : path),
    },
    // An empty category or a search inside it is not worth indexing.
    robots:
      category.seo.noindex || query.q || category.posts === 0
        ? { index: false, follow: true }
        : undefined,
    openGraph: { title, description, images: og ? [{ url: og.url }] : undefined },
  };
}

/** /insights/category/[slug] (06 §1): one category's posts. */
export default async function InsightsCategoryPage(props: PageProps<"/insights/category/[slug]">) {
  const { slug } = await props.params;
  const category = await getPublicCategory(slug);
  if (!category) {
    await followRedirect(`/insights/category/${slug}`);
    notFound();
  }
  const t = content.insights;
  const query = parseInsightsQuery(await props.searchParams, category.slug);
  const [result, categories, general] = await Promise.all([
    listPublicPosts(query),
    publicCategories(),
    getSettings("general"),
  ]);
  const path = `/insights/category/${category.slug}`;
  const href = (page: number) => {
    const sp = new URLSearchParams();
    if (query.q) sp.set("q", query.q);
    if (page > 1) sp.set("page", String(page));
    return sp.size ? `${path}?${sp}` : path;
  };

  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Breadcrumb
            items={[
              { label: pages.common.home, href: "/" },
              { label: t.title, href: "/insights" },
              { label: category.name },
            ]}
            baseUrl={siteOrigin()}
          />
          <h1 className="text-display">{category.name}</h1>
          {category.description && (
            <p className="max-w-2xl text-lg text-text">{category.description}</p>
          )}
        </div>
        <InsightsNav categories={categories} current={category.slug} q={query.q} />
        {query.q && (
          <p className="flex flex-wrap items-center gap-3 text-[15px] font-semibold text-ink">
            {format(t.resultsFor, { q: query.q })}
            <Link href={path} className="font-normal text-accent underline underline-offset-4">
              {t.clear}
            </Link>
          </p>
        )}
        <p role="status" className="sr-only">
          {result.total === 1 ? t.countOne : format(t.count, { count: result.total })}
        </p>
        {result.cards.length === 0 ? (
          <p className="rounded-[20px] bg-surface p-8 text-center text-text-muted shadow-soft">
            {query.q ? t.emptySearch : t.empty}
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {result.cards.map((p, i) => (
              <li key={p.id} className="flex">
                <PostCard post={p} timeZone={general.timeZone} priority={i < 3} headingLevel={2} />
              </li>
            ))}
          </ul>
        )}
        <InsightsPager page={result.page} pages={result.pages} href={href} />
      </div>
    </div>
  );
}
