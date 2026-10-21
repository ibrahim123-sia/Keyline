"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CONSENT_COOKIE,
  CONSENT_EVENT,
  CONSENT_MAX_AGE,
  COOKIE_SETTINGS_EVENT,
  consentFromCookieString,
  serializeConsent,
  type Consent,
} from "@/lib/consent";
import { pages } from "@/lib/i18n";
import { useConsent } from "./use-consent";

/**
 * Cookie banner (06 §2): shown on the first visit until the visitor chooses; reopened from
 * the footer. Necessary cookies are always on; analytics and marketing are opt-in.
 */
export function CookieBanner({
  text,
  analyticsLabel,
  marketingLabel,
  policyHref,
}: {
  text: string;
  analyticsLabel: string;
  marketingLabel: string;
  policyHref?: string | null;
}) {
  const t = pages.cookies;
  const id = useId();
  const { consent, known } = useConsent();
  const [reopened, setReopened] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const reopen = () => {
      const c = consentFromCookieString(document.cookie);
      setAnalytics(c?.analytics ?? false);
      setMarketing(c?.marketing ?? false);
      setChoosing(true);
      setReopened(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  const save = (choice: Omit<Consent, "at">) => {
    const value = serializeConsent({ ...choice, at: Date.now() });
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax${secure}`;
    setReopened(false);
    setChoosing(false);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  // Unknown while server-rendering; then shown until the visitor has chosen (or reopens it).
  if (!known || (consent && !reopened)) return null;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-[20px] border border-border bg-surface p-5 shadow-soft sm:inset-x-6 sm:bottom-6"
    >
      <h2 id={`${id}-title`} className="text-[15px] font-semibold text-ink">
        {t.title}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-text">
        {text}{" "}
        {policyHref && (
          <a href={policyHref} className="text-ink underline underline-offset-2">
            {t.policy}
          </a>
        )}
      </p>
      {choosing && (
        <fieldset className="mt-4 flex flex-col gap-2.5">
          <legend className="sr-only">{t.choose}</legend>
          <label className="flex items-start gap-3 text-[14px] text-ink">
            <input type="checkbox" checked disabled className="mt-1 size-4" />
            <span>
              <span className="font-medium">{t.necessary}</span>
              <span className="block text-[13px] text-text-muted">{t.necessaryNote}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 text-[14px] font-medium text-ink">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            {analyticsLabel}
          </label>
          <label className="flex items-center gap-3 text-[14px] font-medium text-ink">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            {marketingLabel}
          </label>
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {choosing ? (
          <Button size="md" onClick={() => save({ analytics, marketing })}>
            {t.save}
          </Button>
        ) : (
          <>
            <Button size="md" onClick={() => save({ analytics: true, marketing: true })}>
              {t.acceptAll}
            </Button>
            <Button
              size="md"
              variant="outline-site"
              onClick={() => save({ analytics: false, marketing: false })}
            >
              {t.necessaryOnly}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setChoosing(true)}>
              {t.choose}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Footer link that reopens the banner. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}
    >
      {pages.cookies.settings}
    </button>
  );
}
