"use client";

import { LinkIcon, MailIcon } from "lucide-react";
import { useId, useState } from "react";
import { FormAlert } from "@/components/auth/auth-card";
import { TextField } from "@/components/auth/text-field";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendComparison } from "@/features/compare/actions";
import { format } from "@/lib/i18n";
import { compare as t } from "@/lib/i18n/dictionaries/compare";
import { notify } from "../site-toaster";

/**
 * Share link and "Send to my email" (11 §3). The link carries the ids, so anyone who opens it
 * sees the same table. Customers get the email at their account address; guests type one.
 */
export function CompareShare({
  ids,
  url,
  accountEmail,
}: {
  ids: string[];
  url: string;
  accountEmail: string | null;
}) {
  const linkId = useId();
  const honeypotId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sent, setSent] = useState<string | null>(null);

  return (
    <section
      aria-labelledby={`${linkId}-title`}
      className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-soft print:hidden"
    >
      <h2 id={`${linkId}-title`} className="text-[17px] font-semibold text-ink">
        {t.share.title}
      </h2>
      <label htmlFor={linkId} className="sr-only">
        {t.share.linkLabel}
      </label>
      <input
        id={linkId}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-input border border-input bg-surface-soft px-3 text-[14px] text-ink"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline-site"
          size="md"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              notify.success(t.share.copied);
            } catch {
              notify.error(t.share.copyFailed);
            }
          }}
        >
          <LinkIcon aria-hidden /> {t.share.copy}
        </Button>
        <Button type="button" variant="dark" size="md" onClick={() => setOpen(true)}>
          <MailIcon aria-hidden /> {t.email.open}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSent(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.email.title}</DialogTitle>
            <DialogDescription>
              {accountEmail ? format(t.email.mine, { email: accountEmail }) : t.email.intro}
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <div className="flex flex-col gap-3">
              <FormAlert tone="success">{format(t.email.sent, { email: sent })}</FormAlert>
              <Button type="button" variant="outline-site" size="md" onClick={() => setOpen(false)}>
                {t.email.close}
              </Button>
            </div>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const email = String(form.get("email") ?? "").trim();
                setError(null);
                setFieldError(undefined);
                if (!accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                  return setFieldError(t.email.invalid);
                setBusy(true);
                const res = await sendComparison({
                  ids,
                  email: accountEmail ? "" : email,
                  website: String(form.get("website") ?? ""),
                  captchaToken: captcha,
                });
                setBusy(false);
                if (res.ok) return setSent(res.data.email);
                if (res.fieldErrors?.email) setFieldError(res.fieldErrors.email[0]);
                else setError(res.error);
              }}
            >
              {error && <FormAlert>{error}</FormAlert>}
              {!accountEmail && (
                <TextField
                  name="email"
                  type="email"
                  autoComplete="email"
                  label={t.email.label}
                  size="default"
                  error={fieldError}
                />
              )}
              {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
              <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
                <label htmlFor={honeypotId}>Website</label>
                <input id={honeypotId} name="website" tabIndex={-1} autoComplete="off" />
              </div>
              {!accountEmail && <Turnstile onToken={setCaptcha} action="compare-email" />}
              <Button
                type="submit"
                size="md"
                disabled={busy || (!accountEmail && turnstileEnabled && !captcha)}
              >
                {busy ? t.email.sending : t.email.send}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
