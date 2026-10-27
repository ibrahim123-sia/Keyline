import { SearchIcon } from "lucide-react";
import { cn } from "cn";
import type { PublicCategory } from "@/features/blog/public";
import { format } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

/** Category tabs and the search box above the post lists (06 §9). */
export function InsightsNav({
  categories,
  current,
  q,
}: {
  categories: PublicCategory[];
  /** The category page's slug; null on /insights. */
  current: string | null;
  q: string;
}) {
  const t = content.insights;
  const tabs = [
    { label: t.all, href: "/insights", active: current === null },
    ...categories
      .filter((c) => c.posts > 0 || c.slug === current)
      .map((c) => ({
        label: c.name,
        href: `/insights/category/${c.slug}`,
        active: c.slug === current,
      })),
  ];
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <nav aria-label={t.categories} className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 px-1 whitespace-nowrap">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <a
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-[14.5px] font-semibold",
                  tab.active
                    ? "bg-ink text-surface"
                    : "bg-surface text-ink shadow-soft hover:bg-surface-muted",
                )}
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <form
        method="get"
        role="search"
        aria-label={t.searchLabel}
        action={current ? `/insights/category/${current}` : "/insights"}
        className="flex w-full gap-2 md:w-80"
      >
        <label htmlFor="insights-q" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="insights-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t.searchPlaceholder}
          className="h-11 min-w-0 flex-1 rounded-input border border-input bg-surface px-3 text-[15px] text-ink"
        />
        <button
          type="submit"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-input bg-ink text-surface"
        >
          <SearchIcon className="size-4" aria-hidden />
          <span className="sr-only">{t.searchButton}</span>
        </button>
      </form>
    </div>
  );
}

/** Newer / older links and "Page 2 of 5". */
export function InsightsPager({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  const t = content.insights;
  if (pages <= 1) return null;
  const link =
    "inline-flex h-11 items-center rounded-full bg-surface px-5 font-semibold text-ink shadow-soft hover:bg-surface-muted";
  return (
    <nav aria-label={t.pagination} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <a href={href(page - 1)} rel="prev" className={link}>
          {t.previous}
        </a>
      ) : (
        <span />
      )}
      <p className="text-[14px] text-text-muted">{format(t.page, { page, pages })}</p>
      {page < pages ? (
        <a href={href(page + 1)} rel="next" className={link}>
          {t.next}
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
