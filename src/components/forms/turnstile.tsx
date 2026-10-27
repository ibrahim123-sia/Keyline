"use client";

import { useEffect, useEffectEvent, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileEnabled = Boolean(turnstileSiteKey) && turnstileSiteKey !== "off";

/**
 * Cloudflare Turnstile on public forms and signup (06 §10, 14 §2). Renders nothing when
 * disabled (automated tests). `onToken(null)` means the token expired or failed.
 */
export function Turnstile({
  onToken,
  action,
}: {
  onToken: (token: string | null) => void;
  action?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Always calls the latest onToken without re-rendering the widget.
  const emitToken = useEffectEvent((token: string | null) => onToken(token));

  useEffect(() => {
    if (!turnstileEnabled || !ref.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: turnstileSiteKey,
          action,
          appearance: "interaction-only",
          callback: (token: string) => emitToken(token),
          "expired-callback": () => emitToken(null),
          "error-callback": () => emitToken(null),
        });
      })
      .catch(() => emitToken(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action]);

  if (!turnstileEnabled) return null;
  return <div ref={ref} className="min-h-[1px]" />;
}
