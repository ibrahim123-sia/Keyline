import type { Metadata } from "next";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { MediaImage } from "@/components/site/media-image";
import { listPublicAgents } from "@/features/agents/public";
import { siteOrigin } from "@/features/site/url";
import { pages } from "@/lib/i18n";

export const metadata: Metadata = {
  title: pages.agents.title,
  description: pages.agents.intro,
  alternates: { canonical: "/agents" },
};

/** /agents (06 §8): the team grid. */
export default async function AgentsPage() {
  const t = pages.agents;
  const agents = await listPublicAgents();
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
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map((a, i) => (
            <li key={a.id}>
              <article className="relative flex h-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-soft transition-shadow hover:shadow-md">
                {a.photo ? (
                  <MediaImage
                    src={a.photo.url}
                    alt={a.photo.alt}
                    sizes="(min-width: 1280px) 300px, (min-width: 640px) 50vw, 100vw"
                    aspect="1 / 1"
                    color={a.photo.dominantColor}
                    priority={i < 4}
                    maxWidth={828}
                  />
                ) : (
                  <div
                    className="flex aspect-square w-full items-center justify-center bg-accent-soft font-display text-[48px] text-accent"
                    aria-hidden
                  >
                    {a.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1.5 p-5">
                  <h2 className="font-display text-[20px] text-ink">
                    <a
                      href={`/agents/${a.slug}`}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {a.name}
                    </a>
                  </h2>
                  {a.title && <p className="text-[14px] text-text">{a.title}</p>}
                  {a.languages.length > 0 && (
                    <p className="mt-auto pt-2 text-[13px] text-text-muted">
                      <span className="sr-only">{t.languages}: </span>
                      {a.languages.join(" · ")}
                    </p>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
