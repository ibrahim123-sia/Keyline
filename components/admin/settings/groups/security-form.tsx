"use client";

import { NumberField, SwitchField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import type { SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

/** 04 §12 Security: 2FA, session lengths, sign-in options, re-sign-in for sensitive changes. */
export function SecuritySettingsForm({
  initial,
  readOnly,
  googleConfigured,
}: {
  initial: SettingsOf<"security">;
  readOnly: boolean;
  /** GOOGLE_CLIENT_ID and secret are set on the server. */
  googleConfigured: boolean;
}) {
  return (
    <SettingsForm group="security" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection
            title="Admins"
            description="Saving changes on this tab needs a recent sign-in."
          >
            <SwitchField
              label="Require two-step verification for admins"
              description={
                value.require2fa
                  ? "Admins must set up an authenticator app before using the portal."
                  : "Not recommended: a stolen password alone would open the portal."
              }
              checked={value.require2fa}
              onChange={(require2fa) => set({ require2fa })}
            />
            <NumberField
              label="Admin session length"
              suffix="hours"
              min={1}
              max={72}
              step={1}
              value={value.adminSessionHours}
              onChange={(v) => set({ adminSessionHours: v ?? 12 })}
              error={errorFor("adminSessionHours")}
            />
            <NumberField
              label="Sign in again for sensitive changes after"
              description="Inviting admins, changing integrations or security."
              suffix="minutes"
              min={1}
              max={240}
              step={1}
              value={value.reauthMinutes}
              onChange={(v) => set({ reauthMinutes: v ?? 15 })}
              error={errorFor("reauthMinutes")}
            />
          </FormSection>

          <FormSection title="Customers">
            <NumberField
              label="Customer session length"
              suffix="days"
              min={1}
              max={90}
              step={1}
              value={value.customerSessionDays}
              onChange={(v) => set({ customerSessionDays: v ?? 30 })}
              error={errorFor("customerSessionDays")}
            />
            <SwitchField
              label="Sign in with Google"
              description={
                googleConfigured
                  ? "Customers can sign up and sign in with their Google account."
                  : "Needs a Google OAuth client on the server (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)."
              }
              checked={value.googleSignIn}
              disabled={!googleConfigured && !value.googleSignIn}
              onChange={(googleSignIn) => set({ googleSignIn })}
            />
          </FormSection>

          <FormSection title="Advanced">
            <SwitchField
              label="Allow custom HTML and scripts in pages"
              description="Only for trusted admins: scripts run on every visitor's browser."
              checked={value.allowCustomHtmlScripts}
              onChange={(allowCustomHtmlScripts) => set({ allowCustomHtmlScripts })}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
