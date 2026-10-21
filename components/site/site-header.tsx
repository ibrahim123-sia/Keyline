import { Suspense, type ReactNode } from "react";
import { getSiteMenus } from "@/features/menus/site";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { site } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "./account-menu";
import { CurrencyMenu } from "./currency-menu";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { MenuLink } from "./menu-link";
import { NavDropdown } from "./nav-dropdown";
import { StickyHeader } from "./sticky-header";

/**
 * Public header (02 §5): logo left, main menu centre, account + primary action right;
 * on phone, logo + menu button opening a full-screen sheet. Sticky, white after scroll.
 * The links come from Admin -> Website -> Menus (header, and the phone menu when it has
 * links); the primary button and the currencies come from settings. Nothing is hard-coded.
 */
export async function SiteHeader({ actions }: { actions?: ReactNode }) {
  const [general, market, menus] = await Promise.all([
    getSettings("general"),
    getSettings("market"),
    getSiteMenus(),
  ]);
  const nav = menus.header.links;
  const phoneNav = menus.mobile.links.length > 0 ? menus.mobile.links : nav;
  const choice = market.visitorCurrencies.some((c) => c.code !== market.baseCurrency.code);
  const logo = await getPublicMedia(general.logoLightId);
  const { label, href } = general.headerButton;
  const button = label && href ? { label, href } : null;

  return (
    <StickyHeader>
      <div className="container-site flex h-[72px] items-center justify-between gap-6">
        <Logo agencyName={general.agencyName} logo={logo} />

        {nav.length > 0 && (
          <nav aria-label={site.a11y.mainNavigation} className="hidden lg:block">
            <ul className="flex items-center gap-7">
              {nav.map((item, i) =>
                item.children.length > 0 ? (
                  <NavDropdown key={`${i}-${item.href}`} link={item} />
                ) : (
                  <li key={`${i}-${item.href}`}>
                    <MenuLink link={item} />
                  </li>
                ),
              )}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {actions}
          {/* Cookies (currency, session) are read in their own boundaries: the rest stays static. */}
          {choice && (
            <div className="hidden sm:block">
              <Suspense fallback={<span className="block h-10 w-16" aria-hidden />}>
                <CurrencyMenu />
              </Suspense>
            </div>
          )}
          <Suspense fallback={<span className="block h-10 w-20" aria-hidden />}>
            <AccountMenu />
          </Suspense>
          {button && (
            <Button asChild size="md" className="hidden lg:inline-flex">
              <a href={button.href}>{button.label}</a>
            </Button>
          )}
          <MobileMenu
            nav={phoneNav}
            agencyName={general.agencyName}
            button={button}
            extras={
              choice ? (
                <Suspense fallback={null}>
                  <CurrencyMenu variant="list" />
                </Suspense>
              ) : null
            }
          />
        </div>
      </div>
    </StickyHeader>
  );
}
