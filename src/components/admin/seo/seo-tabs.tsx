import Link from "next/link";
import { cn } from "cn";

const tabs = [
  { key: "redirects", label: "Redirects", href: "/admin/website/seo" },
  { key: "not-found", label: "404 monitor", href: "/admin/website/seo/not-found" },
  { key: "report", label: "SEO report", href: "/admin/website/seo/report" },
] as const;

/** Website -> SEO sections (separate pages, so each list keeps its own filters in the URL). */
export function SeoTabs({
  current,
  badges = {},
}: {
  current: (typeof tabs)[number]["key"];
  badges?: Record<string, number>;
}) {
  return (
    <nav aria-label="SEO sections" className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-medium",
            t.key === current
              ? "border-ink text-ink"
              : "border-transparent text-text-muted hover:text-ink",
          )}
        >
          {t.label}
          {badges[t.key] ? (
            <span className="rounded-full bg-surface-muted px-1.5 text-[11.5px] tabular">
              {badges[t.key]}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
