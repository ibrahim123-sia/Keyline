"use client";

import { Badge as BadgeChip } from "@/components/site/badge-chip";
import {
  CheckboxListField,
  ColorField,
  NumberField,
  SelectField,
  SwitchField,
  TextInputField,
} from "@/components/admin/fields";
import { IconField } from "@/components/admin/icon-picker";
import type { MasterKind } from "@/features/master-data/config";

export type FormValues = Record<string, unknown>;
type FormProps = {
  values: FormValues;
  set: (key: string, value: unknown) => void;
  errorFor: (field: string) => string | undefined;
};

export const masterDefaults: Record<MasterKind, FormValues> = {
  "property-types": {
    name: "",
    slug: "",
    pluralName: "",
    category: "residential",
    icon: null,
    fieldsHidden: [],
  },
  facilities: { name: "", icon: null, group: "building" },
  badges: {
    name: "",
    color: "#F3E6DF",
    textColor: "#14232B",
    icon: null,
    autoRule: "none",
    autoDays: null,
  },
  "poi-types": {
    name: "",
    icon: null,
    category: "other",
    googlePlaceType: null,
    defaultSearchRadiusM: 3000,
    showOnProperty: true,
    travelMode: "drive",
  },
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

function PropertyTypeForm({ values, set, errorFor }: FormProps) {
  return (
    <>
      <TextInputField
        label="Name"
        required
        value={str(values.name)}
        onChange={(v) => set("name", v)}
        error={errorFor("name")}
      />
      <TextInputField
        label="Plural name"
        description='Used in page titles and URLs, e.g. "Apartments for sale in Dubai Marina".'
        value={str(values.pluralName)}
        onChange={(v) => set("pluralName", v)}
        error={errorFor("pluralName")}
      />
      <TextInputField
        label="URL slug"
        description="Leave empty to create it from the plural name or the name."
        value={str(values.slug)}
        onChange={(v) => set("slug", v)}
        error={errorFor("slug")}
      />
      <SelectField
        label="Category"
        value={str(values.category)}
        onChange={(v) => set("category", v)}
        options={[
          { value: "residential", label: "Residential" },
          { value: "commercial", label: "Commercial" },
          { value: "land", label: "Land" },
        ]}
      />
      <IconField
        label="Icon"
        value={(values.icon as string) ?? null}
        onChange={(v) => set("icon", v)}
      />
      <CheckboxListField
        label="Hide these fields"
        description="For example, land hides beds and baths; commercial hides beds."
        value={(values.fieldsHidden as string[]) ?? []}
        onChange={(v) => set("fieldsHidden", v)}
        options={[
          { value: "beds", label: "Bedrooms" },
          { value: "baths", label: "Bathrooms" },
          { value: "size", label: "Built-up size" },
          { value: "plotSize", label: "Plot size" },
          { value: "floor", label: "Floor" },
          { value: "furnishing", label: "Furnishing" },
          { value: "parking", label: "Parking" },
        ]}
      />
    </>
  );
}

function FacilityForm({ values, set, errorFor }: FormProps) {
  return (
    <>
      <TextInputField
        label="Name"
        required
        value={str(values.name)}
        onChange={(v) => set("name", v)}
        error={errorFor("name")}
      />
      <SelectField
        label="Group"
        value={str(values.group)}
        onChange={(v) => set("group", v)}
        options={[
          { value: "building", label: "Building" },
          { value: "unit", label: "Unit" },
          { value: "community", label: "Community" },
        ]}
      />
      <IconField
        label="Icon"
        value={(values.icon as string) ?? null}
        onChange={(v) => set("icon", v)}
      />
    </>
  );
}

function BadgeForm({ values, set, errorFor }: FormProps) {
  const rule = str(values.autoRule);
  return (
    <>
      <TextInputField
        label="Name"
        required
        value={str(values.name)}
        onChange={(v) => set("name", v)}
        error={errorFor("name")}
      />
      <div className="rounded-md border border-border bg-surface-soft p-3">
        <p className="mb-2 text-[12px] font-semibold text-text-muted">Preview</p>
        <BadgeChip
          name={str(values.name) || "Badge"}
          color={str(values.color)}
          textColor={str(values.textColor)}
          icon={(values.icon as string) ?? null}
        />
      </div>
      <ColorField
        label="Background"
        value={str(values.color)}
        onChange={(v) => set("color", v)}
        error={errorFor("color")}
      />
      <ColorField
        label="Text colour"
        value={str(values.textColor)}
        onChange={(v) => set("textColor", v)}
        contrastWith={str(values.color)}
        error={errorFor("textColor")}
        description="Needs at least 4.5:1 against the background."
      />
      <IconField
        label="Icon"
        value={(values.icon as string) ?? null}
        onChange={(v) => set("icon", v)}
      />
      <SelectField
        label="Automatic rule"
        value={rule}
        onChange={(v) => set("autoRule", v)}
        options={[
          { value: "none", label: "None (added by hand)" },
          { value: "new_listing", label: "New listing" },
          { value: "price_reduced", label: "Price reduced" },
          { value: "verified", label: "Verified recently" },
          { value: "off_plan", label: "Off-plan" },
        ]}
      />
      {(rule === "new_listing" || rule === "price_reduced") && (
        <NumberField
          label="Show for"
          suffix="days"
          min={1}
          max={365}
          value={(values.autoDays as number | null) ?? null}
          onChange={(v) => set("autoDays", v)}
          error={errorFor("autoDays")}
        />
      )}
    </>
  );
}

function PoiTypeForm({ values, set, errorFor }: FormProps) {
  return (
    <>
      <TextInputField
        label="Name"
        required
        value={str(values.name)}
        onChange={(v) => set("name", v)}
        error={errorFor("name")}
      />
      <SelectField
        label="Filter group on property pages"
        value={str(values.category)}
        onChange={(v) => set("category", v)}
        options={[
          { value: "schools", label: "Schools" },
          { value: "health", label: "Health" },
          { value: "shopping", label: "Shopping" },
          { value: "transport", label: "Transport" },
          { value: "leisure", label: "Leisure" },
          { value: "other", label: "Other" },
        ]}
      />
      <IconField
        label="Icon"
        value={(values.icon as string) ?? null}
        onChange={(v) => set("icon", v)}
      />
      <NumberField
        label="Search radius"
        suffix="metres"
        min={100}
        max={50000}
        step={100}
        value={(values.defaultSearchRadiusM as number) ?? 3000}
        onChange={(v) => set("defaultSearchRadiusM", v ?? 3000)}
        error={errorFor("defaultSearchRadiusM")}
      />
      <SelectField
        label="Travel mode"
        value={str(values.travelMode)}
        onChange={(v) => set("travelMode", v)}
        options={[
          { value: "drive", label: "Drive" },
          { value: "walk", label: "Walk" },
        ]}
      />
      <TextInputField
        label="Google Places type"
        description='For "Import from Google", e.g. school, shopping_mall, subway_station.'
        value={str(values.googlePlaceType)}
        onChange={(v) => set("googlePlaceType", v || null)}
      />
      <SwitchField
        label="Show on property pages"
        checked={Boolean(values.showOnProperty)}
        onChange={(v) => set("showOnProperty", v)}
      />
    </>
  );
}

export const masterForms: Record<MasterKind, (p: FormProps) => React.ReactNode> = {
  "property-types": PropertyTypeForm,
  facilities: FacilityForm,
  badges: BadgeForm,
  "poi-types": PoiTypeForm,
};
