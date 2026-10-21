import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { legalPageLinks } from "@/features/cms/page-public";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { currentYear } from "@/features/site/time";
import { format, site } from "@/lib/i18n";
import { cms } from "@/lib/i18n/dictionaries/cms";
import { CookieBanner, CookieSettingsLink } from "./cookie-banner";
import { Logo } from "./logo";

/**
 * The landing template (08 §1): for ad campaigns. Logo and phone at the top, no menus, and
 * only the legal line at the bottom, so visitors stay with the offer.
 */
export async function LandingChrome({ children }: { children: ReactNode }) {
  const [general, contact, legal, year, links] = await Promise.all([
    getSettings("general"),
    getSettings("contact"),
    getSettings("legal"),
    currentYear(),
    legalPageLinks(),
  ]);
  const logo = await getPublicMedia(general.logoLightId);
  const whatsapp = contact.whatsapp.replace(/\D/g, "");
  const legalLinks = [links.privacy, links.terms].filter((l) => l !== null);
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-surface focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {site.a11y.skipToContent}
      </a>
      <header className="border-b border-border bg-surface">
        <div className="container-site flex h-[68px] items-center justify-between gap-4">
          <Logo agencyName={general.agencyName} logo={logo} />
          <div className="flex items-center gap-2">
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border px-3 text-[14px] font-semibold text-ink hover:border-ink/40"
              >
                <MessageCircleIcon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{cms.landing.whatsapp}</span>
                <span className="sr-only sm:hidden">{cms.landing.whatsapp}</span>
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-accent px-4 text-[14px] font-semibold text-on-accent hover:bg-accent/90"
              >
                <PhoneIcon className="size-4" aria-hidden />
                <span className="sr-only">{cms.landing.call}</span>
                <span className="tabular">{contact.phone}</span>
              </a>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <footer className="bg-ink text-sm text-surface/80">
        <div className="container-site flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>
              {format(site.footer.rights, {
                year,
                agency: general.legalName || general.agencyName,
              })}
            </span>
            {general.licenceNumber && (
              <span>{format(site.footer.licence, { number: general.licenceNumber })}</span>
            )}
            {legalLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-surface">
                {l.label}
              </a>
            ))}
            <CookieSettingsLink className="underline-offset-4 hover:text-surface hover:underline" />
          </div>
          <span className="text-surface/70">{site.meta.poweredBy}</span>
        </div>
      </footer>
      <Toaster position="bottom-center" />
      <CookieBanner
        text={legal.cookieBanner.text}
        analyticsLabel={legal.cookieBanner.analyticsLabel}
        marketingLabel={legal.cookieBanner.marketingLabel}
        policyHref={links.cookies?.href ?? null}
      />
    </>
  );
}
