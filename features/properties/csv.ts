import { richDocSchema, type RichDoc } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import { areaToSqm, perAreaToSqm, type AreaUnit } from "@/lib/units";
import { toMinor } from "@/lib/money";

/**
 * Listing CSV columns (07 §7), shared by the template, the export, the column mapping and
 * the row checks. Pure: runs in the browser (preview) and on the server (the import itself).
 * Money is in major units of the row's currency; sizes are in the unit named in the header.
 */

export type FieldKey =
  | "reference"
  | "status"
  | "title"
  | "purpose"
  | "completion"
  | "property_type"
  | "location"
  | "building"
  | "address"
  | "unit_number"
  | "floor"
  | "latitude"
  | "longitude"
  | "coordinates"
  | "price"
  | "currency"
  | "price_on_request"
  | "rent_period"
  | "beds"
  | "baths"
  | "size_sqft"
  | "size_sqm"
  | "plot_size_sqft"
  | "plot_size_sqm"
  | "year_built"
  | "parking"
  | "furnishing"
  | "ownership"
  | "view"
  | "maid_room"
  | "study"
  | "service_charge_per_sqft"
  | "service_charge_per_sqm"
  | "deposit"
  | "agency_fee"
  | "handover"
  | "construction_progress"
  | "expected_rent"
  | "tenanted"
  | "tenancy_end"
  | "description"
  | "highlights"
  | "facilities"
  | "video_url"
  | "tour_url"
  | "permit_number"
  | "agent"
  | "photo_urls"
  | "seo_title"
  | "seo_description"
  | "published_at"
  | "url";

export type CsvField = {
  key: FieldKey;
  label: string;
  aliases: string[];
  /** Export-only columns (reference, status, published date, URL) are never imported. */
  importable: boolean;
  required?: boolean;
  /** Area columns exist once per unit; the template and export use the market's unit. */
  unit?: AreaUnit;
  example: string;
  hint?: string;
};

const f = (
  key: FieldKey,
  label: string,
  example: string,
  aliases: string[] = [],
  extra: Partial<CsvField> = {},
): CsvField => ({ key, label, example, aliases, importable: true, ...extra });

const exportOnly = { importable: false } as const;

const sqftAliases = (base: string[]) =>
  base.flatMap((b) => [`${b} sqft`, `${b} sq ft`, `${b} square feet`, `${b} ft2`, `${b} (sq ft)`]);
const sqmAliases = (base: string[]) =>
  base.flatMap((b) => [
    `${b} sqm`,
    `${b} sq m`,
    `${b} m2`,
    `${b} m²`,
    `${b} square meters`,
    `${b} square metres`,
  ]);

/** Every column, in template and export order. */
export const csvFields: CsvField[] = [
  f("reference", "Reference", "", ["ref", "listing reference", "listing id"], exportOnly),
  f("status", "Status", "", ["listing status"], exportOnly),
  f("title", "Title", "Two-bed apartment with marina view", ["name", "listing title", "headline"]),
  f("purpose", "Purpose", "sale", ["for", "offering type", "listing type", "sale or rent"], {
    required: true,
    hint: "sale or rent",
  }),
  f("completion", "Completion", "ready", ["completion status", "ready or off plan"], {
    hint: "ready or off-plan",
  }),
  f("property_type", "Property type", "Apartment", ["type", "category", "property category"], {
    required: true,
    hint: "A name or slug from Setup -> Property types",
  }),
  f(
    "location",
    "Location",
    "",
    ["area", "community", "neighbourhood", "neighborhood", "district", "city"],
    {
      hint: "A name or slug from Setup -> Locations",
    },
  ),
  f("building", "Building", "", ["building name", "tower", "project name"]),
  f("address", "Address", "", ["address line", "street", "street address"]),
  f("unit_number", "Unit number", "", ["unit", "unit no", "apartment number", "flat number"], {
    hint: "Private: never shown on the site",
  }),
  f("floor", "Floor", "12", ["level", "floor number"]),
  f("latitude", "Latitude", "", ["lat"]),
  f("longitude", "Longitude", "", ["lng", "lon", "long"]),
  f(
    "coordinates",
    "Coordinates",
    "",
    ["lat lng", "latlng", "gps", "map pin", "location coordinates"],
    {
      hint: "latitude, longitude",
    },
  ),
  f("price", "Price", "2450000", ["asking price", "amount", "sale price", "rent amount"]),
  f("currency", "Currency", "", ["currency code"], { hint: "Three-letter code" }),
  f("price_on_request", "Price on request", "no", ["poa", "price on application"]),
  f("rent_period", "Rent period", "", ["period", "rent frequency", "frequency", "per"], {
    hint: "year or month",
  }),
  f("beds", "Bedrooms", "2", ["bedrooms", "bed", "br", "rooms"], {
    hint: "0 or studio for a studio",
  }),
  f("baths", "Bathrooms", "2", ["bathrooms", "bath", "ba"]),
  f(
    "size_sqft",
    "Size (sq ft)",
    "1200",
    ["size", "built up area", "bua", ...sqftAliases(["size", "area", "built up area"])],
    {
      unit: "sqft",
    },
  ),
  f(
    "size_sqm",
    "Size (m²)",
    "111",
    ["size", "built up area", "bua", ...sqmAliases(["size", "area", "built up area"])],
    {
      unit: "sqm",
    },
  ),
  f(
    "plot_size_sqft",
    "Plot size (sq ft)",
    "",
    ["plot size", "plot", "land size", ...sqftAliases(["plot", "plot size", "land size"])],
    {
      unit: "sqft",
    },
  ),
  f(
    "plot_size_sqm",
    "Plot size (m²)",
    "",
    ["plot size", "plot", "land size", ...sqmAliases(["plot", "plot size", "land size"])],
    {
      unit: "sqm",
    },
  ),
  f("year_built", "Year built", "2019", ["built", "construction year", "year"]),
  f("parking", "Parking spaces", "1", ["parking spaces", "car parks", "parking spots"]),
  f("furnishing", "Furnishing", "", ["furnished", "furniture"]),
  f("ownership", "Ownership", "", ["tenure", "ownership type"]),
  f("view", "View", "Sea | Marina", ["views"], { hint: "Separate several with |" }),
  f("maid_room", "Maid room", "no", ["maids room", "maid's room", "helper room"]),
  f("study", "Study", "no", ["study room", "office"]),
  f(
    "service_charge_per_sqft",
    "Service charge per sq ft",
    "",
    ["service charge", "service charges", ...sqftAliases(["service charge", "service charges"])],
    {
      unit: "sqft",
    },
  ),
  f(
    "service_charge_per_sqm",
    "Service charge per m²",
    "",
    ["service charge", "service charges", ...sqmAliases(["service charge", "service charges"])],
    {
      unit: "sqm",
    },
  ),
  f("deposit", "Deposit", "", ["security deposit"]),
  f("agency_fee", "Agency fee", "", ["agency fee text", "commission"]),
  f("handover", "Handover", "", ["handover date", "completion date"], {
    hint: "A date, or a quarter like Q4 2027",
  }),
  f("construction_progress", "Construction progress", "", ["progress", "construction"], {
    hint: "0 to 100",
  }),
  f("expected_rent", "Expected yearly rent", "", ["expected rent", "annual rent", "rental income"]),
  f("tenanted", "Tenanted", "no", ["is tenanted", "occupied", "vacant or tenanted"]),
  f("tenancy_end", "Tenancy end", "", ["tenancy end date", "lease end", "lease expiry"]),
  f("description", "Description", "Bright corner unit on a high floor.", [
    "details",
    "about",
    "long description",
  ]),
  f("highlights", "Highlights", "Sea view | Two pools", ["features", "key features"], {
    hint: "Separate several with |",
  }),
  f("facilities", "Facilities", "Pool | Gym", ["amenities"], {
    hint: "Names from Setup -> Facilities, separated by |",
  }),
  f("video_url", "Video URL", "", ["video", "youtube"]),
  f("tour_url", "360 tour URL", "", ["tour", "virtual tour", "360 tour", "matterport"]),
  f("permit_number", "Permit number", "", [
    "permit",
    "permit no",
    "license number",
    "licence number",
  ]),
  f("agent", "Agent", "", ["agent name", "agent email", "listing agent", "broker"], {
    hint: "Name, slug or email of an agent profile",
  }),
  f("photo_urls", "Photo URLs", "", ["photos", "images", "image urls", "photo url"], {
    hint: "Web addresses separated by |, downloaded in the background",
  }),
  f("seo_title", "SEO title", "", ["meta title"]),
  f("seo_description", "SEO description", "", ["meta description"]),
  f("published_at", "Published", "", [], exportOnly),
  f("url", "Page URL", "", ["link", "public url"], exportOnly),
];

const byKey = new Map(csvFields.map((x) => [x.key, x]));
export const fieldByKey = (key: FieldKey): CsvField => byKey.get(key)!;

/** Columns of the template and the export for a market unit (no other-unit or helper columns). */
export function templateFields(unit: AreaUnit, options: { exportOnly?: boolean } = {}): CsvField[] {
  return csvFields.filter(
    (x) =>
      (!x.unit || x.unit === unit) &&
      x.key !== "coordinates" &&
      (options.exportOnly ? true : x.importable),
  );
}

export const importableKeys = csvFields.filter((x) => x.importable).map((x) => x.key) as [
  FieldKey,
  ...FieldKey[],
];

/* Header mapping ---------------------------------------------------------------- */

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/²/g, "2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * A field for each header, by its CSV name, label or an alias; each field at most once.
 * For an ambiguous area header ("size") the market's unit wins.
 */
export function autoMap(headers: string[], unit: AreaUnit): Array<FieldKey | null> {
  const used = new Set<FieldKey>();
  return headers.map((header) => {
    const h = norm(header);
    if (!h) return null;
    const candidates = csvFields.filter(
      (x) =>
        x.importable &&
        !used.has(x.key) &&
        (norm(x.key) === h || norm(x.label) === h || x.aliases.some((a) => norm(a) === h)),
    );
    const pick = candidates.find((x) => !x.unit || x.unit === unit) ?? candidates[0];
    if (!pick) return null;
    used.add(pick.key);
    return pick.key;
  });
}

/* Values ------------------------------------------------------------------------- */

/**
 * "1,250,000", "1.250.000", "1 250 000", "1,250.50", "1.250,50", "45%": a comma or dot
 * followed by exactly three digits groups thousands; otherwise the last one is the decimal.
 */
export function parseNumber(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/[\s '’]/g, "")
    .replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s) || /-/.test(s.slice(1))) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  let n: string | null;
  if (comma >= 0 && dot >= 0) {
    n = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma >= 0 || dot >= 0) {
    const sep = comma >= 0 ? "," : ".";
    const parts = s.split(sep);
    if (parts.slice(1).every((p) => p.length === 3) && (sep === "," || parts.length > 2))
      n = parts.join("");
    else n = parts.length === 2 ? `${parts[0]}.${parts[1]}` : null;
  } else n = s;
  if (n === null || !/^-?\d+(\.\d+)?$/.test(n)) return null;
  return Number(n);
}

/** Money with an optional "k" or "M" suffix ("2.45M"). */
export function parseMoney(raw: string): number | null {
  const m = raw.trim().match(/^(.*\d)\s*([kKmM])$/);
  if (!m) return parseNumber(raw);
  const base = parseNumber(m[1]!);
  return base === null ? null : base * (m[2]!.toLowerCase() === "k" ? 1_000 : 1_000_000);
}

const TRUE = new Set(["yes", "y", "true", "1", "x", "✓", "✔"]);
const FALSE = new Set(["no", "n", "false", "0", "-"]);

export function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  return null;
}

export type DateOrder = "dmy" | "mdy";

/** ISO dates, or day/month/year with / . or - (month first when the market writes it so). */
export function parseDate(raw: string, order: DateOrder): string | null {
  const v = raw.trim();
  let y: number, mo: number, d: number;
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!m) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    [d, mo] = order === "mdy" ? [b, a] : [a, b];
    y = Number(m[3]);
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return date.toISOString().slice(0, 10);
}

/** Handover: a date, a quarter ("Q4 2027", "2027 Q4") or a month ("December 2027"). */
export function parseHandover(
  raw: string,
  order: DateOrder,
): { date: string | null; text: string } | null {
  const v = raw.trim().replace(/\s+/g, " ");
  const q = v.match(/^q([1-4])[\s/-]*(\d{4})$/i) ?? v.match(/^(\d{4})[\s/-]*q([1-4])$/i);
  if (q) {
    const [quarter, year] = /^q/i.test(v) ? [q[1], q[2]] : [q[2], q[1]];
    return { date: null, text: `Q${quarter} ${year}` };
  }
  if (/^[a-z]{3,9}\.? \d{4}$/i.test(v)) return { date: null, text: v };
  const date = parseDate(v, order);
  return date ? { date, text: "" } : null;
}

const splitList = (raw: string, separators: RegExp) =>
  raw
    .split(separators)
    .map((x) => x.trim())
    .filter(Boolean);

function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Plain text to the stored rich text: blank lines split paragraphs, a line break stays one. */
export function textToDoc(text: string): RichDoc | null {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  const doc = {
    type: "doc" as const,
    content: paragraphs.map((p) => ({
      type: "paragraph" as const,
      content: p
        .split("\n")
        .flatMap((line, i) => [
          ...(i > 0 ? [{ type: "hardBreak" as const }] : []),
          ...(line.trim() ? [{ type: "text" as const, text: line.trim() }] : []),
        ]),
    })),
  };
  const parsed = richDocSchema.safeParse(doc);
  return parsed.success ? parsed.data : null;
}

/* Matching names to records ---------------------------------------------------- */

type Named = { id: string; name: string; slug?: string };

/** By slug, by name (accents and case ignored), or a simple plural ("Apartments"). */
export function matchByName<T extends Named>(value: string, items: T[]): T[] {
  const v = norm(value);
  const slug = slugify(value);
  return items.filter((item) => {
    const n = norm(item.name);
    return n === v || item.slug === slug || `${n}s` === v || n === `${v}s`;
  });
}

/* Rows --------------------------------------------------------------------------- */

export type ImportContext = {
  areaUnit: AreaUnit;
  dateOrder: DateOrder;
  baseCurrency: string;
  /** Currencies set up in Settings -> Market, with their decimals. */
  currencies: Record<string, number>;
  rentPeriod: "year" | "month";
  furnishingOptions: string[];
  ownershipTypes: string[];
  types: Array<{ id: string; name: string; slug: string }>;
  locations: Array<{ id: string; name: string; slug: string; parentName: string | null }>;
  agents: Array<{
    id: string;
    name: string;
    slug: string;
    email: string | null;
    isActive: boolean;
  }>;
  facilities: Array<{ id: string; name: string }>;
};

export type ImportDraft = {
  title: string;
  purpose: "sale" | "rent";
  completion: "ready" | "off_plan";
  propertyTypeId: string;
  locationId: string | null;
  buildingName: string | null;
  addressLine: string | null;
  unitNumber: string | null;
  floor: string | null;
  point: { lng: number; lat: number } | null;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  pricePeriod: "year" | "month" | null;
  serviceChargePerArea: number | null;
  depositAmount: number | null;
  agencyFeeText: string | null;
  beds: number | null;
  baths: number | null;
  size: number | null;
  plotSize: number | null;
  yearBuilt: number | null;
  parkingSpaces: number | null;
  furnishing: string | null;
  ownership: string | null;
  view: string[];
  maidRoom: boolean;
  study: boolean;
  handoverDate: string | null;
  handoverText: string | null;
  constructionProgress: number | null;
  expectedRentYearly: number | null;
  isTenanted: boolean;
  tenancyEndDate: string | null;
  description: RichDoc | null;
  highlights: string[];
  facilityIds: string[];
  videoUrl: string | null;
  tourUrl: string | null;
  permitNumber: string | null;
  agentId: string | null;
  photoUrls: string[];
  seoTitle: string | null;
  seoDescription: string | null;
};

export type RowCheck = { errors: string[]; warnings: string[]; draft: ImportDraft | null };

const PURPOSES: Record<string, "sale" | "rent"> = {
  sale: "sale",
  sell: "sale",
  buy: "sale",
  "for sale": "sale",
  rent: "rent",
  rental: "rent",
  let: "rent",
  lease: "rent",
  "to let": "rent",
  "for rent": "rent",
};
const COMPLETIONS: Record<string, "ready" | "off_plan"> = {
  ready: "ready",
  completed: "ready",
  complete: "ready",
  secondary: "ready",
  "off plan": "off_plan",
  offplan: "off_plan",
  "under construction": "off_plan",
  primary: "off_plan",
};
const PERIODS: Record<string, "year" | "month"> = {
  year: "year",
  yearly: "year",
  annual: "year",
  annually: "year",
  "per year": "year",
  month: "month",
  monthly: "month",
  "per month": "month",
};

const LIMITS: Partial<Record<FieldKey, number>> = {
  title: 120,
  building: 120,
  address: 200,
  unit_number: 40,
  floor: 20,
  agency_fee: 200,
  permit_number: 60,
  seo_title: 120,
  seo_description: 320,
  description: 20_000,
};

/**
 * Checks one data row against the column mapping. Errors stop the row; warnings do not
 * (unknown facilities are skipped, a bad photo address is left out).
 */
export function checkRow(
  cells: string[],
  columns: Array<FieldKey | null>,
  ctx: ImportContext,
): RowCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = new Map<FieldKey, string>();
  columns.forEach((key, i) => {
    const value = (cells[i] ?? "").trim();
    if (key && value && !raw.has(key)) raw.set(key, value);
  });
  const get = (k: FieldKey) => raw.get(k) ?? "";
  const label = (k: FieldKey) => fieldByKey(k).label;

  for (const [k, max] of Object.entries(LIMITS) as Array<[FieldKey, number]>) {
    if (get(k).length > max) errors.push(`${label(k)} is longer than ${max} characters.`);
  }

  const purpose = PURPOSES[norm(get("purpose"))];
  if (!get("purpose")) errors.push("Purpose is missing (sale or rent).");
  else if (!purpose) errors.push(`Purpose “${get("purpose")}” is not sale or rent.`);

  let completion: "ready" | "off_plan" = "ready";
  if (get("completion")) {
    const c = COMPLETIONS[norm(get("completion"))];
    if (c) completion = c;
    else errors.push(`Completion “${get("completion")}” is not ready or off-plan.`);
  }

  let propertyTypeId = "";
  if (!get("property_type")) errors.push("Property type is missing.");
  else {
    const found = matchByName(get("property_type"), ctx.types);
    if (found.length === 1) propertyTypeId = found[0]!.id;
    else if (found.length > 1)
      errors.push(`Property type “${get("property_type")}” matches several types. Use its slug.`);
    else
      errors.push(
        `Property type “${get("property_type")}” is not set up (Setup -> Property types).`,
      );
  }

  let locationId: string | null = null;
  if (get("location")) {
    const found = matchByName(get("location"), ctx.locations);
    if (found.length === 1) locationId = found[0]!.id;
    else if (found.length > 1)
      errors.push(
        `Location “${get("location")}” matches ${found.length} locations (${found
          .map((l) => (l.parentName ? `in ${l.parentName}` : l.slug))
          .join(", ")}). Use the slug, e.g. ${found[0]!.slug}.`,
      );
    else errors.push(`Location “${get("location")}” is not set up (Setup -> Locations).`);
  }

  // Map pin: latitude + longitude, or one "lat, lng" column.
  let point: { lng: number; lat: number } | null = null;
  const pin = (latRaw: string, lngRaw: string) => {
    const lat = parseNumber(latRaw.replace(",", "."));
    const lng = parseNumber(lngRaw.replace(",", "."));
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      errors.push("The map pin needs a latitude (-90 to 90) and a longitude (-180 to 180).");
    else point = { lat, lng };
  };
  if (get("coordinates")) {
    const parts = get("coordinates")
      .split(/[,;\s]+/)
      .filter(Boolean);
    if (parts.length === 2) pin(parts[0]!, parts[1]!);
    else errors.push("Coordinates should look like “25.0805, 55.1403” (latitude, longitude).");
  } else if (get("latitude") || get("longitude")) {
    if (!get("latitude") || !get("longitude"))
      errors.push("Give both latitude and longitude, or neither.");
    else pin(get("latitude"), get("longitude"));
  }

  const currency = (get("currency") || ctx.baseCurrency).toUpperCase();
  const decimals = ctx.currencies[currency];
  if (decimals === undefined)
    errors.push(`Currency “${currency}” is not set up in Settings -> Market.`);
  const money = (k: FieldKey): number | null => {
    if (!get(k)) return null;
    const v = parseMoney(get(k));
    if (v === null || v < 0) {
      errors.push(`${label(k)} “${get(k)}” is not an amount.`);
      return null;
    }
    return toMinor(v, decimals ?? 2);
  };
  const whole = (k: FieldKey, max: number, extra?: (v: string) => number | null) => {
    if (!get(k)) return null;
    const v = extra?.(get(k)) ?? parseNumber(get(k).replace(/%$/, ""));
    if (v === null || !Number.isInteger(v) || v < 0 || v > max) {
      errors.push(`${label(k)} “${get(k)}” should be a whole number from 0 to ${max}.`);
      return null;
    }
    return v;
  };
  const area = (sqft: FieldKey, sqm: FieldKey): number | null => {
    const k = get(sqft) ? sqft : get(sqm) ? sqm : null;
    if (!k) return null;
    const v = parseNumber(get(k));
    if (v === null || v <= 0) {
      errors.push(`${label(k)} “${get(k)}” should be a number above 0.`);
      return null;
    }
    return areaToSqm(v, fieldByKey(k).unit!);
  };
  const flag = (k: FieldKey): boolean => {
    if (!get(k)) return false;
    const v = parseBoolean(get(k));
    if (v === null) errors.push(`${label(k)} “${get(k)}” should be yes or no.`);
    return v ?? false;
  };
  const date = (k: FieldKey): string | null => {
    if (!get(k)) return null;
    const v = parseDate(get(k), ctx.dateOrder);
    if (!v) errors.push(`${label(k)} “${get(k)}” is not a date (use 2027-06-30).`);
    return v;
  };
  const url = (k: FieldKey): string | null => {
    if (!get(k)) return null;
    if (!isWebUrl(get(k))) {
      errors.push(`${label(k)} must start with https://.`);
      return null;
    }
    return get(k);
  };
  const option = (k: FieldKey, options: string[]): string | null => {
    if (!get(k)) return null;
    const match = options.find((o) => norm(o).replace(/ /g, "") === norm(get(k)).replace(/ /g, ""));
    if (!match)
      warnings.push(`${label(k)} “${get(k)}” is not one of the options in Settings -> Market.`);
    return match ?? get(k);
  };

  const priceOnRequest = flag("price_on_request");
  const price = money("price");
  let pricePeriod: "year" | "month" | null = null;
  if (get("rent_period")) {
    const p = PERIODS[norm(get("rent_period"))];
    if (!p) errors.push(`Rent period “${get("rent_period")}” is not year or month.`);
    else if (purpose === "sale") warnings.push("Rent period is ignored for a sale.");
    else pricePeriod = p;
  }
  if (purpose === "rent" && !pricePeriod) pricePeriod = ctx.rentPeriod;

  let serviceChargePerArea: number | null = null;
  {
    const k = get("service_charge_per_sqft")
      ? "service_charge_per_sqft"
      : get("service_charge_per_sqm")
        ? "service_charge_per_sqm"
        : null;
    if (k) {
      const v = money(k);
      if (v !== null) serviceChargePerArea = Math.round(perAreaToSqm(v, fieldByKey(k).unit!));
    }
  }

  const beds = get("beds") && /^studio$/i.test(get("beds")) ? 0 : whole("beds", 50);
  const thisYear = new Date().getFullYear();
  let yearBuilt: number | null = null;
  if (get("year_built")) {
    const y = parseNumber(get("year_built"));
    if (y === null || !Number.isInteger(y) || y < 1800 || y > thisYear + 10)
      errors.push(
        `Year built “${get("year_built")}” should be a year from 1800 to ${thisYear + 10}.`,
      );
    else yearBuilt = y;
  }

  let handoverDate: string | null = null;
  let handoverText: string | null = null;
  if (get("handover")) {
    const h = parseHandover(get("handover"), ctx.dateOrder);
    if (!h)
      errors.push(`Handover “${get("handover")}” should be a date or a quarter like Q4 2027.`);
    else {
      handoverDate = h.date;
      handoverText = h.text || null;
    }
  }

  let description: RichDoc | null = null;
  if (get("description")) {
    description = textToDoc(get("description"));
    if (!description) errors.push("The description is too long or could not be read.");
  }

  const highlights = splitList(get("highlights"), /\s*\|\s*|\n/);
  if (highlights.length > 12) errors.push("Use at most 12 highlights.");
  if (highlights.some((h) => h.length > 120))
    errors.push("A highlight is longer than 120 characters.");

  const view = splitList(get("view"), /[|,;\n]/);
  if (view.length > 10 || view.some((v) => v.length > 40))
    errors.push("Use at most 10 short views.");

  const facilityIds: string[] = [];
  const unknownFacilities: string[] = [];
  for (const name of splitList(get("facilities"), /[|,;\n]/)) {
    const found = matchByName(name, ctx.facilities);
    if (found.length >= 1) {
      if (!facilityIds.includes(found[0]!.id)) facilityIds.push(found[0]!.id);
    } else unknownFacilities.push(name);
  }
  if (unknownFacilities.length)
    warnings.push(`Facilities not set up, left out: ${unknownFacilities.join(", ")}.`);

  let agentId: string | null = null;
  if (get("agent")) {
    const v = get("agent").toLowerCase();
    const found = ctx.agents.filter(
      (a) => a.email?.toLowerCase() === v || matchByName(get("agent"), [a]).length > 0,
    );
    if (found.length === 1 && found[0]!.isActive) agentId = found[0]!.id;
    else if (found.length === 1)
      warnings.push(`Agent “${found[0]!.name}” is turned off; left unassigned.`);
    else if (found.length > 1)
      warnings.push(`Agent “${get("agent")}” matches several profiles; left unassigned.`);
    else warnings.push(`Agent “${get("agent")}” has no profile; left unassigned.`);
  }

  const photoUrls: string[] = [];
  const badPhotos: string[] = [];
  for (const u of splitList(get("photo_urls"), /[|\s]+/)) {
    if (isWebUrl(u)) {
      if (!photoUrls.includes(u)) photoUrls.push(u);
    } else badPhotos.push(u);
  }
  if (badPhotos.length)
    warnings.push(`Photo addresses that are not web links were left out: ${badPhotos.length}.`);
  if (photoUrls.length > 50) {
    warnings.push("Only the first 50 photos are downloaded.");
    photoUrls.length = 50;
  }

  const draft: ImportDraft = {
    title: get("title"),
    purpose: purpose ?? "sale",
    completion,
    propertyTypeId,
    locationId,
    buildingName: get("building") || null,
    addressLine: get("address") || null,
    unitNumber: get("unit_number") || null,
    floor: get("floor") || null,
    point,
    price,
    currency,
    priceOnRequest,
    pricePeriod,
    serviceChargePerArea,
    depositAmount: money("deposit"),
    agencyFeeText: get("agency_fee") || null,
    beds,
    baths: whole("baths", 50),
    size: area("size_sqft", "size_sqm"),
    plotSize: area("plot_size_sqft", "plot_size_sqm"),
    yearBuilt,
    parkingSpaces: whole("parking", 100),
    furnishing: option("furnishing", ctx.furnishingOptions),
    ownership: option("ownership", ctx.ownershipTypes),
    view,
    maidRoom: flag("maid_room"),
    study: flag("study"),
    handoverDate,
    handoverText,
    constructionProgress: whole("construction_progress", 100),
    expectedRentYearly: money("expected_rent"),
    isTenanted: flag("tenanted"),
    tenancyEndDate: date("tenancy_end"),
    description,
    highlights,
    facilityIds,
    videoUrl: url("video_url"),
    tourUrl: url("tour_url"),
    permitNumber: get("permit_number") || null,
    agentId,
    photoUrls,
    seoTitle: get("seo_title") || null,
    seoDescription: get("seo_description") || null,
  };
  if (!draft.title && errors.length === 0) warnings.push("No title yet: add one in the editor.");
  return { errors, warnings, draft: errors.length ? null : draft };
}

/** Columns mapped to the same field twice, or required fields not mapped at all. */
export function mappingProblems(columns: Array<FieldKey | null>): string[] {
  const problems: string[] = [];
  const seen = new Set<FieldKey>();
  for (const key of columns) {
    if (!key) continue;
    if (seen.has(key)) problems.push(`“${fieldByKey(key).label}” is chosen for two columns.`);
    seen.add(key);
    if (!fieldByKey(key).importable)
      problems.push(`“${fieldByKey(key).label}” cannot be imported.`);
  }
  for (const req of csvFields.filter((x) => x.required)) {
    if (!seen.has(req.key)) problems.push(`Choose the column for “${req.label}”.`);
  }
  const pairs: Array<[FieldKey, FieldKey, string]> = [
    ["size_sqft", "size_sqm", "size"],
    ["plot_size_sqft", "plot_size_sqm", "plot size"],
    ["service_charge_per_sqft", "service_charge_per_sqm", "service charge"],
  ];
  for (const [a, b, name] of pairs)
    if (seen.has(a) && seen.has(b)) problems.push(`Choose one ${name} column (sq ft or m²).`);
  if (seen.has("coordinates") && (seen.has("latitude") || seen.has("longitude")))
    problems.push("Choose either coordinates or latitude and longitude.");
  return problems;
}

export type ImportRowResult =
  | {
      line: number;
      ok: true;
      id: string;
      reference: string;
      title: string;
      photos: number;
      warnings: string[];
    }
  | { line: number; ok: false; errors: string[] };
