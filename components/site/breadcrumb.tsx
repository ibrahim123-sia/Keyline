import { ChevronRightIcon } from "lucide-react";
import { cn } from "cn";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb (02 §4) with BreadcrumbList structured data (08 §SEO). The last crumb is the
 * current page.
 */
export function Breadcrumb({
  items,
  className,
  baseUrl,
}: {
  items: Crumb[];
  className?: string;
  /** Absolute site URL for the structured data (e.g. https://agency.example). */
  baseUrl?: string;
}) {
  const jsonLd = baseUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.label,
          ...(c.href ? { item: new URL(c.href, baseUrl).toString() } : {}),
        })),
      }
    : null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[13px] text-text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <a href={c.href} className="hover:text-ink hover:underline">
                  {c.label}
                </a>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "text-ink")}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRightIcon className="size-3.5" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {jsonLd && (
        <script
          type="application/ld+json"
          // "<" is escaped, so nothing in the data can close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }}
        />
      )}
    </nav>
  );
}
