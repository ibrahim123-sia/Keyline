"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { authClient } from "@/lib/auth/client";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNext,
  type ForgotPasswordValues,
  type ResetPasswordValues,
} from "@/lib/auth/schemas";
import { format, site } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";
import { FormAlert } from "./auth-card";
import { PasswordMeter } from "./password-meter";
import { TextField } from "./text-field";

const t = site.auth;

export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    // Same answer whether or not the account exists (no account enumeration).
    await authClient.requestPasswordReset(
      { email: values.email, redirectTo: "/reset-password" },
      { headers: captcha ? { "x-captcha-response": captcha } : undefined },
    );
    setSent(true);
  }

  if (sent) return <FormAlert tone="success">{t.forgotSent}</FormAlert>;
  return (
    <form
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
    >
      <TextField
        label={t.email}
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <Turnstile onToken={setCaptcha} action="password-reset" />
      <Button
        type="submit"
        size="md"
        className="w-full"
        disabled={!hydrated || form.formState.isSubmitting || (turnstileEnabled && !captcha)}
      >
        {t.forgotSubmit}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  // Admin invites reuse this screen ("set your password"), then go to the admin sign-in.
  const invite = params.get("invite") === "1";
  const next = safeNext(params.get("next"), "/sign-in");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const password = useWatch({ control: form.control, name: "password" });

  if (!token || linkError) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert>{t.resetInvalid}</FormAlert>
        <Link
          href="/forgot-password"
          className="font-semibold text-ink underline underline-offset-4"
        >
          {t.forgotSubmit}
        </Link>
      </div>
    );
  }

  async function onSubmit(values: ResetPasswordValues) {
    setError(null);
    const { error: err } = await authClient.resetPassword({
      newPassword: values.password,
      token: token!,
    });
    if (err) {
      setError(t.resetInvalid);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{t.resetDone}</FormAlert>
        <Button asChild size="md">
          <Link href={next}>{t.submitSignIn}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
    >
      {error && <FormAlert>{error}</FormAlert>}
      {invite && <p className="text-[15px] text-text">{t.inviteIntro}</p>}
      <TextField
        label={t.password}
        type="password"
        autoComplete="new-password"
        error={form.formState.errors.password?.message}
        description={
          <div className="flex flex-col gap-2">
            <span>{format(t.passwordHint, { min: PASSWORD_MIN_LENGTH })}</span>
            <PasswordMeter password={password} />
          </div>
        }
        {...form.register("password")}
      />
      <TextField
        label="Repeat password"
        type="password"
        autoComplete="new-password"
        error={form.formState.errors.confirm?.message}
        {...form.register("confirm")}
      />
      <Button
        type="submit"
        size="md"
        className="w-full"
        disabled={!hydrated || form.formState.isSubmitting}
      >
        {t.resetSubmit}
      </Button>
    </form>
  );
}
