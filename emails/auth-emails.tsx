import type { EmailBrand } from "./brand";
import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailSmall,
  EmailText,
} from "./components/email-layout";

/** Customer: confirm email address (13 §1). */
export function VerifyEmail({
  brand,
  name,
  url,
}: {
  brand: EmailBrand;
  name: string;
  url: string;
}) {
  return (
    <EmailLayout brand={brand} preview={`Confirm your email for ${brand.agencyName}`}>
      <EmailHeading brand={brand}>Confirm your email</EmailHeading>
      <EmailText brand={brand}>
        Hi {name}, thanks for creating an account with {brand.agencyName}.
      </EmailText>
      <EmailText brand={brand}>
        Confirm your email address to save homes, searches and get alerts.
      </EmailText>
      <EmailButton brand={brand} href={url}>
        Confirm my email
      </EmailButton>
      <EmailSmall brand={brand}>
        The link works for 24 hours. If you did not create this account, you can ignore this email.
      </EmailSmall>
    </EmailLayout>
  );
}

/** Customer or admin: password reset (13 §1). */
export function ResetPasswordEmail({
  brand,
  name,
  url,
}: {
  brand: EmailBrand;
  name: string;
  url: string;
}) {
  return (
    <EmailLayout brand={brand} preview="Reset your password">
      <EmailHeading brand={brand}>Reset your password</EmailHeading>
      <EmailText brand={brand}>Hi {name}, we received a request to reset your password.</EmailText>
      <EmailButton brand={brand} href={url}>
        Choose a new password
      </EmailButton>
      <EmailSmall brand={brand}>
        The link works for 1 hour. If you did not ask for this, ignore this email: your password
        stays the same.
      </EmailSmall>
    </EmailLayout>
  );
}

/** Admin invite: the reset link doubles as "set your password" (03: admins are invited by email). */
export function AdminInviteEmail({
  brand,
  name,
  invitedBy,
  url,
}: {
  brand: EmailBrand;
  name: string;
  invitedBy: string;
  url: string;
}) {
  return (
    <EmailLayout brand={brand} preview={`You're invited to the ${brand.agencyName} admin portal`}>
      <EmailHeading brand={brand}>You&apos;re invited</EmailHeading>
      <EmailText brand={brand}>
        Hi {name}, {invitedBy} invited you to the {brand.agencyName} admin portal.
      </EmailText>
      <EmailText brand={brand}>
        Choose a password to get started. You will then set up two-step verification with an
        authenticator app.
      </EmailText>
      <EmailButton brand={brand} href={url}>
        Set my password
      </EmailButton>
      <EmailSmall brand={brand}>The link works for 72 hours.</EmailSmall>
    </EmailLayout>
  );
}
