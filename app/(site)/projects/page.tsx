import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { ProjectCard } from "@/components/site/projects/project-card";
import { Button } from "@/components/ui/button";
import {
  listPublicProjects,
  parseProjectFilters,
  publicProjectFilterOptions,
} from "@/features/projects/public";
import { visitorCurrency } from "@/features/site/currency";
import { siteOrigin } from "@/features/site/url";
import { projectStatuses } from "@/db/schema/projects";
import { format, pages } from "@/lib/i18n";

export const metadata: Metadata = {
  title: pages.projects.title,
  description: pages.projects.intro,
  alternates: { canonical: "/projects" },
};

const select = "h-11 w-full rounded-input border border-input bg-surface px-3 text-[15px] text-ink";

/** /projects (06 §1, §6): published off-plan projects with simple filters in the URL. */
export default async function ProjectsPage(props: PageProps<"/projects">) {
  const t = pages.projects;
  const filters = parseProjectFilters(await props.searchParams);
  const [projects, options, { code, rates }] = await Promise.all([
    listPublicProjects(filters),
    publicProjectFilterOptions(),
    visitorCurrency(),
  ]);
  const filtered = Boolean(filters.area || filters.developer || filters.status || filters.handover);

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

        <form
          method="get"
          aria-label={t.filters}
          className="grid gap-3 rounded-[20px] bg-surface p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            {t.area}
            <select name="area" defaultValue={filters.area ?? ""} className={select}>
              <option value="">{t.any}</option>
              {options.areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            {t.developer}
            <select name="developer" defaultValue={filters.developer ?? ""} className={select}>
              <option value="">{t.any}</option>
              {options.developers.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            {t.status}
            <select name="status" defaultValue={filters.status ?? ""} className={select}>
              <option value="">{t.any}</option>
              {projectStatuses.map((s) => (
                <option key={s} value={s}>
                  {t.statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
            {t.handover}
            <select
              name="handover"
              defaultValue={filters.handover ? String(filters.handover) : ""}
              className={select}
            >
              <option value="">{t.any}</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" size="md" className="h-11">
              {t.apply}
            </Button>
            {filtered && (
              <Link
                href="/projects"
                className="inline-flex h-11 items-center px-2 text-[15px] font-semibold text-ink underline underline-offset-4"
              >
                {t.clear}
              </Link>
            )}
          </div>
        </form>

        <p role="status" className="text-[15px] font-semibold text-ink">
          {projects.length === 1 ? t.countOne : format(t.count, { count: projects.length })}
        </p>
        {projects.length === 0 ? (
          <p className="rounded-[20px] bg-surface p-8 text-center text-text-muted shadow-soft">
            {t.empty}
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p, i) => (
              <li key={p.id} className="flex">
                <ProjectCard
                  project={p}
                  visitorCurrency={code}
                  rates={rates}
                  priority={i < 3}
                  headingLevel={2}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
