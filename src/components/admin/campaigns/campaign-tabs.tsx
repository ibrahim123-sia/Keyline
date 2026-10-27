import Link from "next/link";
import { cn } from "cn";

const tabs = [
  { key: "links", label: "Links", href: "/admin/campaigns" },
  { key: "report", label: "Report", href: "/admin/campaigns/report" },
  { key: "newsletter", label: "Newsletter", href: "/admin/campaigns/newsletter" },
] as const;

/** Links | Report | Newsletter, under the Campaigns page header. */
export function CampaignTabs({ current }: { current: (typeof tabs)[number]["key"] }) {
  return (
    <nav aria-label="Campaigns" className="mb-5 flex gap-1 border-b border-border">
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
