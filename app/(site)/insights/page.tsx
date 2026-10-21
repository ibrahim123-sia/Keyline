import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { InsightsNav, InsightsPager } from "@/components/site/content/insights-nav";
import { PostCard } from "@/components/site/content/post-card";
import { listPublicPosts, parseInsightsQuery, publicCategories } from "@/features/blog/public";
import { getSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { format, pages } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

/** Per request: the search words and page come from the address; the data is cached. */
export const instant = false;

export async function generateMetadata(props: PageProps<"/insights">): Promise<Metadata> {
  const t = content.insights;
  const query = parseInsightsQuery(await props.searchParams);
  const filtered = Boolean(query.q || query.tag);
  return {
    title: t.title,
    description: t.intro,
    alternates: {
      canonical: query.page > 1 && !filtered ? `/insights?page=${query.page}` : "/insights",
    },
    // Search and tag lists are for visitors, not for the index.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

/** /insights (06 §9): the newest posts with category tabs and a search box. */
export default async function InsightsPage(props: PageProps<"/insights">) {
  const t = content.insights;
  const query = parseInsightsQuery(await props.searchParams);
  const [result, categories, general] = await Promise.all([
    listPublicPosts(query),
    publicCategories(),
    getSettings("general"),
  ]);
  const href = (page: number) => {
    const sp = new URLSearchParams();
    if (query.q) sp.set("q", query.q);
    if (query.tag) sp.set("tag", query.tag);
    if (page > 1) sp.set("page", String(page));
    return sp.size ? `/insights?${sp}` : "/insights";
  };
  const heading = query.q
    ? format(t.resultsFor, { q: query.q })
    : query.tag
      ? format(t.taggedWith, { tag: query.tag.replace(/-/g, " ") })
      : null;

  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Breadcrumb
            items={[{ label: pages.common.home, href: "/" }, { label: t.title }]}
            baseUrl={siteOrigin()}
          />
          <h1 className="text-display">{t.title}</h1>
          <p className="max-w-2xl text-lg text-text">{t.intro}</p>
        </div>
        <InsightsNav categories={categories} current={null} q={query.q} />
        {heading && (
          <p className="flex flex-wrap items-center gap-3 text-[15px] font-semibold text-ink">
            {heading}
            <Link href="/insights" className="font-normal text-accent underline underline-offset-4">
              {t.clear}
            </Link>
          </p>
        )}
        <p role="status" className="sr-only">
          {result.total === 1 ? t.countOne : format(t.count, { count: result.total })}
        </p>
        {result.cards.length === 0 ? (
          <p className="rounded-[20px] bg-surface p-8 text-center text-text-muted shadow-soft">
            {query.q || query.tag ? t.emptySearch : t.empty}
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
