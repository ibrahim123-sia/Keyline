import { Suspense, type ReactNode } from "react";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { site } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "./account-menu";
import { CurrencyMenu } from "./currency-menu";
import { Logo } from "./logo";
import { MobileMenu, type NavItem } from "./mobile-menu";
import { StickyHeader } from "./sticky-header";

/**
 * Public header (02 §5): logo left, main menu centre, account + primary action right;
 * on phone, logo + menu button opening a full-screen sheet. Sticky, white after scroll.
 * Menu items come from Admin -> Website -> Menus (Phase 5); the primary button and the
 * currencies come from settings. Nothing is hard-coded.
 */
export async function SiteHeader({ nav = [], actions }: { nav?: NavItem[]; actions?: ReactNode }) {
  const [general, market] = await Promise.all([getSettings("general"), getSettings("market")]);
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
            nav={nav}
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
