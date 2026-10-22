import { Column, Img, Link, Row, Section, Text } from "@react-email/components";
import type { EmailBrand } from "./brand";
import { EmailButton, EmailLayout, EmailSmall, EmailText } from "./components/email-layout";

/** One home in an alert email: photo, price, facts and place, linking to its page. */
export type AlertCard = {
  url: string;
  title: string;
  price: string;
  facts: string;
  place: string | null;
  photoUrl: string | null;
  /** e.g. "Price dropped by AED 50,000" or "Now reserved". */
  note?: string | null;
};

function ListingCardBlock({ brand, card }: { brand: EmailBrand; card: AlertCard }) {
  const c = brand.colors;
  return (
    <Section
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        margin: "0 0 12px",
        overflow: "hidden",
      }}
    >
      <Row>
        {card.photoUrl && (
          <Column style={{ width: 168, verticalAlign: "top" }}>
            <Link href={card.url}>
              <Img
                src={card.photoUrl}
                alt=""
                width={168}
                height={112}
                style={{ display: "block", objectFit: "cover" }}
              />
            </Link>
          </Column>
        )}
        <Column style={{ padding: "10px 14px", verticalAlign: "top" }}>
          <Text style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.ink }}>
            {card.price}
          </Text>
          {card.note && (
            <Text style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: c.accent }}>
              {card.note}
            </Text>
          )}
          <Link href={card.url} style={{ color: c.ink, fontSize: 14, textDecoration: "none" }}>
            {card.title}
          </Link>
          <Text style={{ margin: "4px 0 0", fontSize: 13, color: c.textMuted }}>
            {[card.facts, card.place].filter(Boolean).join(" · ")}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

/**
 * Saved-search and saved-home alerts (12 §3): the agency's template text, up to six homes,
 * "View all matches", and the links to manage or stop these alerts (always there).
 */
export function AlertEmail({
  brand,
  preview,
  body,
  cards,
  more,
  button,
  manageUrl,
  unsubscribeUrl,
  unsubscribeLabel,
}: {
  brand: EmailBrand;
  preview: string;
  body: string;
  cards: AlertCard[];
  /** How many more matches the email leaves out. */
  more: number;
  button?: { label: string; href: string } | null;
  manageUrl: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
}) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <EmailLayout brand={brand} preview={preview}>
      {paragraphs.map((p, i) => (
        <EmailText key={i} brand={brand}>
          {p}
        </EmailText>
      ))}
      {cards.map((card) => (
        <ListingCardBlock key={card.url} brand={brand} card={card} />
      ))}
      {more > 0 && (
        <EmailText brand={brand}>
          And {more} more {more === 1 ? "home" : "homes"}.
        </EmailText>
      )}
      {button && (
        <EmailButton brand={brand} href={button.href}>
          {button.label}
        </EmailButton>
      )}
      <EmailSmall brand={brand}>
        <Link href={manageUrl} style={{ color: brand.colors.textMuted }}>
          Manage your alerts
        </Link>
        {" · "}
        <Link href={unsubscribeUrl} style={{ color: brand.colors.textMuted }}>
          {unsubscribeLabel}
        </Link>
      </EmailSmall>
    </EmailLayout>
  );
}
