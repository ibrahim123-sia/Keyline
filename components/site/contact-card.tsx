import { MailIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";
import { cn } from "cn";
import { format, pages } from "@/lib/i18n";

const digits = (phone: string) => phone.replace(/[^\d]/g, "");

/** WhatsApp link with a pre-filled message (06 §5 contact card). */
export function whatsappHref(phone: string, message: string): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * Contact card for project, developer and agent pages: WhatsApp, call and email from the
 * agent or Settings -> Contact. Only the ways that are set are shown.
 */
export function ContactCard({
  title,
  subject,
  pageUrl,
  whatsapp,
  phone,
  email,
  className,
  id,
}: {
  title?: string;
  /** What the visitor asks about, e.g. the project name. */
  subject: string;
  pageUrl: string;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  className?: string;
  id?: string;
}) {
  const t = pages.contactCard;
  if (!whatsapp && !phone && !email) return null;
  const heading = title ?? t.title;
  const link =
    "flex h-12 items-center justify-center gap-2 rounded-button px-5 text-[15px] font-semibold";
  return (
    <section
      id={id}
      aria-label={heading}
      className={cn("flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-soft", className)}
    >
      <h2 className="font-display text-[20px] text-ink">{heading}</h2>
      {whatsapp && (
        <a
          href={whatsappHref(whatsapp, format(t.whatsappMessage, { name: subject, url: pageUrl }))}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(link, "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          <MessageCircleIcon className="size-5" aria-hidden /> {t.whatsapp}
        </a>
      )}
      {phone && (
        <a
          href={`tel:+${digits(phone)}`}
          className={cn(link, "border border-ink/20 text-ink hover:border-ink/40")}
        >
          <PhoneIcon className="size-5" aria-hidden /> {t.call}
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(format(t.emailSubject, { name: subject }))}`}
          className={cn(link, "border border-ink/20 text-ink hover:border-ink/40")}
        >
          <MailIcon className="size-5" aria-hidden /> {t.email}
        </a>
      )}
    </section>
  );
}
