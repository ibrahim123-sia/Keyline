"use client";

import { useActionState, useId } from "react";
import { subscribeFromFooter, type FooterSignupState } from "@/features/newsletter/actions";
import { newsletter as t } from "@/lib/i18n/dictionaries/newsletter";

const initial: FooterSignupState = { status: "idle", message: "" };

/** Newsletter signup in the footer (Website -> Menus -> Footer). Works before hydration. */
export function FooterSignup() {
  const id = useId();
  const [state, action, pending] = useActionState(subscribeFromFooter, initial);
  return (
    <section aria-labelledby={`${id}-title`} className="max-w-sm space-y-3">
      <h2 id={`${id}-title`} className="text-eyebrow text-surface">
        {t.footer.title}
      </h2>
      <p className="text-[14px] text-surface/75">{t.footer.intro}</p>
      {state.status === "sent" ? (
        <p role="status" className="text-[14px] text-surface">
          {state.message}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${id}-email`} className="sr-only">
            {t.footer.label}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t.footer.label}
            aria-invalid={state.status === "error" ? true : undefined}
            aria-describedby={state.status === "error" ? `${id}-error` : undefined}
            className="h-11 min-w-0 flex-1 rounded-input border border-surface/25 bg-transparent px-3 text-[15px] text-surface placeholder:text-surface/50 focus-visible:border-surface focus-visible:outline-none"
          />
          {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
          <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-button bg-surface px-5 text-[15px] font-semibold text-ink hover:bg-surface/90 disabled:opacity-60"
          >
            {t.footer.submit}
          </button>
        </form>
      )}
      {state.status === "error" && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-surface">
          {state.message}
        </p>
      )}
    </section>
  );
}
