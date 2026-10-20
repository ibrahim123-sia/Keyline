"use client";

import { PlusIcon, XIcon } from "lucide-react";
import {
  CheckboxListField,
  ListField,
  NumberField,
  SelectField,
  SwitchField,
  TextInputField,
} from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { PinPicker } from "@/components/maps/pin-picker";
import { Button } from "@/components/ui/button";
import { geocodeAddress } from "@/features/locations/actions";
import type { SettingsOf } from "@/features/settings/schema";
import { SettingsForm } from "../settings-form";

type Market = SettingsOf<"market">;
type Currency = Market["baseCurrency"];

const rentPaymentChoices = ["1", "2", "3", "4", "6", "12"] as const;

function CurrencyFields({
  value,
  onChange,
  errorFor,
  prefix,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
  errorFor: (path: string) => string | undefined;
  prefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <TextInputField
        label="Code"
        placeholder="e.g. EUR"
        maxLength={3}
        value={value.code}
        onChange={(code) => onChange({ ...value, code: code.toUpperCase() })}
        error={errorFor(`${prefix}.code`)}
      />
      <TextInputField
        label="Symbol"
        maxLength={5}
        value={value.symbol}
        onChange={(symbol) => onChange({ ...value, symbol })}
        error={errorFor(`${prefix}.symbol`)}
      />
      <SelectField
        label="Symbol position"
        value={value.symbolPosition}
        onChange={(symbolPosition) => onChange({ ...value, symbolPosition })}
        options={[
          { value: "before", label: `Before (${value.symbol || "€"}100)` },
          { value: "after", label: `After (100 ${value.symbol || "€"})` },
        ]}
      />
      <NumberField
        label="Decimals"
        min={0}
        max={3}
        step={1}
        value={value.decimals}
        onChange={(d) => onChange({ ...value, decimals: d ?? 0 })}
        error={errorFor(`${prefix}.decimals`)}
      />
    </div>
  );
}

/** 04 §3 Market: currencies, units, rent rules, lists, map default, calculator defaults. */
export function MarketSettingsForm({
  initial,
  readOnly,
  mapStyleUrl,
}: {
  initial: Market;
  readOnly: boolean;
  mapStyleUrl: string;
}) {
  return (
    <SettingsForm group="market" initial={initial} readOnly={readOnly}>
      {({ value, set, errorFor }) => {
        const minorPerMajor = 10 ** value.baseCurrency.decimals;
        const setVisitor = (i: number, patch: Partial<Market["visitorCurrencies"][number]>) =>
          set({
            visitorCurrencies: value.visitorCurrencies.map((c, j) =>
              j === i ? { ...c, ...patch } : c,
            ),
            ...("rate" in patch ? { ratesUpdatedAt: new Date().toISOString() } : {}),
          });
        return (
          <>
            <FormSection
              title="Base currency"
              description="Prices are stored and charged in this currency."
            >
              <CurrencyFields
                value={value.baseCurrency}
                onChange={(baseCurrency) => set({ baseCurrency })}
                errorFor={errorFor}
                prefix="baseCurrency"
              />
            </FormSection>

            <FormSection
              title="Visitor currencies"
              description={`Offered in the currency switcher, for display only. Rate = units of that currency for 1 ${value.baseCurrency.code}.${value.ratesUpdatedAt ? ` Rates last updated ${new Date(value.ratesUpdatedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}.` : ""}`}
            >
              {value.visitorCurrencies.length === 0 && (
                <p className="text-[13px] text-text-muted">No visitor currencies yet.</p>
              )}
              {value.visitorCurrencies.map((c, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <CurrencyFields
                      value={c}
                      onChange={(next) => setVisitor(i, next)}
                      errorFor={errorFor}
                      prefix={`visitorCurrencies.${i}`}
                    />
                  </div>
                  <div className="w-36">
                    <NumberField
                      label="Rate"
                      min={0}
                      step={0.0001}
                      value={c.rate}
                      onChange={(rate) => setVisitor(i, { rate: rate ?? 0 })}
                      error={errorFor(`visitorCurrencies.${i}.rate`)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${c.code || "currency"}`}
                    onClick={() =>
                      set({ visitorCurrencies: value.visitorCurrencies.filter((_, j) => j !== i) })
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {value.visitorCurrencies.length < 12 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    set({
                      visitorCurrencies: [
                        ...value.visitorCurrencies,
                        {
                          code: "",
                          symbol: "",
                          symbolPosition: "before",
                          decimals: 2,
                          rate: 1,
                          isExample: false,
                        },
                      ],
                    })
                  }
                >
                  <PlusIcon /> Add a currency
                </Button>
              )}
            </FormSection>

            <FormSection title="Units">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Area"
                  value={value.areaUnit}
                  onChange={(areaUnit) => set({ areaUnit })}
                  options={[
                    { value: "sqm", label: "Square metres (m²)" },
                    { value: "sqft", label: "Square feet (sq.ft)" },
                  ]}
                />
                <SelectField
                  label="Distance"
                  value={value.distanceUnit}
                  onChange={(distanceUnit) => set({ distanceUnit })}
                  options={[
                    { value: "km", label: "Kilometres" },
                    { value: "mi", label: "Miles" },
                  ]}
                />
              </div>
            </FormSection>

            <FormSection
              title="Permit or licence number"
              description="A field on listings for the official advertising permit, where the market requires one."
            >
              <SwitchField
                label="Use a permit field"
                checked={value.permit.enabled}
                onChange={(enabled) => set({ permit: { ...value.permit, enabled } })}
              />
              {value.permit.enabled && (
                <>
                  <TextInputField
                    label="Label"
                    maxLength={40}
                    value={value.permit.label}
                    onChange={(label) => set({ permit: { ...value.permit, label } })}
                    error={errorFor("permit.label")}
                  />
                  <SwitchField
                    label="Required to publish a listing"
                    checked={value.permit.requiredOnPublish}
                    onChange={(requiredOnPublish) =>
                      set({ permit: { ...value.permit, requiredOnPublish } })
                    }
                  />
                </>
              )}
            </FormSection>

            <FormSection title="Rentals">
              <SelectField
                label="Show rent"
                value={value.rentPeriod}
                onChange={(rentPeriod) => set({ rentPeriod })}
                options={[
                  { value: "month", label: "Per month" },
                  { value: "year", label: "Per year" },
                ]}
              />
              <CheckboxListField
                label="Number of payments allowed"
                description="How many payments (cheques or instalments) a year's rent can be split into."
                columns={3}
                value={
                  value.rentPaymentOptions.map(String) as Array<(typeof rentPaymentChoices)[number]>
                }
                onChange={(v) => set({ rentPaymentOptions: v.map(Number).sort((a, b) => a - b) })}
                options={rentPaymentChoices.map((n) => ({
                  value: n,
                  label: n === "1" ? "1 payment" : `${n} payments`,
                }))}
              />
              <SwitchField
                label="Monthly payment available"
                checked={value.monthlyPaymentAvailable}
                onChange={(monthlyPaymentAvailable) => set({ monthlyPaymentAvailable })}
              />
            </FormSection>

            <FormSection title="Lists used on listings">
              <ListField
                label="Ownership types"
                max={20}
                value={value.ownershipTypes}
                onChange={(ownershipTypes) => set({ ownershipTypes })}
                error={errorFor("ownershipTypes")}
              />
              <ListField
                label="Furnishing options"
                max={20}
                value={value.furnishingOptions}
                onChange={(furnishingOptions) => set({ furnishingOptions })}
                error={errorFor("furnishingOptions")}
              />
            </FormSection>

            <FormSection title="Country and phone numbers">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField
                  label="Country code"
                  description="Two letters, e.g. GB."
                  maxLength={2}
                  value={value.countryCode ?? ""}
                  onChange={(v) => set({ countryCode: v.toUpperCase() || null })}
                  error={errorFor("countryCode")}
                />
                <TextInputField
                  label="Country name"
                  value={value.countryName}
                  onChange={(countryName) => set({ countryName })}
                  error={errorFor("countryName")}
                />
                <TextInputField
                  label="Phone country code"
                  placeholder="+44"
                  maxLength={5}
                  value={value.phoneCountryCode ?? ""}
                  onChange={(v) => set({ phoneCountryCode: v.trim() || null })}
                  error={errorFor("phoneCountryCode")}
                />
                <TextInputField
                  label="Phone format hint"
                  placeholder="e.g. +44 20 1234 5678"
                  value={value.phoneFormat}
                  onChange={(phoneFormat) => set({ phoneFormat })}
                  error={errorFor("phoneFormat")}
                />
              </div>
            </FormSection>

            <FormSection
              title="Default map view"
              description="Where maps open when nothing else is chosen."
            >
              <PinPicker
                value={value.mapCenter}
                onChange={(mapCenter) => mapCenter && set({ mapCenter })}
                styleUrl={mapStyleUrl}
                fallbackCenter={value.mapCenter}
                zoom={value.mapZoom}
                className="h-64"
                onSearch={async (q) => {
                  const res = await geocodeAddress(q);
                  return res.ok ? res.data : { error: res.error };
                }}
              />
              <NumberField
                label="Zoom"
                description="1 shows the world, 10 a city, 15 a neighbourhood."
                min={1}
                max={20}
                step={1}
                value={value.mapZoom}
                onChange={(mapZoom) => set({ mapZoom: mapZoom ?? 10 })}
                error={errorFor("mapZoom")}
              />
            </FormSection>

            <FormSection title="Mortgage calculator defaults">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["downPaymentPct", "Down payment", "%"],
                    ["interestRatePct", "Interest rate", "% a year"],
                    ["years", "Loan length", "years"],
                    ["maxYears", "Longest loan", "years"],
                    ["maxLtvPct", "Highest loan-to-value", "%"],
                    ["registrationFeePct", "Registration fee", "%"],
                    ["agencyFeePct", "Agency fee", "%"],
                    ["arrangementFeePct", "Bank arrangement fee", "%"],
                  ] as const
                ).map(([key, label, suffix]) => (
                  <NumberField
                    key={key}
                    label={label}
                    suffix={suffix}
                    min={0}
                    step={key === "years" || key === "maxYears" ? 1 : 0.1}
                    value={value.mortgage[key]}
                    onChange={(v) => set({ mortgage: { ...value.mortgage, [key]: v ?? 0 } })}
                    error={errorFor(`mortgage.${key}`)}
                  />
                ))}
              </div>
            </FormSection>

            <FormSection title="ROI simulator defaults">
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField
                  label={`Service charge per ${value.areaUnit === "sqft" ? "sq.ft" : "m²"} a year`}
                  currency={value.baseCurrency.code}
                  minorPerMajor={minorPerMajor}
                  valueMinor={value.roi.serviceChargePerArea}
                  onChange={(serviceChargePerArea) =>
                    set({ roi: { ...value.roi, serviceChargePerArea } })
                  }
                  error={errorFor("roi.serviceChargePerArea")}
                />
                {(
                  [
                    ["managementFeePct", "Management fee"],
                    ["occupancyPct", "Occupancy"],
                    ["purchaseCostsPct", "Purchase costs"],
                    ["maintenancePct", "Maintenance"],
                    ["vacancyPct", "Vacancy"],
                    ["rentGrowthPct", "Rent growth a year"],
                    ["priceGrowthPct", "Price growth a year"],
                  ] as const
                ).map(([key, label]) => (
                  <NumberField
                    key={key}
                    label={label}
                    suffix="%"
                    step={0.1}
                    value={value.roi[key]}
                    onChange={(v) => set({ roi: { ...value.roi, [key]: v ?? 0 } })}
                    error={errorFor(`roi.${key}`)}
                  />
                ))}
              </div>
            </FormSection>
          </>
        );
      }}
    </SettingsForm>
  );
}

/** Money typed in major units, stored in minor units (cents). */
function MoneyField({
  label,
  currency,
  minorPerMajor,
  valueMinor,
  onChange,
  error,
}: {
  label: string;
  currency: string;
  minorPerMajor: number;
  valueMinor: number;
  onChange: (minor: number) => void;
  error?: string;
}) {
  return (
    <NumberField
      label={label}
      suffix={currency}
      min={0}
      step={1 / minorPerMajor}
      value={valueMinor / minorPerMajor}
      onChange={(major) => onChange(Math.round((major ?? 0) * minorPerMajor))}
      error={error}
    />
  );
}
