import Link from "next/link";
import type { ReactNode } from "react";
import { FormSection } from "@/components/admin/page-header";
import type { ReportItem, SeoReport } from "@/features/seo/report";
import { RunCheckButton } from "./run-check-button";

const SHOW = 50;

const kinds: Record<ReportItem["kind"], string> = {
  listing: "Listing",
  project: "Project",
  page: "Page",
  post: "Post",
  guide: "Area guide",
  developer: "Developer",
  agent: "Agent",
  landing: "Area page",
};

function Items({ items }: { items: ReportItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.slice(0, SHOW).map((i) => (
        <li
          key={`${i.kind}-${i.path}`}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-[13.5px] text-ink">
              <span className="me-2 rounded bg-surface-muted px-1.5 py-0.5 text-[11.5px] text-text-muted">
                {kinds[i.kind]}
              </span>
              {i.name}
            </p>
            <p className="truncate font-mono text-[12px] text-text-muted">
              {i.path}
              {i.detail ? ` · ${i.detail}` : ""}
            </p>
          </div>
          <Link
            href={i.edit}
            className="shrink-0 text-[12.5px] font-medium text-ink hover:underline"
          >
            Fix
          </Link>
        </li>
      ))}
      {items.length > SHOW && (
        <li className="py-2 text-[12.5px] text-text-muted">…and {items.length - SHOW} more</li>
      )}
    </ul>
  );
}

function Check({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <FormSection
      title={`${title} (${count})`}
      description={description}
      actions={
        count === 0 ? (
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[12px] font-medium text-success">
            All good
          </span>
        ) : undefined
      }
    >
      {count > 0 ? children : <p className="text-[13px] text-text-muted">Nothing to fix.</p>}
    </FormSection>
  );
}

/** Website -> SEO -> SEO report (08 §6). */
export function SeoReportView({
  report,
  timeZone,
  readOnly,
}: {
  report: SeoReport;
  timeZone: string;
  readOnly?: boolean;
}) {
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  const { crawl } = report;
  const broken = crawl.result?.broken ?? [];
  const redirected = crawl.result?.redirected ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Check
        title="Broken internal links"
        description={
          crawl.result
            ? `From the weekly check of ${crawl.result.pages} pages and ${crawl.result.links} links, ${date.format(new Date(crawl.result.checkedAt))}${crawl.result.truncated ? " (stopped at its limits)" : ""}.`
            : "The weekly check has not run yet."
        }
        count={broken.length}
      >
        <ul className="divide-y divide-border">
          {broken.slice(0, SHOW).map((b) => (
            <li key={b.href} className="py-2">
              <p className="font-mono text-[12.5px] text-ink">
                {b.href} <span className="text-danger">({b.status || "no answer"})</span>
              </p>
              <p className="text-[12px] text-text-muted">Linked from {b.foundOn.join(", ")}</p>
            </li>
          ))}
        </ul>
      </Check>
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && <RunCheckButton pending={crawl.pending} />}
        {redirected.length > 0 && (
          <p className="text-[12.5px] text-text-muted">
            {redirected.length} link{redirected.length === 1 ? "" : "s"} go through a redirect, e.g.{" "}
            {redirected[0]!.href} on {redirected[0]!.foundOn[0]}: link to the new address.
          </p>
        )}
      </div>
      <Check
        title="Duplicate titles"
        description="Pages that show the same title in search results compete with each other."
        count={report.duplicateTitles.length}
      >
        <ul className="flex flex-col gap-3">
          {report.duplicateTitles.slice(0, SHOW).map((d) => (
            <li key={d.title}>
              <p className="text-[13.5px] font-semibold text-ink">“{d.title}”</p>
              <Items items={d.items} />
            </li>
          ))}
        </ul>
      </Check>
      <Check
        title="Missing descriptions"
        description="No meta description and no text to take one from: search engines pick their own snippet."
        count={report.missingDescriptions.length}
      >
        <Items items={report.missingDescriptions} />
      </Check>
      <Check
        title="Pages without an SEO title"
        description="Builder pages use their page name; give them a title written for search results."
        count={report.missingTitles.length}
      >
        <Items items={report.missingTitles} />
      </Check>
      <Check
        title="Photos without alt text"
        description="Alt text describes a photo to screen readers and image search."
        count={report.missingAlts.length}
      >
        <Items items={report.missingAlts} />
      </Check>
      <Check
        title="Listings with fewer than 5 photos"
        description="Listings with more photos get more clicks."
        count={report.fewPhotos.length}
      >
        <Items items={report.fewPhotos} />
      </Check>
      <Check
        title="Thin pages"
        description="Posts and guides under 300 words, pages with little text, and area pages with too few listings to be indexed."
        count={report.thinPages.length}
      >
        <Items items={report.thinPages} />
      </Check>
    </div>
  );
}
