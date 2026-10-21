import type { EmailBrand } from "./brand";
import { EmailButton, EmailLayout, EmailText } from "./components/email-layout";

/**
 * An email from an editable message template (features/messages): paragraphs from the body
 * text (blank lines between them, line breaks kept) and an optional button.
 */
export function TemplateEmail({
  brand,
  preview,
  body,
  button,
}: {
  brand: EmailBrand;
  preview: string;
  body: string;
  button?: { label: string; href: string } | null;
}) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <EmailLayout brand={brand} preview={preview}>
      {paragraphs.map((p, i) => (
        <EmailText key={i} brand={brand}>
          {p.split("\n").map((line, j, lines) => (
            <span key={j}>
              {line}
              {j < lines.length - 1 && <br />}
            </span>
          ))}
        </EmailText>
      ))}
      {button && (
        <EmailButton brand={brand} href={button.href}>
          {button.label}
        </EmailButton>
      )}
    </EmailLayout>
  );
}
