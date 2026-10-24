"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { FormAlert } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { emailRoiReport } from "@/features/tools/calculator-actions";
import { roiReportSchema, type RoiReportInput } from "@/features/tools/calculator-schema";
import { format } from "@/lib/i18n";
import { calculators as c } from "@/lib/i18n/dictionaries/calculators";
import { useHydrated } from "@/lib/use-hydrated";

const t = c.roi.report;

/** "Email me this report" (11 §2): checked here and on the server; honeypot and Turnstile. */
export function RoiReportForm({
  calculation,
  onDone,
}: {
  calculation: RoiReportInput["calculation"];
  onDone: () => void;
}) {
  const hydrated = useHydrated();
  const id = useId();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<RoiReportInput>({
    resolver: zodResolver(roiReportSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      consent: false as unknown as true,
      website: "",
      captchaToken: null,
      calculation,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const err = (name: keyof RoiReportInput) => formState.errors[name]?.message as string | undefined;

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
        const res = await emailRoiReport({ ...values, calculation, captchaToken: captcha });
        if (res.ok) {
          setSent(format(t.sent, { email: res.data.email }));
          return;
        }
        for (const [path, messages] of Object.entries(res.fieldErrors ?? {}))
          setError(path as keyof RoiReportInput, { message: messages[0] });
        if (!res.fieldErrors) setFormError(res.error);
      })}
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        label={c.common.email}
        type="email"
        autoComplete="email"
        size="default"
        error={err("email")}
        {...register("email")}
      />
      <TextField
        label={c.common.nameOptional}
        autoComplete="name"
        size="default"
        error={err("name")}
        {...register("name")}
      />
      <TextField
        label={c.common.phoneOptional}
        type="tel"
        autoComplete="tel"
        size="default"
        error={err("phone")}
        {...register("phone")}
      />
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <label className="flex items-start gap-2 text-[14px] text-text">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--color-accent)]"
          aria-invalid={err("consent") ? true : undefined}
          aria-describedby={err("consent") ? `${id}-consent-err` : undefined}
          {...register("consent")}
        />
        {t.consent}
      </label>
      {err("consent") && (
        <p id={`${id}-consent-err`} className="text-[13px] font-medium text-danger">
          {c.common.consentRequired}
        </p>
      )}
      <Turnstile onToken={setCaptcha} action="roi-report" />
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
