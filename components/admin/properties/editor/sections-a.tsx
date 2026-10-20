"use client";

import { useId } from "react";
import {
  AdminField,
  CheckboxListField,
  ListField,
  NumberField,
  SelectField,
  SwitchField,
  TextInputField,
} from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { PaymentPlanBuilder } from "@/components/admin/payment-plans/plan-builder";
import { PinPicker } from "@/components/maps/pin-picker";
import { PaymentPlanView } from "@/components/payment-plan/plan-view";
import { Input } from "@/components/ui/input";
import { geocodeAddress } from "@/features/locations/actions";
import { emptyPlan } from "@/features/payment-plans/schema";
import { formatFor } from "@/features/properties/format";
import { statusLabels } from "@/features/properties/status";
import { toMajor, toMinor } from "@/lib/money";
import {
  areaInputValue,
  areaToSqm,
  areaUnitLabels,
  perAreaFromSqm,
  perAreaToSqm,
} from "@/lib/units";
import { LocationSelect } from "./location-select";
import type { SectionProps } from "./types";

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[13px] font-semibold text-ink">{label}</legend>
      <div className="inline-flex w-fit rounded-lg border border-border bg-surface-soft p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium text-text-muted has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DateField({
  label,
  value,
  onChange,
  error,
  description,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
  description?: string;
}) {
  const id = useId();
  return (
    <AdminField label={label} htmlFor={id} error={error} description={description}>
      <Input
        id={id}
        type="date"
        value={value ?? ""}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </AdminField>
  );
}

/** Money stored in minor units, typed in major units of the listing's currency. */
function MoneyField({
  label,
  value,
  onChange,
  decimals,
  suffix,
  error,
  description,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  decimals: number;
  suffix: string;
  error?: string;
  description?: string;
}) {
  return (
    <NumberField
      label={label}
      description={description}
      min={0}
      step={decimals ? 1 / 10 ** decimals : 1}
      suffix={suffix}
      value={value == null ? null : toMajor(value, decimals)}
      onChange={(v) => onChange(v == null ? null : toMinor(v, decimals))}
      error={error}
    />
  );
}

/* 1. Basics ---------------------------------------------------------------- */

export function BasicsSection({
  data,
  set,
  errorFor,
  options,
  status,
  reference,
}: SectionProps & { reference: string }) {
  const activeAgents = options.agents.filter((a) => a.isActive || a.id === data.agentId);
  return (
    <FormSection id="basics" title="Basics">
      <div className="flex flex-wrap gap-6">
        <Segmented
          label="Purpose"
          value={data.purpose}
          onChange={(purpose) => set({ purpose })}
          options={[
            { value: "sale", label: "For sale" },
            { value: "rent", label: "For rent" },
          ]}
        />
        <Segmented
          label="Completion"
          value={data.completion}
          onChange={(completion) => set({ completion })}
          options={[
            { value: "ready", label: "Ready" },
            { value: "off_plan", label: "Off-plan" },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Property type"
          required
          value={data.propertyTypeId}
          onChange={(propertyTypeId) => set({ propertyTypeId })}
          options={options.types.map((t) => ({ value: t.id, label: t.name }))}
          error={errorFor("propertyTypeId")}
        />
        <AdminField label="Reference">
          <p className="flex h-9 items-center text-[14px] text-ink tabular">
            {reference}
            <span className="ms-2 text-[12.5px] text-text-muted">· {statusLabels[status]}</span>
          </p>
        </AdminField>
      </div>
      <TextInputField
        label="Title"
        required
        maxLength={120}
        description={`${data.title.length} / 120 characters. Shown on cards, the page and in search results.`}
        value={data.title}
        onChange={(title) => set({ title })}
        error={errorFor("title")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Agent"
          value={data.agentId ?? "none"}
          onChange={(v) => set({ agentId: v === "none" ? null : v })}
          options={[
            { value: "none", label: "No agent (the agency contact)" },
            ...activeAgents.map((a) => ({
              value: a.id,
              label: a.isActive ? a.name : `${a.name} (turned off)`,
            })),
          ]}
          error={errorFor("agentId")}
        />
        <div className="flex flex-col gap-3">
          <SwitchField
            label="Featured"
            description="Shown first on the home page and in search."
            checked={data.isFeatured}
            onChange={(isFeatured) => set({ isFeatured })}
          />
          {data.isFeatured && (
            <DateField
              label="Featured until"
              description="Optional. Empty keeps it featured."
              value={data.featuredUntil}
              onChange={(featuredUntil) => set({ featuredUntil })}
              error={errorFor("featuredUntil")}
            />
          )}
        </div>
      </div>
    </FormSection>
  );
}

/* 2. Location -------------------------------------------------------------- */

export function LocationSection({ data, set, errorFor, options, market, hidden }: SectionProps) {
  return (
    <FormSection id="location" title="Location">
      <LocationSelect
        label="Location"
        required
        nodes={options.locations}
        value={data.locationId}
        onChange={(locationId) => set({ locationId })}
        error={errorFor("locationId")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          label="Building or community"
          maxLength={120}
          value={data.buildingName}
          onChange={(buildingName) => set({ buildingName })}
          error={errorFor("buildingName")}
        />
        <TextInputField
          label="Address line"
          maxLength={200}
          value={data.addressLine}
          onChange={(addressLine) => set({ addressLine })}
          error={errorFor("addressLine")}
        />
        <TextInputField
          label="Unit number"
          description="Private: never shown on the site or in feeds."
          maxLength={40}
          value={data.unitNumber}
          onChange={(unitNumber) => set({ unitNumber })}
          error={errorFor("unitNumber")}
        />
        {!hidden.has("floor") && (
          <TextInputField
            label="Floor"
            maxLength={20}
            placeholder="e.g. 14 or Ground"
            value={data.floor}
            onChange={(floor) => set({ floor })}
            error={errorFor("floor")}
          />
        )}
      </div>
      <AdminField
        label="Map pin"
        required
        description="Drag the pin, search an address or paste coordinates. Moving it measures the nearby places again."
        error={errorFor("point")}
      >
        <PinPicker
          value={data.point}
          onChange={(point) => set({ point })}
          styleUrl={market.styleUrl}
          fallbackCenter={data.point ?? market.mapCenter}
          zoom={data.point ? 15 : market.mapZoom}
          onSearch={async (query) => {
            const res = await geocodeAddress(query);
            return res.ok ? res.data : { error: res.error };
          }}
        />
      </AdminField>
      <SwitchField
        label="Show the exact pin on the site"
        description="Off: visitors see an approximate area instead of the exact building."
        checked={data.mapPinExact}
        onChange={(mapPinExact) => set({ mapPinExact })}
      />
    </FormSection>
  );
}

/* 3. Price ----------------------------------------------------------------- */

export function PriceSection({ data, set, errorFor, market }: SectionProps) {
  const currency = formatFor(data.currency, market.currencies);
  const unit = areaUnitLabels[market.areaUnit];
  const perArea =
    data.serviceChargePerArea == null
      ? null
      : Math.round(perAreaFromSqm(data.serviceChargePerArea, market.areaUnit));
  return (
    <FormSection id="price" title="Price">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <MoneyField
          label={data.purpose === "rent" ? "Rent" : "Price"}
          value={data.price}
          onChange={(price) => set({ price })}
          decimals={currency.decimals}
          suffix={currency.code}
          error={errorFor("price")}
        />
        <SelectField
          label="Currency"
          value={data.currency}
          onChange={(code) => set({ currency: code })}
          options={Object.values(market.currencies).map((c) => ({ value: c.code, label: c.code }))}
          error={errorFor("currency")}
        />
      </div>
      {data.purpose === "rent" && (
        <SelectField
          label="Rent period"
          value={data.pricePeriod}
          onChange={(pricePeriod) => set({ pricePeriod })}
          options={[
            { value: "year", label: "Per year" },
            { value: "month", label: "Per month" },
          ]}
          error={errorFor("pricePeriod")}
        />
      )}
      <SwitchField
        label="Price on request"
        description={
          data.priceOnRequest
            ? "Most buyers skip listings without a price."
            : "Hide the price and show “Price on request”."
        }
        checked={data.priceOnRequest}
        onChange={(priceOnRequest) => set({ priceOnRequest })}
      />
      {data.purpose === "rent" && (
        <>
          {market.rentPaymentOptions.length > 0 && (
            <CheckboxListField
              label="Payments accepted"
              description="How many payments (cheques) the rent can be split into."
              columns={3}
              value={data.rentPaymentOptions.map(String)}
              onChange={(v) => set({ rentPaymentOptions: v.map(Number).sort((a, b) => a - b) })}
              options={market.rentPaymentOptions.map((n) => ({
                value: String(n),
                label: n === 1 ? "1 payment" : `${n} payments`,
              }))}
            />
          )}
          <SwitchField
            label="Monthly payment available"
            checked={data.monthlyPaymentAvailable}
            onChange={(monthlyPaymentAvailable) => set({ monthlyPaymentAvailable })}
          />
          <MoneyField
            label="Deposit"
            value={data.depositAmount}
            onChange={(depositAmount) => set({ depositAmount })}
            decimals={currency.decimals}
            suffix={currency.code}
            error={errorFor("depositAmount")}
          />
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Service charge"
          suffix={`${currency.code} / ${unit} a year`}
          min={0}
          step={0.01}
          value={perArea == null ? null : toMajor(perArea, currency.decimals)}
          onChange={(v) =>
            set({
              serviceChargePerArea:
                v == null
                  ? null
                  : Math.round(perAreaToSqm(toMinor(v, currency.decimals), market.areaUnit)),
            })
          }
          error={errorFor("serviceChargePerArea")}
        />
        <TextInputField
          label="Agency fee"
          maxLength={200}
          placeholder="e.g. 2% + VAT"
          value={data.agencyFeeText}
          onChange={(agencyFeeText) => set({ agencyFeeText })}
          error={errorFor("agencyFeeText")}
        />
      </div>
    </FormSection>
  );
}

/* 4. Specs ----------------------------------------------------------------- */

const viewSuggestions = [
  "Sea",
  "Marina",
  "City",
  "Park",
  "Pool",
  "Garden",
  "Golf",
  "Lake",
  "Community",
];

export function SpecsSection({ data, set, errorFor, market, hidden }: SectionProps) {
  const unit = areaUnitLabels[market.areaUnit];
  const area = (field: "size" | "plotSize", label: string, required?: boolean) => (
    <NumberField
      label={label}
      required={required}
      suffix={unit}
      min={0}
      step={0.01}
      value={areaInputValue(data[field], market.areaUnit)}
      onChange={(v) => set({ [field]: v == null ? null : areaToSqm(v, market.areaUnit) })}
      error={errorFor(field)}
    />
  );
  return (
    <FormSection id="specs" title="Specs">
      <div className="grid gap-4 sm:grid-cols-3">
        {!hidden.has("beds") && (
          <SelectField
            label="Bedrooms"
            required
            value={data.beds == null ? "" : String(data.beds)}
            onChange={(v) => set({ beds: Number(v) })}
            options={Array.from({ length: 21 }, (_, n) => ({
              value: String(n),
              label: n === 0 ? "Studio" : String(n),
            }))}
            error={errorFor("beds")}
          />
        )}
        {!hidden.has("baths") && (
          <NumberField
            label="Bathrooms"
            required
            min={0}
            max={50}
            step={1}
            value={data.baths}
            onChange={(baths) => set({ baths })}
            error={errorFor("baths")}
          />
        )}
        {!hidden.has("parking") && (
          <NumberField
            label="Parking spaces"
            min={0}
            max={100}
            step={1}
            value={data.parkingSpaces}
            onChange={(parkingSpaces) => set({ parkingSpaces })}
            error={errorFor("parkingSpaces")}
          />
        )}
        {!hidden.has("size") && area("size", "Size", true)}
        {!hidden.has("plotSize") && area("plotSize", "Plot size")}
        <NumberField
          label="Year built"
          min={1800}
          step={1}
          value={data.yearBuilt}
          onChange={(yearBuilt) => set({ yearBuilt })}
          error={errorFor("yearBuilt")}
        />
        <NumberField
          label="Floors in the home"
          description="For villas and townhouses."
          min={1}
          max={300}
          step={1}
          value={data.floorCount}
          onChange={(floorCount) => set({ floorCount })}
          error={errorFor("floorCount")}
        />
        {!hidden.has("furnishing") && market.furnishingOptions.length > 0 && (
          <SelectField
            label="Furnishing"
            value={data.furnishing}
            onChange={(furnishing) => set({ furnishing })}
            options={market.furnishingOptions.map((o) => ({ value: o, label: o }))}
            error={errorFor("furnishing")}
          />
        )}
        {market.ownershipTypes.length > 0 && (
          <SelectField
            label="Ownership"
            value={data.ownership}
            onChange={(ownership) => set({ ownership })}
            options={market.ownershipTypes.map((o) => ({ value: o, label: o }))}
            error={errorFor("ownership")}
          />
        )}
      </div>
      <ListField
        label="View"
        placeholder="Add a view"
        max={10}
        suggestions={viewSuggestions}
        value={data.view}
        onChange={(view) => set({ view })}
        error={errorFor("view")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField
          label="Maid's room"
          checked={data.maidRoom}
          onChange={(maidRoom) => set({ maidRoom })}
        />
        <SwitchField label="Study" checked={data.study} onChange={(study) => set({ study })} />
      </div>
    </FormSection>
  );
}

/* 5. Off-plan -------------------------------------------------------------- */

export function OffPlanSection({ data, set, errorFor, options, market }: SectionProps) {
  const project = options.projects.find((p) => p.id === data.projectId) ?? null;
  const planMode = data.paymentPlan ? "own" : project?.plan ? "project" : "none";
  const base = Object.values(market.currencies).find((c) => c.code === data.currency) ?? null;
  const planErrorFor = (path: string) =>
    path === "steps"
      ? (errorFor("paymentPlan.steps") ?? errorFor("paymentPlan"))
      : errorFor(`paymentPlan.${path}`);
  return (
    <FormSection
      id="offplan"
      title="Off-plan"
      description="Linking a project fills in its handover, progress and payment plan."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Project"
          value={data.projectId ?? "none"}
          onChange={(v) => {
            const next = options.projects.find((p) => p.id === v) ?? null;
            set({
              projectId: next?.id ?? null,
              projectUnitTypeId: null,
              ...(next && !data.handoverDate && !data.handoverText
                ? { handoverDate: next.handoverDate, handoverText: next.handoverText ?? "" }
                : {}),
              ...(next && data.constructionProgress == null
                ? { constructionProgress: next.constructionProgress }
                : {}),
            });
          }}
          options={[
            { value: "none", label: "Not part of a project" },
            ...options.projects.map((p) => ({
              value: p.id,
              label: p.developerName ? `${p.name} (${p.developerName})` : p.name,
            })),
          ]}
          error={errorFor("projectId")}
        />
        {project && project.unitTypes.length > 0 && (
          <SelectField
            label="Unit type"
            value={data.projectUnitTypeId ?? "none"}
            onChange={(v) => set({ projectUnitTypeId: v === "none" ? null : v })}
            options={[
              { value: "none", label: "Not set" },
              ...project.unitTypes.map((u) => ({ value: u.id, label: u.name })),
            ]}
            error={errorFor("projectUnitTypeId")}
          />
        )}
        <DateField
          label="Handover date"
          value={data.handoverDate}
          onChange={(handoverDate) => set({ handoverDate })}
          error={errorFor("handoverDate")}
        />
        <TextInputField
          label="Or handover quarter"
          placeholder="e.g. Q4 2027"
          maxLength={40}
          value={data.handoverText}
          onChange={(handoverText) => set({ handoverText })}
          error={errorFor("handoverText")}
        />
        <NumberField
          label="Construction progress"
          suffix="%"
          min={0}
          max={100}
          step={1}
          value={data.constructionProgress}
          onChange={(constructionProgress) => set({ constructionProgress })}
          error={errorFor("constructionProgress")}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <Segmented
          label="Payment plan"
          value={planMode}
          onChange={(mode) =>
            set({
              paymentPlan:
                mode === "own"
                  ? (data.paymentPlan ??
                    (project?.plan ? structuredClone(project.plan.input) : emptyPlan()))
                  : null,
            })
          }
          options={[
            ...(project?.plan
              ? [{ value: "project" as const, label: "The project's plan" }]
              : [{ value: "none" as const, label: "No plan" }]),
            { value: "own" as const, label: "Its own plan" },
          ]}
        />
        {planMode === "project" && project?.plan && (
          <div className="rounded-lg border border-border p-4">
            <PaymentPlanView
              preview
              steps={project.plan.input.steps}
              summaryLabel={project.plan.summaryLabel}
              notes={project.plan.input.notes}
              price={data.price && base ? { amount: data.price, currency: base } : null}
            />
          </div>
        )}
        {data.paymentPlan && (
          <PaymentPlanBuilder
            value={data.paymentPlan}
            onChange={(paymentPlan) => set({ paymentPlan })}
            templates={options.planTemplates}
            currency={formatFor(data.currency, market.currencies)}
            price={data.price}
            errorFor={planErrorFor}
          />
        )}
      </div>
    </FormSection>
  );
}

/* 6. Investment ------------------------------------------------------------ */

export function InvestmentSection({ data, set, errorFor, market }: SectionProps) {
  const currency = formatFor(data.currency, market.currencies);
  const yieldPct =
    data.price && data.expectedRentYearly
      ? Math.round((data.expectedRentYearly * 10_000) / data.price) / 100
      : null;
  return (
    <FormSection
      id="investment"
      title="Investment"
      description="For buyers who will rent it out. The yield is worked out for you."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Expected yearly rent"
          value={data.expectedRentYearly}
          onChange={(expectedRentYearly) => set({ expectedRentYearly })}
          decimals={currency.decimals}
          suffix={currency.code}
          error={errorFor("expectedRentYearly")}
        />
        <AdminField label="Gross yield">
          <p className="flex h-9 items-center text-[14px] font-semibold text-ink tabular">
            {yieldPct == null ? "—" : `${yieldPct}%`}
          </p>
        </AdminField>
      </div>
      <SwitchField
        label="Tenanted"
        checked={data.isTenanted}
        onChange={(isTenanted) => set({ isTenanted })}
      />
      {data.isTenanted && (
        <DateField
          label="Tenancy ends"
          value={data.tenancyEndDate}
          onChange={(tenancyEndDate) => set({ tenancyEndDate })}
          error={errorFor("tenancyEndDate")}
        />
      )}
    </FormSection>
  );
}
