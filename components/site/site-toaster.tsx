"use client";

import { useEffect, useState, type ComponentType } from "react";

/**
 * Toasts on the public site without their code on the critical path: the toaster loads once
 * the page has loaded and the browser is idle, or at once when something wants to show a toast
 * (`notify`). Keeps the property page's first paint free of it (14 §1 Core Web Vitals).
 */
type ToasterComponent = ComponentType<{ position?: "bottom-center" }>;

let mountNow: (() => void) | null = null;
let isReady = false;
let waiters: Array<() => void> = [];

const whenReady = (): Promise<void> =>
  isReady ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve));

function markReady() {
  isReady = true;
  for (const resolve of waiters) resolve();
  waiters = [];
}

export function SiteToaster() {
  const [Toaster, setToaster] = useState<ToasterComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cancelLater = () => {};
    const load = () => {
      mountNow = null;
      void import("@/components/ui/sonner").then((m) => {
        if (!cancelled) setToaster(() => m.Toaster as ToasterComponent);
      });
    };
    mountNow = load;
    const later = () => {
      // Safari has no requestIdleCallback: a short timer instead.
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(load, { timeout: 4000 });
        cancelLater = () => window.cancelIdleCallback(id);
      } else {
        const id = setTimeout(load, 2000);
        cancelLater = () => clearTimeout(id);
      }
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    return () => {
      cancelled = true;
      mountNow = null;
      window.removeEventListener("load", later);
      cancelLater();
    };
  }, []);

  useEffect(() => {
    if (Toaster) markReady();
  }, [Toaster]);

  return Toaster ? <Toaster position="bottom-center" /> : null;
}

/** Shows a toast, loading the toaster first if it is not there yet. */
export const notify = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
};

async function show(kind: "success" | "error", message: string) {
  const waiting = whenReady();
  mountNow?.();
  await waiting;
  const { toast } = await import("sonner");
  toast[kind](message);
}
