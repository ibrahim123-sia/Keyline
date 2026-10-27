import { parseCsv } from "@/lib/csv";

/** Portal lead exports as CSV (13 §1): columns guessed from the header, then mapped. Pure. */
export const portalCsvFields = ["name", "email", "phone", "reference", "message"] as const;
export type PortalCsvField = (typeof portalCsvFields)[number];
export type PortalCsvMapping = Record<PortalCsvField, number | null>;

const guesses: Record<PortalCsvField, RegExp> = {
  name: /^(full\s*)?name$|^(customer|client|contact|lead)\s*name$|^first\s*name$/i,
  email: /e-?mail/i,
  phone: /phone|mobile|tel|whatsapp|contact\s*number/i,
  reference: /ref|listing\s*id|property\s*id/i,
  message: /message|comment|enquiry|inquiry|notes?/i,
};

export function readPortalCsv(text: string): { headers: string[]; rows: string[][] } {
  const all = parseCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
  const [headers = [], ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows };
}

export function guessPortalMapping(headers: string[]): PortalCsvMapping {
  const mapping = Object.fromEntries(portalCsvFields.map((f) => [f, null])) as PortalCsvMapping;
  const taken = new Set<number>();
  for (const field of portalCsvFields) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && guesses[field].test(h));
    if (i >= 0) {
      mapping[field] = i;
      taken.add(i);
    }
  }
  return mapping;
}

/** A row as the CSV connector's raw lead. */
export function rowToRaw(row: string[], mapping: PortalCsvMapping): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const field of portalCsvFields) {
    const i = mapping[field];
    if (i !== null && i !== undefined) raw[field] = (row[i] ?? "").trim();
  }
  return raw;
}
