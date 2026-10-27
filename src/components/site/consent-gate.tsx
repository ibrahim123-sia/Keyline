"use client";

import type { ReactNode } from "react";
import { allows, type ConsentCategory } from "@/lib/consent";
import { useConsent } from "./use-consent";

/**
 * Renders its children (an analytics or pixel script) only once the visitor has agreed to that
 * category of cookies (04 §8: tracking tags load only after consent).
 */
export function ConsentGate({
  category,
  children,
}: {
  category: ConsentCategory;
  children: ReactNode;
}) {
  const { consent } = useConsent();
  return allows(consent, category) ? children : null;
}
