import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { getSettings } from "@/features/settings/queries";
import { site } from "@/lib/i18n";
import { CookieBanner } from "./cookie-banner";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { VisitorTracker } from "./visitor-tracker";

/**
 * Everything around a public page: skip link, header, footer, notifications and the cookie
 * banner. Used by the site layout and by the root 404 (which renders outside that layout).
 */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const legal = await getSettings("legal");
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-surface focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {site.a11y.skipToContent}
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <Toaster position="bottom-center" />
      <VisitorTracker />
      <CookieBanner
        text={legal.cookieBanner.text}
        analyticsLabel={legal.cookieBanner.analyticsLabel}
        marketingLabel={legal.cookieBanner.marketingLabel}
      />
    </>
  );
}
