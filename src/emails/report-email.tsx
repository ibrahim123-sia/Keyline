import { Column, Link, Row, Section, Text } from "@react-email/components";
import type { EmailBrand } from "./brand";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailSmall,
  EmailText,
} from "./components/email-layout";

/** One key number in the weekly report email, already formatted. */
export type ReportEmailKpi = { label: string; value: string; change: string | null };

/** The weekly report email (13 §1 internal "weekly report"): key numbers and the links. */
export function WeeklyReportEmail({
  brand,
  preview,
  heading,
  intro,
  kpis,
  reportUrl,
  reportLabel,
  pdfUrl,
  pdfLabel,
  note,
}: {
  brand: EmailBrand;
  preview: string;
  heading: string;
  intro: string;
  kpis: ReportEmailKpi[];
  reportUrl: string;
  reportLabel: string;
  pdfUrl: string;
  pdfLabel: string;
  note: string;
}) {
  const c = brand.colors;
  return (
    <EmailLayout brand={brand} preview={preview}>
      <EmailHeading brand={brand}>{heading}</EmailHeading>
      <EmailText brand={brand}>{intro}</EmailText>
      <Section style={{ border: `1px solid ${c.border}`, borderRadius: 14, margin: "0 0 16px" }}>
        {kpis.map((k, i) => (
          <Row
            key={k.label}
            style={{ borderTop: i === 0 ? "none" : `1px solid ${c.border}`, padding: "0 16px" }}
          >
            <Column>
              <Text style={{ color: c.textMuted, fontSize: 14, margin: "10px 0" }}>{k.label}</Text>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: 700, margin: "10px 0 0" }}>
                {k.value}
              </Text>
              {k.change && (
                <Text style={{ color: c.textMuted, fontSize: 12, margin: "0 0 10px" }}>
                  {k.change}
                </Text>
              )}
            </Column>
          </Row>
        ))}
      </Section>
      <EmailButton brand={brand} href={reportUrl}>
        {reportLabel}
      </EmailButton>
      <EmailText brand={brand}>
        <Link href={pdfUrl} style={{ color: c.accent }}>
          {pdfLabel}
        </Link>
      </EmailText>
      <EmailSmall brand={brand}>{note}</EmailSmall>
    </EmailLayout>
  );
}
