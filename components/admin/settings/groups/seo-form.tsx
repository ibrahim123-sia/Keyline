"use client";

import {
  ListField,
  NumberField,
  SwitchField,
  TextInputField,
  TextareaField,
} from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { FormSection } from "@/components/admin/page-header";
import type { SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

const vars = (list: string) => `Variables: ${list}`;

/** 04 §7 SEO: title patterns, defaults, verification, indexing, organisation schema. */
export function SeoSettingsForm({
  initial,
  readOnly,
}: {
  initial: SettingsOf<"seo">;
  readOnly: boolean;
}) {
  return (
    <SettingsForm group="seo" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection title="Page titles">
            <TextInputField
              label="Site title pattern"
              description={vars("%page%, %agency%")}
              value={value.titlePattern}
              onChange={(titlePattern) => set({ titlePattern })}
              error={errorFor("titlePattern")}
            />
            <TextInputField
              label="Listing titles"
              description={vars("%beds%, %type%, %purpose%, %area%, %price%, %agency%")}
              value={value.listingTitlePattern}
              onChange={(listingTitlePattern) => set({ listingTitlePattern })}
              error={errorFor("listingTitlePattern")}
            />
            <TextInputField
              label="Project titles"
              description={vars("%project%, %developer%, %area%")}
              value={value.projectTitlePattern}
              onChange={(projectTitlePattern) => set({ projectTitlePattern })}
              error={errorFor("projectTitlePattern")}
            />
            <TextInputField
              label="Area guide titles"
              description={vars("%area%")}
              value={value.areaTitlePattern}
              onChange={(areaTitlePattern) => set({ areaTitlePattern })}
              error={errorFor("areaTitlePattern")}
            />
            <TextInputField
              label="Blog post titles"
              description={vars("%title%")}
              value={value.postTitlePattern}
              onChange={(postTitlePattern) => set({ postTitlePattern })}
              error={errorFor("postTitlePattern")}
            />
          </FormSection>

          <FormSection
            title="Defaults"
            description="Used when a page has no description or share image of its own."
          >
            <TextareaField
              label="Meta description"
              rows={3}
              maxLength={300}
              value={value.defaultMetaDescription}
              onChange={(defaultMetaDescription) => set({ defaultMetaDescription })}
              error={errorFor("defaultMetaDescription")}
            />
            <MediaPicker
              label="Share image"
              description="1200×630 works best (the share crop is used)."
              value={value.defaultOgImageId}
              onChange={(defaultOgImageId) => set({ defaultOgImageId })}
              error={errorFor("defaultOgImageId")}
            />
          </FormSection>

          <FormSection title="Search engines">
            <SwitchField
              label="Let search engines list this site"
              description={
                value.allowIndexing
                  ? "On: pages can appear in Google and Bing."
                  : "Off: every page asks search engines not to list it (use this for test sites)."
              }
              checked={value.allowIndexing}
              onChange={(allowIndexing) => set({ allowIndexing })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInputField
                label="Google Search Console code"
                description="Only the code from the verification meta tag."
                value={value.googleVerification}
                onChange={(googleVerification) =>
                  set({ googleVerification: googleVerification.trim() })
                }
                error={errorFor("googleVerification")}
              />
              <TextInputField
                label="Bing Webmaster code"
                value={value.bingVerification}
                onChange={(bingVerification) => set({ bingVerification: bingVerification.trim() })}
                error={errorFor("bingVerification")}
              />
            </div>
          </FormSection>

          <FormSection
            title="Organisation details"
            description="Tells search engines who runs the site (structured data)."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInputField
                label="Name"
                value={value.organisation.name}
                onChange={(name) => set({ organisation: { ...value.organisation, name } })}
                error={errorFor("organisation.name")}
              />
              <TextInputField
                label="Phone"
                type="tel"
                value={value.organisation.phone}
                onChange={(phone) => set({ organisation: { ...value.organisation, phone } })}
                error={errorFor("organisation.phone")}
              />
            </div>
            <TextareaField
              label="Address"
              rows={2}
              value={value.organisation.address}
              onChange={(address) => set({ organisation: { ...value.organisation, address } })}
              error={errorFor("organisation.address")}
            />
            <MediaPicker
              label="Logo"
              value={value.organisation.logoId}
              onChange={(logoId) => set({ organisation: { ...value.organisation, logoId } })}
              error={errorFor("organisation.logoId")}
            />
            <ListField
              label="Social profiles"
              description="Full addresses (https://…) of the agency's official profiles."
              placeholder="https://"
              max={10}
              value={value.organisation.sameAs}
              onChange={(sameAs) => set({ organisation: { ...value.organisation, sameAs } })}
              error={errorFor("organisation.sameAs")}
            />
          </FormSection>

          <FormSection title="Listing and landing pages">
            <NumberField
              label="Sold or rented listings leave search after"
              suffix="days (0 = straight away)"
              min={0}
              max={3650}
              step={1}
              value={value.soldListingDropDays}
              onChange={(v) => set({ soldListingDropDays: v ?? 0 })}
              error={errorFor("soldListingDropDays")}
            />
            <NumberField
              label="Area + type landing pages need at least"
              suffix="listings"
              min={1}
              max={100}
              step={1}
              value={value.landingTypeMinListings}
              onChange={(v) => set({ landingTypeMinListings: v ?? 1 })}
              error={errorFor("landingTypeMinListings")}
            />
            <NumberField
              label="Landing pages with fewer listings than this are not indexed"
              suffix="listings"
              min={0}
              max={100}
              step={1}
              value={value.thinPageMinListings}
              onChange={(v) => set({ thinPageMinListings: v ?? 0 })}
              error={errorFor("thinPageMinListings")}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
