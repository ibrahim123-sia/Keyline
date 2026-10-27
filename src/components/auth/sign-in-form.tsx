"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Turnstile, turnstileEnabled } from "@/components/forms/turnstile";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { safeNext, signInSchema, type SignInValues } from "@/lib/auth/schemas";
import { site } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";
import { FormAlert } from "./auth-card";
import { TextField } from "./text-field";

const t = site.auth;

export function SignInForm({ variant }: { variant: "customer" | "admin" }) {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });
  const { register, handleSubmit, formState, setValue, control } = form;
  const rememberMe = useWatch({ control, name: "rememberMe" });
  const fallback = variant === "admin" ? "/admin" : "/account";
  const next = safeNext(params.get("next"), fallback);

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    const { data, error } = await authClient.signIn.email(
      { email: values.email, password: values.password, rememberMe: values.rememberMe },
      { headers: captcha ? { "x-captcha-response": captcha } : undefined },
    );
    if (error) {
      setFormError(t.errors[authErrorKey(error)]);
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push(`/admin/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    const role = (data as { user?: { role?: string } } | null)?.user?.role;
    router.replace(
      variant === "customer" && role === "admin" && next === "/account" ? "/admin" : next,
    );
    router.refresh();
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
        label={t.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        error={formState.errors.email?.message}
        {...register("email")}
      />
      <TextField
        label={t.password}
        type="password"
        autoComplete="current-password"
        error={formState.errors.password?.message}
        labelExtra={
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium text-ink underline-offset-4 hover:underline"
          >
            {t.forgotPassword}
          </Link>
        }
        {...register("password")}
      />
      {variant === "customer" && (
        <label className="flex items-center gap-2.5 text-[14px] text-ink">
          <Checkbox
            checked={rememberMe}
            onCheckedChange={(v) => setValue("rememberMe", v === true)}
          />
          {t.rememberMe}
        </label>
      )}
      <Turnstile onToken={setCaptcha} action="sign-in" />
      <Button
        type="submit"
        size="md"
        disabled={!hydrated || formState.isSubmitting || (turnstileEnabled && !captcha)}
        className="w-full"
      >
        {formState.isSubmitting ? `${t.submitSignIn}…` : t.submitSignIn}
      </Button>
    </form>
  );
}
