"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { Toaster } from "@/components/ui/sonner";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

/**
 * Admin chrome. The theme is per admin (02 §3) and saved through `saveTheme`; the change
 * shows immediately (optimistic) while the action runs.
 */
export function AdminShell({
  theme,
  saveTheme,
  userMenu,
  banner,
  children,
}: {
  theme: "light" | "dark";
  saveTheme?: (theme: "light" | "dark") => Promise<void>;
  userMenu?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [optimisticTheme, setOptimisticTheme] = useOptimistic(theme);
  const [, startTransition] = useTransition();

  const toggle = saveTheme
    ? () => {
        const next = optimisticTheme === "dark" ? "light" : "dark";
        startTransition(async () => {
          setOptimisticTheme(next);
          await saveTheme(next);
        });
      }
    : undefined;

  return (
    <div
      data-theme-scope
      className={cn(
        "theme-admin flex min-h-screen bg-background text-text",
        optimisticTheme === "dark" && "dark",
      )}
    >
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {banner}
        <AdminTopbar theme={optimisticTheme} onToggleTheme={toggle} userMenu={userMenu} />
        <main id="main" className="flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
      <Toaster theme={optimisticTheme} position="bottom-right" />
    </div>
  );
}
