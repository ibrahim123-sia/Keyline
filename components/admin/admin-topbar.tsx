"use client";

import { ExternalLinkIcon, MenuIcon, MoonIcon, SparklesIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { admin } from "@/lib/i18n";
import { AdminNavList } from "./admin-sidebar";

/** Top bar (02 §4): assistant input, theme switch, account menu. */
export function AdminTopbar({
  theme,
  onToggleTheme,
  userMenu,
}: {
  theme: "light" | "dark";
  onToggleTheme?: () => void;
  userMenu?: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6">
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={admin.topbar.openNav}
          >
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{admin.brand}</SheetTitle>
          </SheetHeader>
          <AdminNavList onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative max-w-xl flex-1">
        <SparklesIcon
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <label htmlFor="admin-assistant-input" className="sr-only">
          {admin.topbar.assistantPlaceholder}
        </label>
        <input
          id="admin-assistant-input"
          type="text"
          placeholder={admin.topbar.assistantPlaceholder}
          className="h-9 w-full rounded-md border border-input bg-muted ps-9 pe-3 text-[13.5px] text-ink outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-ring/40"
          disabled
        />
      </div>

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/" target="_blank" aria-label={admin.nav.viewSite}>
            <ExternalLinkIcon />
          </Link>
        </Button>
        {onToggleTheme && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            aria-label={admin.topbar.toggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        )}
        {userMenu}
      </div>
    </header>
  );
}
