"use client";

import { TextInputField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import type { SectionStyle } from "@/features/cms/sections";
import { ChoiceField } from "./field-kit";

/**
 * "Section style" tab (08 §1): background, spacing, width, anchor id and where it shows.
 * Colours come from Settings -> Branding, so every choice stays on brand.
 */
export function StyleFields({
  value,
  onChange,
  errorFor,
}: {
  value: Partial<SectionStyle>;
  onChange: (patch: Partial<SectionStyle>) => void;
  errorFor: (field: string) => string | undefined;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ChoiceField
        label="Background"
        value={value.background}
        onChange={(background) => onChange({ background })}
        options={[
          { value: "white", label: "White" },
          { value: "sand", label: "Sand" },
          { value: "soft", label: "Soft" },
          { value: "ink", label: "Dark ink" },
          { value: "image", label: "Image" },
        ]}
      />
      {value.background === "image" && (
        <MediaPicker
          label="Background image"
          description="Darkened so white text stays readable."
          value={value.backgroundImageId ?? null}
          onChange={(id) => onChange({ backgroundImageId: id })}
          error={errorFor("style.backgroundImageId")}
        />
      )}
      <ChoiceField
        label="Spacing"
        value={value.spacing}
        onChange={(spacing) => onChange({ spacing })}
        options={[
          { value: "compact", label: "Compact" },
          { value: "normal", label: "Normal" },
          { value: "large", label: "Large" },
        ]}
      />
      <ChoiceField
        label="Width"
        value={value.width}
        onChange={(width) => onChange({ width })}
        options={[
          { value: "contained", label: "Contained" },
          { value: "full", label: "Full width" },
        ]}
      />
      <TextInputField
        label="Anchor id"
        description={
          value.anchor
            ? `Link to this section with #${value.anchor}`
            : "Optional, e.g. pricing: then /page#pricing jumps here."
        }
        value={value.anchor ?? ""}
        maxLength={40}
        onChange={(v) => onChange({ anchor: v.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
        error={errorFor("style.anchor")}
      />
      <ChoiceField
        label="Show on"
        value={value.hideOn}
        onChange={(hideOn) => onChange({ hideOn })}
        options={[
          { value: "none", label: "All screens" },
          { value: "phone", label: "Hide on phones" },
          { value: "desktop", label: "Hide on desktop" },
        ]}
      />
    </div>
  );
}
