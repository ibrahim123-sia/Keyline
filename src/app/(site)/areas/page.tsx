import type { Metadata } from "next";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { GuideCard } from "@/components/site/content/guide-card";
import { listPublicGuides } from "@/features/area-guides/public";
import { siteOrigin } from "@/features/site/url";
import { pages } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

export const metadata: Metadata = {
  title: content.areas.title,
  description: content.areas.intro,
  alternates: { canonical: "/areas" },
};

/** /areas (06 §1, §7): every published area guide. */
export default async function AreasPage() {
  const t = content.areas;
  const guides = await listPublicGuides();
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
        {guides.length === 0 ? (
          <p className="rounded-[20px] bg-surface p-8 text-center text-text-muted shadow-soft">
            {t.empty}
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {guides.map((g, i) => (
              <li key={g.id} className="flex">
                <GuideCard guide={g} priority={i < 3} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
