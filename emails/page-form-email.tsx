import type { EmailBrand } from "./brand";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailSmall,
  EmailText,
} from "./components/email-layout";

const titles = {
  contact: "New message from the website",
  callback: "Callback request",
  valuation: "Valuation request",
  list_property: "A property to list",
  newsletter: "New newsletter signup",
} as const;

/** To the agency: a visitor sent a form from a page builder page (06 §10). */
export function PageFormEmail({
  brand,
  formType,
  name,
  email,
  phone,
  message,
  details,
  pageTitle,
  pageUrl,
}: {
  brand: EmailBrand;
  formType: keyof typeof titles;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  details: Array<[string, string]>;
  pageTitle: string | null;
  pageUrl: string | null;
}) {
  const who = name || email || phone || "A visitor";
  return (
    <EmailLayout brand={brand} preview={`${titles[formType]}: ${who}`}>
      <EmailHeading brand={brand}>{titles[formType]}</EmailHeading>
      <EmailText brand={brand}>
        <strong>{who}</strong>
        {email && email !== who ? ` · ${email}` : ""}
        {phone && phone !== who ? ` · ${phone}` : ""}
      </EmailText>
      {details.map(([label, value]) => (
        <EmailText key={label} brand={brand}>
          {label}: {value}
        </EmailText>
      ))}
      {message && <EmailText brand={brand}>&ldquo;{message}&rdquo;</EmailText>}
      {pageUrl && (
        <EmailButton brand={brand} href={pageUrl}>
          Open the page
        </EmailButton>
      )}
      <EmailSmall brand={brand}>
        {pageTitle ? `Sent from the page “${pageTitle}”. ` : "Sent from the website. "}
        {email
          ? `Reply to this email to answer ${name || "them"} directly.`
          : phone
            ? `No email was given: call or message ${name || "them"}.`
            : ""}
      </EmailSmall>
    </EmailLayout>
  );
}
