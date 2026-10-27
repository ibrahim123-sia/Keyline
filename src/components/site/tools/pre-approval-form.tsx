"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { FormAlert } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { sendPreApproval } from "@/features/tools/calculator-actions";
import {
  employmentTypes,
  preApprovalSchema,
  type PreApprovalInput,
} from "@/features/tools/calculator-schema";
import { format } from "@/lib/i18n";
import { calculators as c } from "@/lib/i18n/dictionaries/calculators";
import { useHydrated } from "@/lib/use-hydrated";

const t = c.mortgage.preApproval;
const select =
  "h-11 w-full rounded-input border border-input bg-surface px-3 text-[15px] text-ink aria-invalid:border-danger";

/** "Get pre-approved" (11 §1): checked here and on the server; honeypot and Turnstile. */
export function PreApprovalForm({
  incomeBands,
  calculation,
  listingRef,
  onDone,
}: {
  incomeBands: string[];
  calculation: PreApprovalInput["calculation"];
  listingRef: string | null;
  onDone: () => void;
}) {
  const hydrated = useHydrated();
  const id = useId();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<PreApprovalInput>({
    resolver: zodResolver(preApprovalSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      incomeBand: "",
      employment: "" as PreApprovalInput["employment"],
      downPaymentReady: undefined,
      consent: false as unknown as true,
      website: "",
      captchaToken: null,
      calculation,
      ref: listingRef,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const err = (name: keyof PreApprovalInput) =>
    formState.errors[name]?.message as string | undefined;
  const errorProps = (name: keyof PreApprovalInput) => ({
    "aria-invalid": err(name) ? true : undefined,
    "aria-describedby": err(name) ? `${id}-${name}-err` : undefined,
  });
  const fieldError = (name: keyof PreApprovalInput) =>
    err(name) && (
      <span id={`${id}-${name}-err`} className="text-[13px] font-medium text-danger">
        {err(name)}
      </span>
    );

  if (sent)
    return (
      <div className="flex flex-col gap-3">
        <FormAlert tone="success">{sent}</FormAlert>
        <Button type="button" variant="outline-site" size="md" onClick={onDone}>
          {c.common.close}
        </Button>
      </div>
    );

  return (
    <form
      noValidate
      className="relative flex flex-col gap-3"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const res = await sendPreApproval({ ...values, calculation, captchaToken: captcha });
        if (res.ok) {
          setSent(
            format(t.sent, {
              name: values.name.trim().split(/\s+/)[0] ?? values.name,
              who: res.data.who || c.common.ourTeam,
            }),
          );
          return;
        }
        for (const [path, messages] of Object.entries(res.fieldErrors ?? {}))
          setError(path as keyof PreApprovalInput, { message: messages[0] });
        if (!res.fieldErrors) setFormError(res.error);
      })}
    >
      <p className="text-[14px] text-text-muted">{t.intro}</p>
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        label={c.common.name}
        autoComplete="name"
        size="default"
        error={err("name")}
        {...register("name")}
      />
      <TextField
        label={c.common.phone}
        type="tel"
        autoComplete="tel"
        size="default"
        error={err("phone")}
        {...register("phone")}
      />
      <TextField
        label={c.common.email}
        type="email"
        autoComplete="email"
        size="default"
        error={err("email")}
        {...register("email")}
      />
      {incomeBands.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">{t.income}</span>
          <select className={select} {...errorProps("incomeBand")} {...register("incomeBand")}>
            <option value="">{t.incomeChoose}</option>
            {incomeBands.map((label, i) => (
              <option key={label} value={String(i)}>
                {label}
              </option>
            ))}
          </select>
          {fieldError("incomeBand")}
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-ink">{t.employment}</span>
        <select className={select} {...errorProps("employment")} {...register("employment")}>
          <option value="">{t.employmentChoose}</option>
          {employmentTypes.map((e) => (
            <option key={e} value={e}>
              {t.employmentTypes[e]}
            </option>
          ))}
        </select>
        {fieldError("employment")}
      </label>
      <fieldset className="flex flex-col gap-1.5" {...errorProps("downPaymentReady")}>
        <legend className="mb-1 text-[14px] font-semibold text-ink">{t.downReady}</legend>
        <div className="flex gap-5 text-[15px]">
          {(
            [
              ["yes", t.yes],
              ["no", t.notYet],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                value={value}
                className="size-4 accent-[var(--color-accent)]"
                {...register("downPaymentReady")}
              />
              {label}
            </label>
          ))}
        </div>
        {fieldError("downPaymentReady")}
      </fieldset>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <label className="flex items-start gap-2 text-[14px] text-text">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--color-accent)]"
          {...errorProps("consent")}
          {...register("consent")}
        />
        {t.consent}
      </label>
      {err("consent") && (
        <p id={`${id}-consent-err`} className="text-[13px] font-medium text-danger">
          {c.common.consentRequired}
        </p>
      )}
      <Turnstile onToken={setCaptcha} action="mortgage-pre-approval" />
      <Button
        type="submit"
        size="md"
        disabled={!hydrated || formState.isSubmitting || (turnstileEnabled && !captcha)}
      >
        {formState.isSubmitting ? c.common.sending : t.send}
      </Button>
    </form>
  );
}
