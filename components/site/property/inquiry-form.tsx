"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormAlert } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { sendListingInquiry } from "@/features/inquiries/actions";
import { inquirySchema, type InquiryKind } from "@/features/inquiries/schema";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { useHydrated } from "@/lib/use-hydrated";

type Values = z.input<typeof inquirySchema>;

/**
 * The listing form (06 §5 contact card, §10 forms): a question, a tour request or a callback.
 * Checked here and again on the server; a hidden honeypot field and Turnstile keep bots out.
 */
export function InquiryForm({
  propertyId,
  reference,
  kind,
  onDone,
}: {
  propertyId: string;
  reference: string;
  kind: InquiryKind;
  onDone?: () => void;
}) {
  const hydrated = useHydrated();
  const honeypotId = useId();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      propertyId,
      kind,
      name: "",
      email: "",
      phone: "",
      message:
        kind === "inquiry"
          ? format(t.form.messageDefault, { ref: reference })
          : kind === "tour"
            ? format(t.form.tourDefault, { ref: reference })
            : "",
      preferredTime: "",
      similar: false,
      consent: false as unknown as true,
      website: "",
      captchaToken: null,
    },
  });
  const { register, handleSubmit, formState, setError } = form;
  const err = (name: keyof Values) => formState.errors[name]?.message as string | undefined;

  if (sent)
    return (
      <div className="flex flex-col gap-3">
        <FormAlert tone="success">{sent}</FormAlert>
        {onDone && (
          <Button type="button" variant="outline-site" size="md" onClick={onDone}>
            {t.form.close}
          </Button>
        )}
      </div>
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const res = await sendListingInquiry({ ...values, captchaToken: captcha });
        if (res.ok) {
          const who = res.data.who || t.contact.agency;
          setSent(format(kind === "callback" ? t.form.sentCallback : t.form.sent, { who }));
          return;
        }
        for (const [path, messages] of Object.entries(res.fieldErrors ?? {}))
          setError(path as keyof Values, { message: messages[0] });
        if (!res.fieldErrors) setFormError(res.error);
      })}
    >
      {kind === "tour" && <p className="text-[14px] text-text-muted">{t.form.tourIntro}</p>}
      {kind === "callback" && <p className="text-[14px] text-text-muted">{t.form.callbackIntro}</p>}
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        label={t.form.name}
        autoComplete="name"
        size="default"
        error={err("name")}
        {...register("name")}
      />
      {kind !== "callback" && (
        <TextField
          label={t.form.email}
          type="email"
          autoComplete="email"
          size="default"
          error={err("email")}
          {...register("email")}
        />
      )}
      <TextField
        label={t.form.phone}
        type="tel"
        autoComplete="tel"
        size="default"
        error={err("phone")}
        {...register("phone")}
      />
      {kind === "tour" && (
        <TextField
          label={t.form.preferred}
          size="default"
          error={err("preferredTime")}
          {...register("preferredTime")}
        />
      )}
      {kind !== "callback" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">{t.form.message}</span>
          <textarea
            rows={3}
            className="rounded-input border border-input bg-surface px-3 py-2 text-[15px]"
            aria-invalid={err("message") ? true : undefined}
            {...register("message")}
          />
          {err("message") && (
            <span className="text-[13px] font-medium text-danger">{err("message")}</span>
          )}
        </label>
      )}
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={honeypotId}>Website</label>
        <input id={honeypotId} tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      {kind !== "callback" && (
        <label className="flex items-start gap-2 text-[14px] text-text">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--color-accent)]"
            {...register("similar")}
          />
          {t.form.similar}
        </label>
      )}
      <label className="flex items-start gap-2 text-[14px] text-text">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--color-accent)]"
          {...register("consent")}
        />
        {t.form.consent}
      </label>
      {err("consent") && (
        <p className="text-[13px] font-medium text-danger">{t.form.consentRequired}</p>
      )}
      <Turnstile onToken={setCaptcha} action="listing-inquiry" />
      <Button
        type="submit"
        size="md"
        disabled={!hydrated || formState.isSubmitting || (turnstileEnabled && !captcha)}
      >
        {formState.isSubmitting ? t.form.sending : t.form.send}
      </Button>
    </form>
  );
}
