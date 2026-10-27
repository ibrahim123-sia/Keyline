"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { Button } from "@/components/ui/button";
import { authClient, authErrorKey } from "@/lib/auth/client";
import { admin, site } from "@/lib/i18n";
import { useHydrated } from "@/lib/use-hydrated";
import { FormAlert } from "./auth-card";
import { TextField } from "./text-field";

const t = admin.twoFactorSetup;

/**
 * Admin 2FA enrolment (03: admin accounts must use TOTP). The QR code is rendered in the
 * browser because the otpauth URI contains the secret.
 */
export function SetupTwoFactor() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [step, setStep] = useState<"password" | "scan" | "backup">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const qr = useMemo(() => (totpURI ? renderSVG(totpURI, { border: 1 }) : null), [totpURI]);
  const manualKey = useMemo(
    () => (totpURI ? new URL(totpURI).searchParams.get("secret") : null),
    [totpURI],
  );

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: err } = await authClient.twoFactor.enable({ password, method: "totp" });
    setBusy(false);
    if (err || !data || data.method !== "totp") {
      setError(site.auth.errors[authErrorKey(err)]);
      return;
    }
    setTotpURI(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("scan");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError(site.auth.errors.invalidCode);
      return;
    }
    setBusy(true);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (err) {
      setError(site.auth.errors[authErrorKey(err)]);
      return;
    }
    setStep("backup");
  }

  if (step === "password") {
    return (
      <form method="post" onSubmit={start} className="flex flex-col gap-5">
        <p className="text-[14px]">{t.step1}</p>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField
          label={site.auth.password}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="md" disabled={!hydrated || busy || !password}>
          {admin.common.create}
        </Button>
      </form>
    );
  }

  if (step === "scan") {
    return (
      <form method="post" onSubmit={verify} className="flex flex-col gap-5">
        <p className="text-[14px]">{t.step2}</p>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URI, nothing to optimise
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`}
            alt="QR code for your authenticator app"
            width={192}
            height={192}
            className="mx-auto size-48 rounded-lg border border-border bg-white p-2"
            data-no-placeholder
          />
        )}
        {manualKey && (
          <p className="text-[13px] text-text-muted">
            {t.manualKey}: <code className="font-mono break-all text-ink">{manualKey}</code>
          </p>
        )}
        <p className="text-[14px]">{t.step3}</p>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField
          label={site.auth.twoFactorCode}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="tracking-[0.4em] tabular"
        />
        <Button type="submit" size="md" disabled={!hydrated || busy}>
          {site.auth.verify}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="success">{t.done}</FormAlert>
      <h2 className="text-lg font-semibold text-ink">{t.backupTitle}</h2>
      <p className="text-[14px]">{t.backupText}</p>
      <ul
        className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-soft p-4 font-mono text-[14px] text-ink"
        data-testid="backup-codes"
      >
        {backupCodes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        size="md"
        onClick={() => {
          router.replace("/admin");
          router.refresh();
        }}
      >
        {t.continue}
      </Button>
    </div>
  );
}
