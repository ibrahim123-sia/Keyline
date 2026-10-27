import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { AdminInviteEmail, ResetPasswordEmail, VerifyEmail } from "@/emails/auth-emails";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import { queueEmail } from "@/features/notifications/email";

/** Better Auth email callbacks: render the branded template and queue `email.send`. */

export async function sendVerificationEmail(
  db: DbOrTx,
  input: { email: string; name: string; url: string },
): Promise<void> {
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(VerifyEmail, { brand, name: input.name, url: input.url }),
  );
  await queueEmail(
    {
      to: input.email,
      subject: `Confirm your email for ${brand.agencyName}`,
      template: "auth.verify-email",
      html,
      text,
    },
    db,
  );
}

export async function sendPasswordResetEmail(
  db: DbOrTx,
  input: { email: string; name: string; url: string },
): Promise<void> {
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(ResetPasswordEmail, { brand, name: input.name, url: input.url }),
  );
  await queueEmail(
    {
      to: input.email,
      subject: "Reset your password",
      template: "auth.reset-password",
      html,
      text,
    },
    db,
  );
}

export async function sendAdminInviteEmail(
  db: DbOrTx,
  input: { email: string; name: string; invitedBy: string; url: string },
): Promise<void> {
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(createElement(AdminInviteEmail, { brand, ...input }));
  await queueEmail(
    {
      to: input.email,
      subject: `You're invited to the ${brand.agencyName} admin portal`,
      template: "auth.admin-invite",
      html,
      text,
    },
    db,
  );
}
