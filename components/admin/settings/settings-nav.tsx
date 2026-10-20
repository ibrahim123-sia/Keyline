"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/** Settings tabs (04): one per group, then admin users and the audit log (04 §12). */
export const settingsTabs = [
  { href: "/admin/settings/general", label: "General" },
  { href: "/admin/settings/branding", label: "Branding" },
  { href: "/admin/settings/market", label: "Market" },
  { href: "/admin/settings/contact", label: "Contact" },
  { href: "/admin/settings/leads", label: "Leads and CRM" },
  { href: "/admin/settings/viewings", label: "Viewings" },
  { href: "/admin/settings/seo", label: "SEO" },
  { href: "/admin/settings/ai", label: "AI" },
  { href: "/admin/settings/notifications", label: "Notifications" },
  { href: "/admin/settings/legal", label: "Legal and privacy" },
  { href: "/admin/settings/security", label: "Security" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {settingsTabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap",
                  active
                    ? "bg-accent-soft font-semibold text-ink"
                    : "text-text-muted hover:bg-muted hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
