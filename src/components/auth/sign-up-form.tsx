"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { safeNext, signUpSchema, type SignUpValues } from "@/lib/auth/schemas";
import { format, site } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";
import { FormAlert } from "./auth-card";
import { PasswordMeter } from "./password-meter";
import { TextField } from "./text-field";

const t = site.auth;

export function SignUpForm() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });
  const { register, handleSubmit, formState, control } = form;
  const [password, email, name] = useWatch({ control, name: ["password", "email", "name"] });
  const callbackURL = `${safeNext(params.get("next"), "/account")}`;

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    const { error } = await authClient.signUp.email(
      {
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        callbackURL,
      },
      { headers: captcha ? { "x-captcha-response": captcha } : undefined },
    );
    if (error) {
      setFormError(t.errors[authErrorKey(error)]);
      return;
    }
    setSentTo(values.email);
  }

  async function resend() {
    if (!sentTo) return;
    await authClient.sendVerificationEmail({ email: sentTo, callbackURL });
    setResent(true);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4" data-testid="signup-check-email">
        <h2 className="font-display text-2xl text-ink">{t.checkEmailTitle}</h2>
        <p>{format(t.checkEmailText, { email: sentTo })}</p>
        {resent ? (
          <FormAlert tone="success">{t.resent}</FormAlert>
        ) : (
          <Button type="button" variant="outline-site" size="md" onClick={resend}>
            {t.resend}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <TextField
        label={t.name}
        autoComplete="name"
        error={formState.errors.name?.message}
        {...register("name")}
      />
      <TextField
        label={t.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={formState.errors.email?.message}
        {...register("email")}
      />
      <TextField
        label={t.phone}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        error={formState.errors.phone?.message}
        {...register("phone")}
      />
      <TextField
        label={t.password}
        type="password"
        autoComplete="new-password"
        error={formState.errors.password?.message}
        description={
          <div className="flex flex-col gap-2">
            <span>{format(t.passwordHint, { min: PASSWORD_MIN_LENGTH })}</span>
            <PasswordMeter password={password} context={[email, name]} />
          </div>
        }
        {...register("password")}
      />
      <Turnstile onToken={setCaptcha} action="sign-up" />
      <Button
        type="submit"
        size="md"
        disabled={!hydrated || formState.isSubmitting || (turnstileEnabled && !captcha)}
        className="w-full"
      >
        {formState.isSubmitting ? `${t.submitSignUp}…` : t.submitSignUp}
      </Button>
      <p className="text-[13px] text-text-muted">{t.terms}</p>
    </form>
  );
}
