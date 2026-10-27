import type { SiteLink } from "@/features/menus/schema";
import { site } from "@/lib/i18n";

export const menuLinkClass =
  "text-[15px] font-medium text-ink transition-colors duration-150 hover:text-accent";

/** A menu link (header, phone menu, footer); one that opens a new tab says so. */
export function MenuLink({
  link,
  className = menuLinkClass,
  onClick,
}: {
  link: Pick<SiteLink, "label" | "href" | "newTab">;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={link.href}
      target={link.newTab ? "_blank" : undefined}
      rel={link.newTab ? "noopener noreferrer" : undefined}
      className={className}
      onClick={onClick}
    >
      {link.label}
      {link.newTab && <span className="sr-only"> {site.a11y.newTab}</span>}
    </a>
  );
}
