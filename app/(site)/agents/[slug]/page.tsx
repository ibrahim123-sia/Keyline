import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { ContactCard } from "@/components/site/contact-card";
import { ListingCard } from "@/components/site/listings/listing-card";
import { MediaImage } from "@/components/site/media-image";
import { getPublicAgent } from "@/features/agents/public";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { cardContext } from "@/features/site/card-context";
import { siteOrigin, siteUrl } from "@/features/site/url";
import { format, pages, site } from "@/lib/i18n";
import { redirectIfMoved } from "@/features/seo/serve";

/** Per request: the slug (and the visitor's currency cookie) decide what renders; data is cached. */
export const instant = false;

export async function generateMetadata(props: PageProps<"/agents/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const a = await getPublicAgent(slug);
  if (!a) {
    await redirectIfMoved(`/agents/${slug}`);
    return { title: site.errors.notFoundTitle };
  }
  const title = a.seo.title || (a.title ? `${a.name}, ${a.title}` : a.name);
  const description = a.seo.description || a.bio?.slice(0, 155) || undefined;
  const og = a.seo.ogImageId ? await getPublicMedia(a.seo.ogImageId) : a.photo;
  return {
    title,
    description,
    alternates: { canonical: a.seo.canonicalUrl || `/agents/${a.slug}` },
    robots: a.seo.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      type: "profile",
      images: og ? [{ url: `${og.url}?w=828&q=75` }] : undefined,
    },
  };
}

/** /agents/[slug] (06 §8): photo, languages, areas, bio, contact buttons, active listings. */
export default async function AgentPage(props: PageProps<"/agents/[slug]">) {
  const { slug } = await props.params;
  const a = await getPublicAgent(slug);
  if (!a) {
    await redirectIfMoved(`/agents/${slug}`);
    notFound();
  }
  const t = pages.agents;
  const [ctx, contact] = await Promise.all([cardContext(), getSettings("contact")]);
  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-10">
        <Breadcrumb
          items={[
            { label: pages.common.home, href: "/" },
            { label: t.title, href: "/agents" },
            { label: a.name },
          ]}
          baseUrl={siteOrigin()}
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="w-48 shrink-0 overflow-hidden rounded-[24px] bg-accent-soft">
              {a.photo ? (
                <MediaImage
                  src={a.photo.url}
                  alt={a.photo.alt || a.name}
                  sizes="192px"
                  aspect="1 / 1"
                  color={a.photo.dominantColor}
                  priority
                  maxWidth={640}
                />
              ) : (
                <div
                  className="flex aspect-square items-center justify-center font-display text-[56px] text-accent"
                  aria-hidden
                >
                  {a.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <h1 className="text-display">{a.name}</h1>
              {a.title && <p className="text-lg text-text">{a.title}</p>}
              <dl className="flex flex-col gap-2 text-[15px]">
                {a.languages.length > 0 && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold text-ink">{t.languages}:</dt>
                    <dd className="text-text">{a.languages.join(", ")}</dd>
                  </div>
                )}
                {a.areas.length > 0 && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold text-ink">{t.areas}:</dt>
                    <dd className="flex flex-wrap gap-x-2 text-text">
                      {a.areas.map((ar, i) => (
                        <span key={ar.slug}>
                          <a href={`/buy/${ar.slug}`} className="underline underline-offset-2">
                            {ar.name}
                          </a>
                          {i < a.areas.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
              {a.bio && (
                <p className="max-w-2xl text-[16px] leading-relaxed whitespace-pre-line text-text">
                  {a.bio}
                </p>
              )}
            </div>
          </header>
          <aside className="flex flex-col gap-2 lg:sticky lg:top-24 lg:self-start">
            <ContactCard
              entity={{ type: "agent", id: a.id }}
              title={format(t.contact, { name: a.name.split(/\s+/)[0]! })}
              subject={a.name}
              pageUrl={siteUrl(`/agents/${a.slug}`)}
              whatsapp={a.whatsapp || contact.whatsapp}
              phone={a.phone || contact.phone}
              email={a.email || contact.email}
            />
            {a.replyTimeText && (
              <p className="px-1 text-[13px] text-text-muted">{a.replyTimeText}</p>
            )}
          </aside>
        </div>

        <section aria-labelledby="agent-listings" className="flex flex-col gap-5">
          <h2 id="agent-listings" className="text-h2">
            {format(t.listings, { name: a.name.split(/\s+/)[0]! })}
          </h2>
          {a.listings.length === 0 ? (
            <p className="text-text-muted">{t.noListings}</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {a.listings.map((l) => (
                <li key={l.id}>
                  <ListingCard listing={l} ctx={ctx} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
