"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { backupCodeSchema, safeNext, totpSchema, type TotpValues } from "@/lib/auth/schemas";
import { site } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";
import { FormAlert } from "./auth-card";
import { TextField } from "./text-field";

const t = site.auth;

/** Second step of an admin sign-in: authenticator code, or a one-time backup code. */
export function TwoFactorForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/admin");
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [error, setError] = useState<string | null>(null);

  const totpForm = useForm<TotpValues>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "", trustDevice: false },
  });
  const trustDevice = useWatch({ control: totpForm.control, name: "trustDevice" });
  const backupForm = useForm<{ code: string }>({
    resolver: zodResolver(backupCodeSchema),
    defaultValues: { code: "" },
  });

  async function done(err: { code?: string; status?: number } | null) {
    if (err) {
      setError(t.errors[authErrorKey(err)]);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (mode === "backup") {
    return (
      <form
        method="post"
        noValidate
        className="flex flex-col gap-5"
        onSubmit={backupForm.handleSubmit(async ({ code }) => {
          setError(null);
          const { error: err } = await authClient.twoFactor.verifyBackupCode({ code });
          await done(err);
        })}
      >
        {error && <FormAlert>{error}</FormAlert>}
        <TextField
          label={t.twoFactorBackupCode}
          autoComplete="one-time-code"
          error={backupForm.formState.errors.code?.message}
          {...backupForm.register("code")}
        />
        <Button
          type="submit"
          size="md"
          className="w-full"
          disabled={!hydrated || backupForm.formState.isSubmitting}
        >
          {t.verify}
        </Button>
        <button
          type="button"
          className="text-[14px] font-medium text-ink underline underline-offset-4"
          onClick={() => setMode("totp")}
        >
          {t.twoFactorUseApp}
        </button>
      </form>
    );
  }

  return (
    <form
      method="post"
      noValidate
      className="flex flex-col gap-5"
      onSubmit={totpForm.handleSubmit(async ({ code, trustDevice }) => {
        setError(null);
        const { error: err } = await authClient.twoFactor.verifyTotp({ code, trustDevice });
        await done(err);
      })}
    >
      {error && <FormAlert>{error}</FormAlert>}
      <TextField
        label={t.twoFactorCode}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        className="tracking-[0.4em] tabular"
        error={totpForm.formState.errors.code?.message}
        {...totpForm.register("code")}
      />
      <label className="flex items-center gap-2.5 text-[14px] text-ink">
        <Checkbox
          checked={trustDevice}
          onCheckedChange={(v) => totpForm.setValue("trustDevice", v === true)}
        />
        {t.trustDevice}
      </label>
      <Button
        type="submit"
        size="md"
        className="w-full"
        disabled={!hydrated || totpForm.formState.isSubmitting}
      >
        {t.verify}
      </Button>
      <button
        type="button"
        className="text-[14px] font-medium text-ink underline underline-offset-4"
        onClick={() => setMode("backup")}
      >
        {t.twoFactorBackup}
      </button>
    </form>
  );
}
