"use client";

import { DownloadIcon } from "lucide-react";
import { useId, useState } from "react";
import { FormAlert } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import { requestBrochure } from "@/features/brochure/actions";
import type { BrochureKind } from "@/features/brochure/types";
import { format } from "@/lib/i18n";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { useHydrated } from "@/lib/use-hydrated";

type Errors = Partial<Record<"name" | "email" | "consent", string>>;

/**
 * The email gate (11 §4): name, email and consent; checked again on the server, with a
 * honeypot and Turnstile. Afterwards the brochure can be downloaded at once, and the link is
 * in their inbox too.
 */
export function BrochureGateForm({
  kind,
  id,
  onClose,
}: {
  kind: BrochureKind;
  id: string;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const honeypotId = useId();
  const consentId = useId();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; url: string } | null>(null);

  if (done)
    return (
      <div className="flex flex-col gap-3">
        <FormAlert tone="success">{format(t.gate.sent, { email: done.email })}</FormAlert>
        <Button asChild size="md">
          <a href={done.url} download>
            <DownloadIcon aria-hidden /> {t.gate.download}
          </a>
        </Button>
        <Button type="button" variant="outline-site" size="md" onClick={onClose}>
          {t.gate.close}
        </Button>
      </div>
    );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();
        const consent = form.get("consent") === "on";
        const found: Errors = {};
        if (name.length < 2) found.name = t.gate.nameRequired;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = t.gate.emailInvalid;
        if (!consent) found.consent = t.gate.consentRequired;
        setErrors(found);
        setFormError(null);
        if (Object.keys(found).length) return;
        setBusy(true);
        const res = await requestBrochure({
          kind,
          id,
          name,
          email,
          consent: consent as true,
          website: String(form.get("website") ?? ""),
          captchaToken: captcha,
        });
        setBusy(false);
        if (res.ok) return setDone({ email: res.data.email, url: res.data.downloadUrl });
        const fields = res.fieldErrors ?? {};
        setErrors({
          name: fields.name?.[0],
          email: fields.email?.[0],
          consent: fields.consent?.[0],
        });
        if (!res.fieldErrors) setFormError(res.error);
      }}
    >
      <p className="text-[14px] text-text-muted">{t.gate.intro}</p>
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        name="name"
        label={t.gate.name}
        autoComplete="name"
        size="default"
        error={errors.name}
      />
      <TextField
        name="email"
        label={t.gate.email}
        type="email"
        autoComplete="email"
        size="default"
        error={errors.email}
      />
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={honeypotId}>Website</label>
        <input id={honeypotId} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={consentId} className="flex items-start gap-2 text-[14px] text-text">
          <input
            id={consentId}
            name="consent"
            type="checkbox"
            className="mt-1 size-4 accent-[var(--color-accent)]"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? `${consentId}-err` : undefined}
          />
          {kind === "project" ? t.gate.consentProject : t.gate.consent}
        </label>
        {errors.consent && (
          <p id={`${consentId}-err`} className="text-[13px] font-medium text-danger">
            {errors.consent}
          </p>
        )}
      </div>
      <Turnstile onToken={setCaptcha} action="brochure" />
      <Button
        type="submit"
        size="md"
        disabled={!hydrated || busy || (turnstileEnabled && !captcha)}
      >
        {busy ? t.gate.sending : t.gate.send}
      </Button>
    </form>
  );
}
