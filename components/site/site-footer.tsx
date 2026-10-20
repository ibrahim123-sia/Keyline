import { getPublicMedia } from "@/features/media/queries";
import { getSettings } from "@/features/settings/queries";
import { socialKeys } from "@/features/settings/schema";
import { format, site } from "@/lib/i18n";
import { Logo } from "./logo";

export type FooterColumn = {
  title: string;
  links: Array<{ label: string; href: string; newTab?: boolean }>;
};

const socialLabels: Record<(typeof socialKeys)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
};

/**
 * Footer (02 §5, 08 §2): dark ink, logo + short text, link columns (footer menus, Phase 5),
 * social links, licence number and "Powered by Lintel" (cannot be removed).
 */
export async function SiteFooter({
  columns = [],
  legalLinks = [],
}: {
  columns?: FooterColumn[];
  legalLinks?: Array<{ label: string; href: string }>;
}) {
  const [general, contact] = await Promise.all([getSettings("general"), getSettings("contact")]);
  const logo = await getPublicMedia(general.logoDarkId);
  const socials = socialKeys.filter((k) => contact.socials[k]);

  return (
    <footer className="bg-ink text-surface/80">
      <div className="container-site grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:py-20">
        <div className="max-w-sm space-y-4">
          <Logo agencyName={general.agencyName} logo={logo} inverted />
          {general.shortDescription && (
            <p className="text-[15px] leading-relaxed">{general.shortDescription}</p>
          )}
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={site.footer.social}>
              {socials.map((k) => (
                <li key={k}>
                  <a
                    href={contact.socials[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-surface/80 underline-offset-4 hover:text-surface hover:underline"
                  >
                    {socialLabels[k]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-4 text-eyebrow text-surface">{col.title}</h2>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target={l.newTab ? "_blank" : undefined}
                    rel={l.newTab ? "noopener noreferrer" : undefined}
                    className="text-[15px] text-surface/80 hover:text-surface"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-surface/10">
        <div className="container-site flex flex-col gap-3 py-6 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{general.legalName || general.agencyName}</span>
            {general.licenceNumber && (
              <span>{format(site.footer.licence, { number: general.licenceNumber })}</span>
            )}
            {legalLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-surface">
                {l.label}
              </a>
            ))}
          </div>
          <span className="text-surface/70">{site.meta.poweredBy}</span>
        </div>
      </div>
    </footer>
  );
}
