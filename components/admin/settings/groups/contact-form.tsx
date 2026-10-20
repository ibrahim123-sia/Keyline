"use client";

import { ListField, TextInputField, TextareaField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { PinPicker } from "@/components/maps/pin-picker";
import { Button } from "@/components/ui/button";
import { geocodeAddress } from "@/features/locations/actions";
import { socialKeys, type SettingsOf } from "@/features/settings/schema";
import type { LngLat } from "@/lib/geo";
import { SettingsForm } from "../settings-form";

const socialLabels: Record<(typeof socialKeys)[number], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
};

/** 04 §4 Contact: how visitors reach the agency, and where lead alerts go. */
export function ContactSettingsForm({
  initial,
  readOnly,
  mapStyleUrl,
  mapCenter,
}: {
  initial: SettingsOf<"contact">;
  readOnly: boolean;
  mapStyleUrl: string;
  mapCenter: LngLat;
}) {
  return (
    <SettingsForm group="contact" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => (
        <>
          <FormSection
            title="Contact details"
            description="Shown in the header, footer and contact page."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInputField
                label="Main phone"
                type="tel"
                value={value.phone}
                onChange={(phone) => set({ phone })}
                error={errorFor("phone")}
              />
              <TextInputField
                label="WhatsApp number"
                type="tel"
                description="International format, starting with +."
                value={value.whatsapp}
                onChange={(whatsapp) => set({ whatsapp })}
                error={errorFor("whatsapp")}
              />
              <TextInputField
                label="Email"
                type="email"
                value={value.email}
                onChange={(email) => set({ email })}
                error={errorFor("email")}
              />
            </div>
            <TextareaField
              label="Office address"
              rows={2}
              value={value.address}
              onChange={(address) => set({ address })}
              error={errorFor("address")}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-ink">Office on the map</span>
              <PinPicker
                value={value.officePoint}
                onChange={(officePoint) => set({ officePoint })}
                styleUrl={mapStyleUrl}
                fallbackCenter={mapCenter}
                zoom={value.officePoint ? 15 : 10}
                className="h-64"
                onSearch={async (q) => {
                  const res = await geocodeAddress(q);
                  return res.ok ? res.data : { error: res.error };
                }}
              />
              {value.officePoint && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => set({ officePoint: null })}
                >
                  Remove the map pin
                </Button>
              )}
            </div>
            <TextareaField
              label="Opening hours"
              rows={3}
              maxLength={500}
              placeholder={"Mon–Fri 9:00–18:00\nSat 10:00–16:00"}
              value={value.openingHours}
              onChange={(openingHours) => set({ openingHours })}
              error={errorFor("openingHours")}
            />
          </FormSection>

          <FormSection
            title="Social profiles"
            description="Full addresses, starting with https://."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {socialKeys.map((key) => (
                <TextInputField
                  key={key}
                  label={socialLabels[key]}
                  type="url"
                  placeholder="https://"
                  value={value.socials[key]}
                  onChange={(v) => set({ socials: { ...value.socials, [key]: v.trim() } })}
                  error={errorFor(`socials.${key}`)}
                />
              ))}
            </div>
          </FormSection>

          <FormSection
            title="New lead alerts"
            description="Who hears about new leads straight away (agents assigned to a lead are told too)."
          >
            <ListField
              label="Emails"
              placeholder="name@agency.com, then Enter"
              max={10}
              value={value.leadNotifyEmails}
              onChange={(leadNotifyEmails) => set({ leadNotifyEmails })}
              error={errorFor("leadNotifyEmails")}
            />
            <TextInputField
              label="WhatsApp number"
              type="tel"
              value={value.leadNotifyWhatsapp}
              onChange={(leadNotifyWhatsapp) => set({ leadNotifyWhatsapp })}
              error={errorFor("leadNotifyWhatsapp")}
            />
          </FormSection>
        </>
      )}
    </SettingsForm>
  );
}
