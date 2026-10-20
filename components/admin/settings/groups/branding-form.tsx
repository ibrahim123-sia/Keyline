"use client";

import {
  CheckCircle2Icon,
  HeartIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "cn";
import { ColorField } from "@/components/admin/fields";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { FormSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  bodyFonts,
  defaultsFor,
  displayFonts,
  type ColorToken,
  type SettingsOf,
} from "@/features/settings/schema";
import { fontCssVar } from "@/lib/font-vars";
import { brandingContrastReport, brandingVars } from "@/lib/tokens";
import { SettingsForm } from "../settings-form";

type Branding = SettingsOf<"branding">;

const colorGroups: Array<{ title: string; tokens: Array<[ColorToken, string]> }> = [
  {
    title: "Backgrounds",
    tokens: [
      ["bg", "Page background"],
      ["surface", "Cards"],
      ["surfaceSoft", "Soft bands"],
      ["surfaceMuted", "Chips and CTA blocks"],
      ["photoPlaceholder", "Photo placeholder"],
    ],
  },
  {
    title: "Text",
    tokens: [
      ["ink", "Headings and dark sections"],
      ["inkSoft", "Dark cards"],
      ["text", "Body text"],
      ["textMuted", "Labels and captions"],
    ],
  },
  {
    title: "Accent and states",
    tokens: [
      ["accent", "Accent (buttons, links)"],
      ["accentSoft", "Accent tint"],
      ["success", "Success / verified"],
      ["successSoft", "Success tint"],
      ["danger", "Errors"],
      ["border", "Lines and borders"],
    ],
  },
];

/** 04 §2 Branding: design tokens with a live preview, contrast checker and reset. */
export function BrandingSettingsForm({
  initial,
  readOnly,
  preview,
}: {
  initial: Branding;
  readOnly: boolean;
  preview: { price: string; area: string };
}) {
  return (
    <SettingsForm group="branding" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => {
        const report = brandingContrastReport(value.colors);
        const failing = report.filter((r) => !r.passes);
        const setColor = (key: ColorToken, hex: string) =>
          set({ colors: { ...value.colors, [key]: hex } });
        return (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-6">
              {colorGroups.map((group) => (
                <FormSection key={group.title} title={group.title}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.tokens.map(([key, label]) => (
                      <ColorField
                        key={key}
                        label={label}
                        value={value.colors[key]}
                        onChange={(hex) => setColor(key, hex)}
                        error={errorFor(`colors.${key}`)}
                      />
                    ))}
                  </div>
                </FormSection>
              ))}

              <FormSection
                title="Contrast check"
                description="Text must stand out from its background: at least 4.5:1 (3:1 for icons)."
              >
                <p
                  role="status"
                  className={cn(
                    "flex items-center gap-2 rounded-md p-3 text-[13px] font-medium",
                    failing.length ? "bg-danger/10 text-danger" : "bg-success-soft text-success",
                  )}
                >
                  {failing.length ? (
                    <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                  )}
                  {failing.length
                    ? `${failing.length} of ${report.length} pairs are too low. Some visitors will struggle to read them.`
                    : `All ${report.length} pairs pass.`}
                </p>
                <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
                  {report.map((r) => (
                    <li key={r.label} className="flex items-center gap-3 px-3 py-2">
                      <span
                        aria-hidden
                        className="flex h-7 w-10 shrink-0 items-center justify-center rounded border border-border text-[12px] font-semibold"
                        style={{ color: r.foreground, backgroundColor: r.background }}
                      >
                        Aa
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[12px] font-semibold tabular",
                          r.passes ? "bg-success-soft text-success" : "bg-danger/10 text-danger",
                        )}
                      >
                        {r.ratio.toFixed(2)}:1 {r.passes ? "" : `(needs ${r.minimum}:1)`}
                      </span>
                    </li>
                  ))}
                </ul>
              </FormSection>

              <FormSection title="Fonts">
                <FontChoice
                  label="Headings"
                  fonts={displayFonts}
                  value={value.fontDisplay}
                  onChange={(fontDisplay) => set({ fontDisplay })}
                  sample="Homes with a view"
                />
                <FontChoice
                  label="Body text"
                  fonts={bodyFonts}
                  value={value.fontBody}
                  onChange={(fontBody) => set({ fontBody })}
                  sample="Bright rooms, a quiet street and a five-minute walk to the beach."
                />
              </FormSection>

              <FormSection title="Corners">
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Corner style</legend>
                  {(
                    [
                      ["soft", "Soft", "12px"],
                      ["sharp", "Sharper", "6px"],
                    ] as const
                  ).map(([style, label, radius]) => (
                    <label
                      key={style}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-[13px]",
                        value.cornerStyle === style
                          ? "border-accent bg-accent-soft"
                          : "border-border",
                      )}
                    >
                      <input
                        type="radio"
                        name="cornerStyle"
                        className="accent-[var(--color-accent)]"
                        checked={value.cornerStyle === style}
                        onChange={() => set({ cornerStyle: style })}
                      />
                      <span
                        aria-hidden
                        className="size-8 border-2 border-ink bg-surface"
                        style={{ borderRadius: radius }}
                      />
                      <span className="font-medium text-ink">{label}</span>
                    </label>
                  ))}
                </fieldset>
              </FormSection>

              {!readOnly && (
                <div>
                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant="outline">
                        Reset to Desert Modern
                      </Button>
                    }
                    title="Reset to Desert Modern?"
                    description="Colours, fonts and corners go back to the defaults. Nothing changes on the site until you save."
                    confirmLabel="Reset"
                    onConfirm={() => set(defaultsFor("branding"))}
                  />
                </div>
              )}
            </div>

            <aside aria-label="Live preview" className="xl:sticky xl:top-20 xl:self-start">
              <BrandingPreview branding={value} {...preview} />
            </aside>
          </div>
        );
      }}
    </SettingsForm>
  );
}

function FontChoice<T extends string>({
  label,
  fonts,
  value,
  onChange,
  sample,
}: {
  label: string;
  fonts: readonly T[];
  value: T;
  onChange: (font: T) => void;
  sample: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-semibold text-ink">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {fonts.map((font) => (
          <label
            key={font}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-md border p-3",
              value === font ? "border-accent bg-accent-soft" : "border-border",
            )}
          >
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <input
                type="radio"
                name={label}
                className="accent-[var(--color-accent)]"
                checked={value === font}
                onChange={() => onChange(font)}
              />
              {font}
            </span>
            <span
              className="truncate text-[17px] text-ink"
              style={{ fontFamily: `var(${fontCssVar[font as keyof typeof fontCssVar]})` }}
            >
              {sample}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A heading, buttons and a property card drawn with the draft tokens (02 §2). */
function BrandingPreview({
  branding,
  price,
  area,
}: {
  branding: Branding;
  price: string;
  area: string;
}) {
  return (
    <div
      style={brandingVars(branding) as CSSProperties}
      className="flex flex-col gap-4 overflow-hidden rounded-card border border-border bg-bg p-4 font-sans text-text"
    >
      <p className="text-[11px] font-semibold tracking-[0.12em] text-text-muted uppercase">
        Preview
      </p>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-[28px] leading-tight text-ink">Homes with a view</h2>
        <p className="text-[14px] leading-relaxed">
          Bright rooms, quiet streets and a short walk to the water.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-button bg-accent px-4 py-2 text-[14px] font-semibold text-[var(--color-on-accent)]">
          Book a viewing
        </span>
        <span className="inline-flex items-center rounded-button border border-ink px-4 py-2 text-[14px] font-semibold text-ink">
          Save search
        </span>
      </div>
      <article className="overflow-hidden rounded-card bg-surface shadow-sm">
        <div className="relative aspect-[16/10] bg-photo-placeholder">
          <span className="absolute start-3 top-3 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-ink">
            New
          </span>
          <span className="absolute end-3 top-3 flex size-8 items-center justify-center rounded-full bg-surface text-ink">
            <HeartIcon className="size-4" aria-hidden />
          </span>
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          <p className="font-heading text-[22px] text-ink">{price}</p>
          <p className="text-[14px] font-semibold text-ink">3 bedroom apartment with a sea view</p>
          <p className="flex items-center gap-1 text-[13px] text-text-muted">
            <MapPinIcon className="size-3.5" aria-hidden /> Harbour District
          </p>
          <p className="text-[13px] text-text-muted">3 beds · 2 baths · {area}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">
              <ShieldCheckIcon className="size-3.5" aria-hidden /> Verified
            </span>
            <span className="text-[13px] font-semibold text-accent">View details</span>
          </div>
        </div>
      </article>
      <div className="rounded-card bg-ink p-4 text-surface">
        <p className="font-heading text-[18px]">Thinking of selling?</p>
        <p className="text-[13px] opacity-90">Get a free valuation from our team.</p>
      </div>
    </div>
  );
}
