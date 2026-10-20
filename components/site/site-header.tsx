import { Suspense, type ReactNode } from "react";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { site } from "@/lib/i18n";
import { Logo } from "./logo";
import { MobileMenu, type NavItem } from "./mobile-menu";
import { StickyHeader } from "./sticky-header";

/**
 * Public header (02 §5): logo left, main menu centre, account + primary action right;
 * on phone, logo + menu button opening a full-screen sheet. Sticky, white after scroll.
 * Menu items come from Admin -> Website -> Menus (Phase 5); nothing is hard-coded.
 */
export async function SiteHeader({
  nav = [],
  accountSlot,
  actions,
}: {
  nav?: NavItem[];
  accountSlot?: ReactNode;
  actions?: ReactNode;
}) {
  const general = await getSettings("general");
  const logo = await getPublicMedia(general.logoLightId);

  return (
    <StickyHeader>
      <div className="container-site flex h-[72px] items-center justify-between gap-6">
        <Logo agencyName={general.agencyName} logo={logo} />

        {nav.length > 0 && (
          <nav aria-label={site.a11y.mainNavigation} className="hidden lg:block">
            <ul className="flex items-center gap-7">
              {nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    target={item.newTab ? "_blank" : undefined}
                    rel={item.newTab ? "noopener noreferrer" : undefined}
                    className="text-[15px] font-medium text-ink transition-colors duration-150 hover:text-accent"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {actions}
          <Suspense fallback={<span className="hidden h-10 w-20 sm:block" aria-hidden />}>
            {accountSlot}
          </Suspense>
          <MobileMenu nav={nav} agencyName={general.agencyName} />
        </div>
      </div>
    </StickyHeader>
  );
}
