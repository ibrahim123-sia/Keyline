import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import type { EmailBrand } from "../brand";

/** Shared layout: logo or agency name, content card, footer with address and licence. */
export function EmailLayout({
  brand,
  preview,
  children,
}: {
  brand: EmailBrand;
  preview: string;
  children: ReactNode;
}) {
  const c = brand.colors;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: c.bg,
          margin: 0,
          padding: "32px 0",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px" }}>
          <Section style={{ padding: "8px 0 20px" }}>
            {brand.logoUrl ? (
              <Img src={brand.logoUrl} alt={brand.agencyName} height={36} />
            ) : (
              <Text style={{ fontFamily: "Georgia, serif", fontSize: 22, color: c.ink, margin: 0 }}>
                {brand.agencyName}
              </Text>
            )}
          </Section>
          <Section
            style={{
              backgroundColor: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 16,
              padding: "28px 28px 24px",
            }}
          >
            {children}
          </Section>
          <Section style={{ padding: "20px 4px 0" }}>
            <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: "18px", margin: 0 }}>
              {[brand.agencyName, brand.address, brand.phone].filter(Boolean).join(" · ")}
              {brand.licenceNumber ? ` · Licence ${brand.licenceNumber}` : ""}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ brand, children }: { brand: EmailBrand; children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        fontFamily: "Georgia, serif",
        fontWeight: 400,
        fontSize: 26,
        lineHeight: "32px",
        color: brand.colors.ink,
        margin: "0 0 12px",
      }}
    >
      {children}
    </Heading>
  );
}

export function EmailText({ brand, children }: { brand: EmailBrand; children: ReactNode }) {
  return (
    <Text
      style={{ color: brand.colors.text, fontSize: 15, lineHeight: "24px", margin: "0 0 14px" }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({
  brand,
  href,
  children,
}: {
  brand: EmailBrand;
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ padding: "8px 0 16px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: brand.colors.accent,
          color: brand.colors.onAccent,
          borderRadius: 14,
          padding: "13px 22px",
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function EmailSmall({ brand, children }: { brand: EmailBrand; children: ReactNode }) {
  return (
    <>
      <Hr style={{ borderColor: brand.colors.border, margin: "18px 0" }} />
      <Text style={{ color: brand.colors.textMuted, fontSize: 13, lineHeight: "20px", margin: 0 }}>
        {children}
      </Text>
    </>
  );
}
