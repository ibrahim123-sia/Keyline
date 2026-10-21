import Link from "next/link";
import { cn } from "cn";

const tabs = [
  { key: "posts", label: "Posts", href: "/admin/website/blog" },
  { key: "categories", label: "Categories and tags", href: "/admin/website/blog/categories" },
] as const;

/** Posts | Categories and tags, under the Blog page header. */
export function BlogTabs({ current }: { current: (typeof tabs)[number]["key"] }) {
  return (
    <nav aria-label="Blog" className="mb-5 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium",
            t.key === current
              ? "border-accent text-ink"
              : "border-transparent text-text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
