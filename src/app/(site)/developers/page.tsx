import type { Metadata } from "next";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { MediaImage } from "@/components/site/media-image";
import { listPublicDevelopers } from "@/features/developers/public";
import { siteOrigin } from "@/features/site/url";
import { format, pages } from "@/lib/i18n";

export const metadata: Metadata = {
  title: pages.developers.title,
  description: pages.developers.intro,
  alternates: { canonical: "/developers" },
};

/** /developers (06 §1): the developers behind the agency's projects. */
export default async function DevelopersPage() {
  const t = pages.developers;
  const developers = await listPublicDevelopers();
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
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {developers.map((d) => (
            <li key={d.id}>
              <article className="relative flex h-full flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-soft transition-shadow hover:shadow-md">
                <div className="flex h-20 items-center justify-center rounded-[14px] border border-border bg-surface">
                  {d.logo ? (
                    <MediaImage
                      src={d.logo.url}
                      alt=""
                      sizes="200px"
                      aspect="3 / 1"
                      fit="contain"
                      maxWidth={384}
                      className="h-14 w-auto max-w-[80%]"
                    />
                  ) : (
                    <span className="font-display text-[28px] text-text-muted" aria-hidden>
                      {d.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 className="font-display text-[20px] text-ink">
                  <a
                    href={`/developers/${d.slug}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                  >
                    {d.name}
                  </a>
                </h2>
                <p className="mt-auto flex flex-wrap gap-x-3 text-[13.5px] text-text-muted">
                  <span>
                    {d.projects === 1 ? t.projectsOne : format(t.projects, { count: d.projects })}
                  </span>
                  {d.establishedYear && (
                    <span>{format(t.founded, { year: d.establishedYear })}</span>
                  )}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
