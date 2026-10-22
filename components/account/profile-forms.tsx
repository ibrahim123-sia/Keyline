"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/auth-card";
import { PasswordMeter } from "@/components/auth/password-meter";
import { TextField } from "@/components/auth/text-field";
import { notify } from "@/components/site/site-toaster";
import { Button } from "@/components/ui/button";
import {
  deleteMyAccount,
  saveMyNotifications,
  saveMyProfile,
} from "@/features/account/profile-actions";
import { authClient } from "@/lib/auth/client";
import { account } from "@/lib/i18n/dictionaries/account";

type Contact = "whatsapp" | "call" | "email" | null;

/** Profile (12 §2): name, phone, preferred contact; email shown, not edited here. */
export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; phone: string; preferredContact: Contact };
}) {
  const t = account.profilePage;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveMyProfile({
          name: v.name,
          phone: v.phone,
          preferredContact: v.preferredContact,
        });
        setBusy(false);
        if (!res.ok)
          return setErrors(
            Object.fromEntries(
              Object.entries(res.fieldErrors ?? { name: [res.error] }).map(([k, m]) => [k, m[0]!]),
            ),
          );
        setErrors({});
        notify.success(t.saved);
        router.refresh();
      }}
    >
      <TextField
        label={t.name}
        size="default"
        value={v.name}
        error={errors.name}
        onChange={(e) => setV({ ...v, name: e.target.value })}
      />
      <TextField
        label={t.email}
        size="default"
        value={v.email}
        readOnly
        description={t.emailNote}
      />
      <TextField
        label={t.phone}
        type="tel"
        size="default"
        value={v.phone}
        error={errors.phone}
        onChange={(e) => setV({ ...v, phone: e.target.value })}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold text-ink">{t.preferred}</span>
        <select
          className="h-11 rounded-input border border-input bg-surface px-3 text-[15px]"
          value={v.preferredContact ?? ""}
          onChange={(e) => setV({ ...v, preferredContact: (e.target.value || null) as Contact })}
        >
          <option value="">{t.contactWays.none}</option>
          <option value="whatsapp">{t.contactWays.whatsapp}</option>
          <option value="call">{t.contactWays.call}</option>
          <option value="email">{t.contactWays.email}</option>
        </select>
      </label>
      <Button type="submit" size="md" disabled={busy}>
        {t.save}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const t = account.profilePage;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await authClient.changePassword({
          currentPassword: current,
          newPassword: next,
          revokeOtherSessions: true,
        });
        setBusy(false);
        if (error) return setError(error.message ?? "Could not change the password.");
        setError(null);
        setCurrent("");
        setNext("");
        notify.success(t.passwordChanged);
      }}
    >
      {error && <FormAlert>{error}</FormAlert>}
      <TextField
        label={t.currentPassword}
        type="password"
        autoComplete="current-password"
        size="default"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <TextField
        label={t.newPassword}
        type="password"
        autoComplete="new-password"
        size="default"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <PasswordMeter password={next} />
      <Button
        type="submit"
        variant="outline-site"
        size="md"
        disabled={busy || !current || next.length < 8}
      >
        {t.changePassword}
      </Button>
    </form>
  );
}

type Channels = { email: boolean; whatsapp: boolean };
export type NotificationValues = {
  newMatch: Channels;
  priceDrop: Channels;
  statusChange: Channels;
  whatsappOptIn: boolean;
  newsletter: boolean;
  marketingConsent: boolean;
};

/** Notifications (12 §2): email and WhatsApp per alert type, newsletter, marketing consent. */
export function NotificationsForm({ initial }: { initial: NotificationValues }) {
  const t = account.notificationsPage;
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const rows = [
    ["newMatch", t.newMatch],
    ["priceDrop", t.priceDrop],
    ["statusChange", t.statusChange],
  ] as const;
  const box = "size-4 accent-[var(--color-accent)]";
  return (
    <form
      className="flex max-w-xl flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveMyNotifications(v);
        setBusy(false);
        if (!res.ok) return notify.error(res.error);
        notify.success(t.saved);
      }}
    >
      <table className="w-full text-[14.5px]">
        <thead>
          <tr className="text-start text-[13px] text-text-muted">
            <th className="py-2 text-start font-semibold" />
            <th className="py-2 font-semibold">{t.email}</th>
            <th className="py-2 font-semibold">{t.whatsapp}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label]) => (
            <tr key={key} className="border-t border-border">
              <th scope="row" className="py-3 pe-3 text-start font-medium text-ink">
                {label}
              </th>
              <td className="py-3 text-center">
                <input
                  type="checkbox"
                  className={box}
                  aria-label={`${label}: ${t.email}`}
                  checked={v[key].email}
                  onChange={(e) => setV({ ...v, [key]: { ...v[key], email: e.target.checked } })}
                />
              </td>
              <td className="py-3 text-center">
                <input
                  type="checkbox"
                  className={box}
                  aria-label={`${label}: ${t.whatsapp}`}
                  disabled={!v.whatsappOptIn}
                  checked={v.whatsappOptIn && v[key].whatsapp}
                  onChange={(e) => setV({ ...v, [key]: { ...v[key], whatsapp: e.target.checked } })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(
        [
          ["whatsappOptIn", t.whatsappOptIn],
          ["newsletter", t.newsletter],
          ["marketingConsent", t.marketing],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-start gap-2 text-[14.5px] text-text">
          <input
            type="checkbox"
            className={`mt-1 ${box}`}
            checked={v[key]}
            onChange={(e) => setV({ ...v, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <Button type="submit" size="md" disabled={busy} className="self-start">
        {t.save}
      </Button>
    </form>
  );
}

/** Delete my account (12 §2): type DELETE, then everything goes and they are signed out. */
export function DeleteAccountForm() {
  const router = useRouter();
  const t = account.privacyPage;
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await deleteMyAccount({ confirm });
        setBusy(false);
        if (!res.ok) return setError(res.fieldErrors?.confirm?.[0] ?? res.error);
        router.replace("/");
        router.refresh();
      }}
    >
      <TextField
        label={t.deleteConfirm}
        size="default"
        value={confirm}
        error={error ?? undefined}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" variant="destructive" size="md" disabled={busy || !confirm}>
        {t.deleteButton}
      </Button>
    </form>
  );
}
