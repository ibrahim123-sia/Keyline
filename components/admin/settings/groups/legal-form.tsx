"use client";

import { NumberField, SelectField, TextInputField, TextareaField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import type { SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

type Legal = SettingsOf<"legal">;
const pageFields: Array<
  [
    keyof Pick<Legal, "privacyPageId" | "termsPageId" | "cookiePageId" | "howWeVerifyPageId">,
    string,
  ]
> = [
  ["privacyPageId", "Privacy policy"],
  ["termsPageId", "Terms of use"],
  ["cookiePageId", "Cookie policy"],
  ["howWeVerifyPageId", "How we verify listings"],
];

/** Radix Select cannot use "" as a value, so "no page" has its own. */
const NONE = "__none";

/** 04 §11 Legal and privacy: policy pages, cookie banner, data retention. */
export function LegalSettingsForm({
  initial,
  readOnly,
  pages,
}: {
  initial: Legal;
  readOnly: boolean;
  /** Published pages to link to (from Website -> Pages). */
  pages: Array<{ id: string; title: string }>;
}) {
  return (
    <SettingsForm group="legal" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection
            title="Policy pages"
            description={
              pages.length
                ? "Linked from the footer, the cookie banner and sign-up forms."
                : "Create these pages in Website -> Pages, then choose them here."
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {pageFields.map(([key, label]) => (
                <SelectField
                  key={key}
                  label={label}
                  value={value[key] ?? ""}
                  onChange={(id) => set({ [key]: id === NONE ? null : id } as Partial<Legal>)}
                  options={[
                    { value: NONE, label: "None" },
                    ...pages.map((p) => ({ value: p.id, label: p.title })),
                  ]}
                  placeholder={pages.length ? "Choose a page" : "No pages yet"}
                  disabled={pages.length === 0}
                  error={errorFor(key)}
                />
              ))}
            </div>
          </FormSection>

          <FormSection title="Cookie banner">
            <TextareaField
              label="Text"
              rows={3}
              maxLength={600}
              value={value.cookieBanner.text}
              onChange={(text) => set({ cookieBanner: { ...value.cookieBanner, text } })}
              error={errorFor("cookieBanner.text")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInputField
                label="Analytics cookies label"
                maxLength={80}
                value={value.cookieBanner.analyticsLabel}
                onChange={(analyticsLabel) =>
                  set({ cookieBanner: { ...value.cookieBanner, analyticsLabel } })
                }
                error={errorFor("cookieBanner.analyticsLabel")}
              />
              <TextInputField
                label="Marketing cookies label"
                maxLength={80}
                value={value.cookieBanner.marketingLabel}
                onChange={(marketingLabel) =>
                  set({ cookieBanner: { ...value.cookieBanner, marketingLabel } })
                }
                error={errorFor("cookieBanner.marketingLabel")}
              />
            </div>
          </FormSection>

          <FormSection
            title="Data retention"
            description="Old personal data is removed automatically."
          >
            <NumberField
              label="Delete visitor chats (not signed in) after"
              suffix="months"
              min={1}
              max={120}
              step={1}
              value={value.retention.guestChatMonths}
              onChange={(v) => set({ retention: { ...value.retention, guestChatMonths: v ?? 12 } })}
              error={errorFor("retention.guestChatMonths")}
            />
            <NumberField
              label="Anonymise lost leads after"
              suffix="months"
              min={1}
              max={120}
              step={1}
              value={value.retention.anonymiseLostLeadsMonths}
              onChange={(v) =>
                set({ retention: { ...value.retention, anonymiseLostLeadsMonths: v ?? 24 } })
              }
              error={errorFor("retention.anonymiseLostLeadsMonths")}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
