import { getSiteMenus } from "@/features/menus/site";
import type { SiteLink } from "@/features/menus/schema";
import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { socialKeys } from "@/features/settings/schema";
import { currentYear } from "@/features/site/time";
import { format, pages, site } from "@/lib/i18n";
import { CookieSettingsLink } from "./cookie-banner";
import { Logo } from "./logo";
import { MenuLink } from "./menu-link";

type FooterColumn = { title: string; links: SiteLink[] };

const socialLabels: Record<(typeof socialKeys)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
};

/**
 * Footer (02 §5, 06 §2, 08 §2): dark ink, logo + short text, contact details, link columns
 * (the three footer menus), social links, legal line with the licence number, cookie
 * settings and "Powered by Lintel" (cannot be removed).
 */
export async function SiteFooter({
  legalLinks = [],
}: {
  legalLinks?: Array<{ label: string; href: string }>;
}) {
  const [general, contact, year, menus] = await Promise.all([
    getSettings("general"),
    getSettings("contact"),
    currentYear(),
    getSiteMenus(),
  ]);
  const columns: FooterColumn[] = [menus.footer_1, menus.footer_2, menus.footer_3]
    .filter((m) => m.links.length > 0)
    .map((m) => ({ title: m.title || site.footer.links, links: m.links }));
  const logo = await getPublicMedia(general.logoDarkId);
  const socials = socialKeys.filter((k) => contact.socials[k]);
  const hasContact = Boolean(
    contact.phone || contact.email || contact.address || contact.openingHours,
  );

  return (
    <footer className="bg-ink text-surface/80">
      <div className="container-site grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] lg:py-20">
        <div className="max-w-sm space-y-4">
          <Logo agencyName={general.agencyName} logo={logo} inverted />
          {general.shortDescription && (
            <p className="text-[15px] leading-relaxed">{general.shortDescription}</p>
          )}
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={site.footer.social}>
              {socials.map((k) => (
                <li key={k}>
                  <a
                    href={contact.socials[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex rounded-full border border-surface/20 px-3 py-1 text-[13px] text-surface/85 transition-colors hover:border-surface/50 hover:text-surface"
                  >
                    {socialLabels[k]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {hasContact && (
          <section aria-labelledby="footer-contact">
            <h2 id="footer-contact" className="mb-4 text-eyebrow text-surface">
              {pages.footer.contact}
            </h2>
            <dl className="space-y-2.5 text-[15px]">
              {contact.phone && (
                <div>
                  <dt className="sr-only">{pages.footer.phone}</dt>
                  <dd>
                    <a
                      href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                      className="hover:text-surface"
                    >
                      {contact.phone}
                    </a>
                  </dd>
                </div>
              )}
              {contact.email && (
                <div>
                  <dt className="sr-only">{pages.footer.email}</dt>
                  <dd>
                    <a href={`mailto:${contact.email}`} className="hover:text-surface">
                      {contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {contact.address && (
                <div>
                  <dt className="sr-only">{pages.footer.address}</dt>
                  <dd className="whitespace-pre-line">{contact.address}</dd>
                </div>
              )}
              {contact.openingHours && (
                <div>
                  <dt className="sr-only">{pages.footer.hours}</dt>
                  <dd className="whitespace-pre-line text-surface/70">{contact.openingHours}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
        {columns.map((col, i) => (
          <nav key={i} aria-label={col.title}>
            <h2 className="mb-4 text-eyebrow text-surface">{col.title}</h2>
            <ul className="space-y-2.5">
              {col.links.map((l, j) => (
                <li key={`${j}-${l.href}`}>
                  <MenuLink link={l} className="text-[15px] text-surface/80 hover:text-surface" />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-surface/10">
        <div className="container-site flex flex-col gap-3 py-6 text-sm md:flex-row md:items-center md:justify-between">
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
      </div>
    </footer>
  );
}
