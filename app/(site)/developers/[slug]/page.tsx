import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { ListingCard } from "@/components/site/listings/listing-card";
import { MediaImage } from "@/components/site/media-image";
import { ProjectCard } from "@/components/site/projects/project-card";
import { getPublicDeveloper } from "@/features/developers/public";
import { getPublicMedia } from "@/features/media/queries";
import { cardContext } from "@/features/site/card-context";
import { siteOrigin } from "@/features/site/url";
import { format, pages, site } from "@/lib/i18n";

/** Per request: the slug (and the visitor's currency cookie) decide what renders; data is cached. */
export const instant = false;

export async function generateMetadata(props: PageProps<"/developers/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await getPublicDeveloper(slug);
  if (!d) return { title: site.errors.notFoundTitle };
  const title = d.seo.title || d.name;
  const description = d.seo.description || d.description?.slice(0, 155) || undefined;
  const og = d.seo.ogImageId ? await getPublicMedia(d.seo.ogImageId) : d.logo;
  return {
    title,
    description,
    alternates: { canonical: d.seo.canonicalUrl || `/developers/${d.slug}` },
    robots: d.seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, images: og ? [{ url: og.url }] : undefined },
  };
}

/** /developers/[slug] (06 §1): logo, description, website, their projects and listings. */
export default async function DeveloperPage(props: PageProps<"/developers/[slug]">) {
  const { slug } = await props.params;
  const d = await getPublicDeveloper(slug);
  if (!d) notFound();
  const t = pages.developers;
  const ctx = await cardContext();
  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-10">
        <Breadcrumb
          items={[
            { label: pages.common.home, href: "/" },
            { label: t.title, href: "/developers" },
            { label: d.name },
          ]}
          baseUrl={siteOrigin()}
        />
        <header className="flex flex-col gap-6 md:flex-row md:items-start">
          {d.logo && (
            <div className="flex h-28 w-56 shrink-0 items-center justify-center rounded-[20px] bg-surface p-4 shadow-soft">
              <MediaImage
                src={d.logo.url}
                alt={d.logo.alt}
                sizes="224px"
                aspect="2 / 1"
                fit="contain"
                maxWidth={640}
                priority
              />
            </div>
          )}
          <div className="flex flex-col gap-3">
            <h1 className="text-display">{d.name}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-text-muted">
              {d.establishedYear && <span>{format(t.founded, { year: d.establishedYear })}</span>}
              {d.website && (
                <a
                  href={d.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ink underline underline-offset-4"
                >
                  {t.website}
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">{pages.common.newTab}</span>
                </a>
              )}
            </p>
            {d.description && (
              <p className="max-w-3xl text-[16px] leading-relaxed whitespace-pre-line text-text">
                {d.description}
              </p>
            )}
          </div>
        </header>

        <section aria-labelledby="developer-projects" className="flex flex-col gap-5">
          <h2 id="developer-projects" className="text-h2">
            {t.theirProjects}
          </h2>
          {d.projects.length === 0 ? (
            <p className="text-text-muted">{t.noProjects}</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {d.projects.map((p) => (
                <li key={p.id} className="flex">
                  <ProjectCard
                    project={p}
                    visitorCurrency={ctx.visitorCurrency}
                    rates={ctx.rates}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.listings.length > 0 && (
          <section aria-labelledby="developer-listings" className="flex flex-col gap-5">
            <h2 id="developer-listings" className="text-h2">
              {t.theirListings}
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {d.listings.map((l) => (
                <li key={l.id}>
                  <ListingCard listing={l} ctx={ctx} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
