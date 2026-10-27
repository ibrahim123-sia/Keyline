import type { EmailBrand } from "./brand";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailSmall,
  EmailText,
} from "./components/email-layout";

const kindTitle = {
  inquiry: "New question about",
  tour: "Tour request for",
  callback: "Callback request for",
} as const;

/** To the agent (or the agency): a visitor asked about a listing from its page (06 §5). */
export function ListingInquiryEmail({
  brand,
  kind,
  reference,
  title,
  listingUrl,
  name,
  email,
  phone,
  message,
  preferredTime,
  similar,
}: {
  brand: EmailBrand;
  kind: keyof typeof kindTitle;
  reference: string;
  title: string;
  listingUrl: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  preferredTime: string;
  similar: boolean;
}) {
  return (
    <EmailLayout brand={brand} preview={`${kindTitle[kind]} ${reference} from ${name}`}>
      <EmailHeading brand={brand}>
        {kindTitle[kind]} {reference}
      </EmailHeading>
      <EmailText brand={brand}>{title}</EmailText>
      <EmailText brand={brand}>
        <strong>{name}</strong>
        {email ? ` · ${email}` : ""}
        {phone ? ` · ${phone}` : ""}
      </EmailText>
      {preferredTime && <EmailText brand={brand}>Preferred time: {preferredTime}</EmailText>}
      {message && <EmailText brand={brand}>&ldquo;{message}&rdquo;</EmailText>}
      {similar && (
        <EmailText brand={brand}>They would also like to receive similar homes.</EmailText>
      )}
      <EmailButton brand={brand} href={listingUrl}>
        Open the listing
      </EmailButton>
      <EmailSmall brand={brand}>
        Sent from the listing page.{" "}
        {email
          ? `Reply to this email to answer ${name} directly.`
          : `No email was given: call or message ${name}.`}
      </EmailSmall>
    </EmailLayout>
  );
}
