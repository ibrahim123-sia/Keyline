import { normalizeVisitorPhone } from "@/features/inquiries/schema";

/**
 * CSV import of leads (09 §1 #20): columns mapped to these fields, every row checked in the
 * browser for the preview and again on the server. Pure and client-safe.
 */
export const leadImportFields = [
  { key: "name", label: "Name", aliases: ["name", "full name", "contact", "client"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"] },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone", "mobile", "telephone", "phone number", "whatsapp"],
  },
  { key: "type", label: "Lead type", aliases: ["type", "lead type"] },
  { key: "purpose", label: "Buy or rent", aliases: ["purpose", "buy or rent", "intent"] },
  { key: "budget_min", label: "Budget from", aliases: ["budget min", "budget from", "min budget"] },
  {
    key: "budget_max",
    label: "Budget to",
    aliases: ["budget max", "budget to", "max budget", "budget"],
  },
  { key: "beds", label: "Bedrooms", aliases: ["beds", "bedrooms", "bed"] },
  {
    key: "area",
    label: "Area",
    aliases: ["area", "location", "community", "neighbourhood", "neighborhood"],
  },
  {
    key: "property_ref",
    label: "Listing reference",
    aliases: ["reference", "ref", "listing", "property ref", "listing ref"],
  },
  {
    key: "message",
    label: "Notes or message",
    aliases: ["message", "notes", "note", "comments", "comment"],
  },
  {
    key: "source_detail",
    label: "Source detail",
    aliases: ["source", "source detail", "campaign", "channel"],
  },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels"] },
] as const;

export type LeadImportKey = (typeof leadImportFields)[number]["key"];
export const leadImportKeys = leadImportFields.map((f) => f.key) as [
  LeadImportKey,
  ...LeadImportKey[],
];

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");

/** Columns to fields by header name; each field used once. */
export function autoMapLeadColumns(headers: string[]): Array<LeadImportKey | null> {
  const used = new Set<LeadImportKey>();
  return headers.map((h) => {
    const n = norm(h);
    const field = leadImportFields.find(
      (f) =>
        !used.has(f.key) &&
        (norm(f.label) === n || (f.aliases as readonly string[]).some((a) => norm(a) === n)),
    );
    if (!field) return null;
    used.add(field.key);
    return field.key;
  });
}

export function leadMappingProblems(columns: Array<LeadImportKey | null>): string[] {
  const problems: string[] = [];
  if (!columns.includes("name")) problems.push("Map a column to Name.");
  if (!columns.includes("email") && !columns.includes("phone"))
    problems.push("Map a column to Email or Phone, so each lead can be reached.");
  const seen = new Set<LeadImportKey>();
  for (const c of columns) {
    if (!c) continue;
    if (seen.has(c))
      problems.push(
        `Two columns are mapped to ${leadImportFields.find((f) => f.key === c)!.label}.`,
      );
    seen.add(c);
  }
  return problems;
}

export type LeadImportContext = {
  leadTypes: string[];
  areas: Array<{ id: string; name: string }>;
  listings: Array<{ id: string; reference: string }>;
  phoneCountryCode: string | null;
  currencyDecimals: number;
};

export type LeadImportRow = {
  name: string;
  email: string | null;
  phone: string | null;
  type: string | null;
  purpose: "sale" | "rent" | null;
  /** Minor units of the base currency. */
  budgetMin: number | null;
  budgetMax: number | null;
  beds: number | null;
  locationId: string | null;
  propertyId: string | null;
  message: string | null;
  sourceDetail: string | null;
  tags: string[];
};

export type LeadRowCheck = { errors: string[]; warnings: string[]; row: LeadImportRow | null };

const amount = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!raw.trim()) return null;
  if (!cleaned) return Number.NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
};

export function checkLeadRow(
  cells: string[],
  columns: Array<LeadImportKey | null>,
  ctx: LeadImportContext,
): LeadRowCheck {
  const value = (key: LeadImportKey) => {
    const i = columns.indexOf(key);
    return i < 0 ? "" : (cells[i] ?? "").trim();
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = value("name").slice(0, 120);
  if (!name) errors.push("No name");
  const rawEmail = value("email").toLowerCase();
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : null;
  if (rawEmail && !email) errors.push(`"${rawEmail}" is not an email address`);
  const rawPhone = value("phone");
  const phone = rawPhone ? normalizeVisitorPhone(rawPhone, ctx.phoneCountryCode) : null;
  if (rawPhone && !phone) errors.push(`"${rawPhone}" is not a phone number (add the country code)`);
  if (!rawEmail && !rawPhone) errors.push("No email or phone");

  const rawType = value("type").toLowerCase();
  const type = rawType ? (ctx.leadTypes.find((t) => t.toLowerCase() === rawType) ?? null) : null;
  if (rawType && !type)
    warnings.push(`Lead type "${rawType}" is not in Settings -> Leads; worked out instead`);

  const rawPurpose = value("purpose").toLowerCase();
  const purpose = /^(buy|sale|sell|purchase)/.test(rawPurpose)
    ? "sale"
    : /^(rent|lease|let)/.test(rawPurpose)
      ? "rent"
      : null;
  if (rawPurpose && !purpose) warnings.push(`"${rawPurpose}" is neither buy nor rent`);

  const scale = 10 ** ctx.currencyDecimals;
  const lo = amount(value("budget_min"));
  const hi = amount(value("budget_max"));
  if (Number.isNaN(lo) || Number.isNaN(hi)) errors.push("The budget is not a number");
  if (lo !== null && hi !== null && !Number.isNaN(lo) && !Number.isNaN(hi) && lo > hi)
    errors.push("The budget's top is below its bottom");

  const rawBeds = value("beds");
  const beds = rawBeds ? (/studio/i.test(rawBeds) ? 0 : Number.parseInt(rawBeds, 10)) : null;
  if (rawBeds && (beds === null || !Number.isFinite(beds) || beds < 0 || beds > 20)) {
    warnings.push(`Bedrooms "${rawBeds}" were left out`);
  }

  const rawArea = value("area");
  const area = rawArea
    ? ctx.areas.find((a) => a.name.toLowerCase() === rawArea.toLowerCase())
    : undefined;
  if (rawArea && !area) warnings.push(`Area "${rawArea}" is not in your locations; left out`);
  const rawRef = value("property_ref");
  const listing = rawRef
    ? ctx.listings.find((l) => l.reference.toLowerCase() === rawRef.toLowerCase())
    : undefined;
  if (rawRef && !listing) warnings.push(`No listing ${rawRef}; left out`);

  if (errors.length) return { errors, warnings, row: null };
  return {
    errors,
    warnings,
    row: {
      name,
      email,
      phone,
      type,
      purpose,
      budgetMin: lo === null ? null : Math.round(lo * scale),
      budgetMax: hi === null ? null : Math.round(hi * scale),
      beds: beds !== null && Number.isFinite(beds) && beds >= 0 && beds <= 20 ? beds : null,
      locationId: area?.id ?? null,
      propertyId: listing?.id ?? null,
      message: value("message").slice(0, 2000) || null,
      sourceDetail: value("source_detail").slice(0, 80) || null,
      tags: value("tags")
        .split(/[,;|]/)
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 10),
    },
  };
}
