"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { site } from "@/lib/i18n";

export type NavItem = { label: string; href: string; newTab?: boolean };

/** Phone menu: a full-screen sheet with the header menu (02 §5). */
export function MobileMenu({ nav, agencyName }: { nav: NavItem[]; agencyName: string }) {
  const [open, setOpen] = useState(false);
  if (nav.length === 0) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="lg:hidden"
          aria-label={site.a11y.openMenu}
        >
          <MenuIcon className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-none bg-bg sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-normal">{agencyName}</SheetTitle>
        </SheetHeader>
        <nav aria-label={site.a11y.mainNavigation} className="px-4">
          <ul className="flex flex-col">
            {nav.map((item) => (
              <li key={item.href} className="border-b border-border">
                <a
                  href={item.href}
                  target={item.newTab ? "_blank" : undefined}
                  rel={item.newTab ? "noopener noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                  className="block py-4 text-lg text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
