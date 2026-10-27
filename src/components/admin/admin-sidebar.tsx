"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { admin } from "@/lib/i18n";
import { enabledNav, type AdminNavGroup } from "./nav";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups: AdminNavGroup[] = enabledNav();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-0.5">
          {group.label && (
            <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
              {admin.nav[group.label]}
            </p>
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium transition-colors duration-150",
                  active
                    ? "bg-accent-soft text-ink"
                    : "text-text-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <Icon className={cn("size-4", active && "text-accent")} aria-hidden />
                {admin.nav[item.key]}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Desktop sidebar (02 §4 Admin: Sidebar). On phone the same list opens in a sheet. */
export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-border bg-surface lg:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/admin" className="text-[15px] font-bold tracking-tight text-ink">
          {admin.brand}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <AdminNavList />
      </div>
    </aside>
  );
}
