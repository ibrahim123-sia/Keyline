"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { PortalContainerContext } from "@/components/ui/portal-container";
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
  // Portalled UI (dialogs, menus, popovers) renders here, inside the admin theme scope.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
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
      <PortalContainerContext value={portalContainer}>
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {banner}
          <AdminTopbar theme={optimisticTheme} onToggleTheme={toggle} userMenu={userMenu} />
          <main id="main" className="flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </PortalContainerContext>
      <div ref={setPortalContainer} />
      {/* Top-right, under the top bar: bottom toasts would cover the sticky Save bars. */}
      <Toaster theme={optimisticTheme} position="top-right" offset={{ top: 64 }} />
    </div>
  );
}
