import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getPopularAreas } from "@/features/site/areas";
import { pages, site } from "@/lib/i18n";

/** The helpful 404 (06 §1): a search box and the agency's popular areas. */
export async function NotFoundContent() {
  const areas = await getPopularAreas();
  const t = pages.notFound;
  return (
    <section className="section-y">
      <div className="container-site max-w-2xl">
        <p className="text-eyebrow text-accent">{t.eyebrow}</p>
        <h1 className="mt-3 text-display">{site.errors.notFoundTitle}</h1>
        <p className="mt-4 text-lg text-text">{site.errors.notFoundText}</p>
        <form action="/buy" method="get" role="search" className="mt-8 flex gap-2">
          <label htmlFor="not-found-q" className="sr-only">
            {t.searchLabel}
          </label>
          <div className="relative flex-1">
            <SearchIcon
              className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              id="not-found-q"
              name="q"
              type="search"
              placeholder={t.searchPlaceholder}
              className="h-12 w-full rounded-input border border-input bg-surface ps-12 pe-4 text-[15px] text-ink"
            />
          </div>
          <Button type="submit" size="md" className="h-12">
            {t.searchButton}
          </Button>
        </form>
        {areas.length > 0 && (
          <nav aria-labelledby="not-found-areas" className="mt-10">
            <h2 id="not-found-areas" className="text-[15px] font-semibold text-ink">
              {t.popularAreas}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {areas.map((a) => (
                <li key={a.slug}>
                  <a
                    href={`/buy/${a.slug}`}
                    className="inline-flex rounded-full border border-border bg-surface px-4 py-2 text-[14px] text-ink hover:border-ink/40"
                  >
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <p className="mt-10">
          <Link
            href="/"
            className="text-[15px] font-semibold text-ink underline underline-offset-4"
          >
            {t.home}
          </Link>
        </p>
      </div>
    </section>
  );
}
