"use client";

import { MenuIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SiteLink } from "@/features/menus/schema";
import { site } from "@/lib/i18n";
import { MenuLink } from "./menu-link";

/**
 * Phone menu: a full-screen sheet with the phone menu (or the header menu), dropdown links
 * listed under their parent, the primary button and `extras` (the currency switcher), 02 §5.
 */
export function MobileMenu({
  nav,
  agencyName,
  button,
  extras,
}: {
  nav: SiteLink[];
  agencyName: string;
  button?: { label: string; href: string } | null;
  extras?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (nav.length === 0 && !button && !extras) return null;
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
        {nav.length > 0 && (
          <nav aria-label={site.a11y.mainNavigation} className="px-4">
            <ul className="flex flex-col">
              {nav.map((item, i) => (
                <li key={`${i}-${item.href}`} className="border-b border-border">
                  <MenuLink
                    link={item}
                    onClick={() => setOpen(false)}
                    className="block py-4 text-lg text-ink"
                  />
                  {item.children.length > 0 && (
                    <ul className="flex flex-col ps-4 pb-3">
                      {item.children.map((c, j) => (
                        <li key={`${j}-${c.href}`}>
                          <MenuLink
                            link={c}
                            onClick={() => setOpen(false)}
                            className="block py-2 text-[16px] text-text-muted hover:text-ink"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="flex flex-col gap-6 px-4 pt-6">
          {button && (
            <a
              href={button.href}
              onClick={() => setOpen(false)}
              className="inline-flex h-12 items-center justify-center rounded-button bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
            >
              {button.label}
            </a>
          )}
          {extras}
        </div>
      </SheetContent>
    </Sheet>
  );
}
