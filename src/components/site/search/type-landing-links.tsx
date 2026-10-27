import { typeLandingLinks } from "@/features/seo/landing-links";
import { format } from "@/lib/i18n";
import { search as t } from "@/lib/i18n/dictionaries/search";

/** "Old Harbour by property type": links to the area's type landings with enough homes. */
export async function TypeLandingLinks({
  location,
  purpose,
}: {
  location: { slug: string; name: string };
  purpose: "sale" | "rent";
}) {
  const links = await typeLandingLinks(location.slug, purpose);
  if (links.length === 0) return null;
  const root = purpose === "rent" ? "/rent" : "/buy";
  return (
    <nav aria-labelledby="type-landings" className="mt-10 border-t border-border pt-6">
      <h2 id="type-landings" className="text-h3 text-ink">
        {format(t.landing.byType, { area: location.name })}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.slug}>
            <a
              href={`${root}/${location.slug}/${l.slug}`}
              className="inline-flex rounded-full border border-border bg-surface px-3.5 py-1.5 text-[14px] text-ink hover:border-ink/30"
            >
              {format(t.landing.typeLink, { type: l.name, count: l.count })}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
