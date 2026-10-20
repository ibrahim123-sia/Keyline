"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { account } from "@/lib/i18n";

const items: Array<{ key: keyof typeof account.nav; href: string }> = [
  { key: "overview", href: "/account" },
  { key: "saved", href: "/account/saved" },
  { key: "searches", href: "/account/searches" },
  { key: "tours", href: "/account/tours" },
  { key: "inquiries", href: "/account/inquiries" },
  { key: "chats", href: "/account/chats" },
  { key: "compare", href: "/account/compare" },
  { key: "profile", href: "/account/profile" },
  { key: "notifications", href: "/account/notifications" },
  { key: "privacy", href: "/account/privacy" },
];

/** Left menu on desktop, scrollable tabs on phone (12-customer-area.md). */
export function AccountNav({ enabled }: { enabled: Array<keyof typeof account.nav> }) {
  const pathname = usePathname();
  const visible = items.filter((i) => enabled.includes(i.key));
  return (
    <nav aria-label="Account">
      <ul className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {visible.map((item) => {
          const active =
            item.href === "/account" ? pathname === "/account" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-full px-4 py-2 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 md:rounded-button",
                  active ? "bg-ink text-surface" : "text-ink hover:bg-surface-muted",
                )}
              >
                {account.nav[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
