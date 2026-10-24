import type { MarketSettings } from "@/features/settings/schema";
import { toMajor, toMinor } from "@/lib/money";
import {
  downPaymentFromPct,
  minDownPayment,
  type MortgageInput,
  type RentalMode,
  type RoiInput,
} from "./math";

/**
 * The calculators' inputs and their share links (11 §1 "Share link with inputs in the URL").
 * Money in the address is in major units of the base currency ("price=2300000"), so links
 * stay readable; in the state it is minor units. Anything missing, unreadable or out of range
 * falls back to the Settings default or is clamped. Client-safe: no Zod.
 */

export type MortgageDefaults = MarketSettings["mortgage"];
export type RoiDefaultsSettings = MarketSettings["roi"];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function raw(params: Params, key: string): string | null {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === "string" && first.trim() !== "" ? first.trim() : null;
}

function num(params: Params, key: string): number | null {
  const v = raw(params, key);
  if (v === null || v.length > 30) return null;
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Rounds a percentage typed or shared to two decimals. */
const pct2 = (v: number) => Math.round(v * 100) / 100;

/** The highest price either calculator accepts, in major units. */
export const MAX_PRICE_MAJOR = 1_000_000_000_000;
/** The largest size, in area units. */
export const MAX_SIZE = 10_000_000;

/** A listing reference such as HD-1001 (where the calculator was opened from). */
const REF = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
function ref(params: Params): string | null {
  const v = raw(params, "ref");
  return v && REF.test(v) ? v : null;
}

function money(params: Params, key: string, decimals: number, fallback: number): number {
  const v = num(params, key);
  return v === null ? fallback : toMinor(clamp(v, 0, MAX_PRICE_MAJOR), decimals);
}

function percent(params: Params, key: string, min: number, max: number, fallback: number) {
  const v = num(params, key);
  return v === null ? fallback : pct2(clamp(v, min, max));
}

/* Mortgage ---------------------------------------------------------------------- */

export type MortgageState = {
  /** Minor units. */
  price: number;
  /** How the down payment is typed: a share of the price, or an amount. */
  downMode: "pct" | "amount";
  downPct: number;
  /** Minor units (used in "amount" mode). */
  downAmount: number;
  years: number;
  ratePct: number;
  registrationFeePct: number;
  agencyFeePct: number;
  arrangementFeePct: number;
  /** The listing it was opened from. */
  ref: string | null;
};

export const mortgageRanges = {
  ratePct: { min: 0, max: 30 },
  feePct: { min: 0, max: 20 },
} as const;

/** The smallest down payment share the loan-to-value limit allows. */
export const minDownPct = (d: MortgageDefaults) => Math.max(0, 100 - d.maxLtvPct);

/** The down payment in minor units, whichever way it was typed, within the limits. */
export function downPaymentOf(s: MortgageState, d: MortgageDefaults): number {
  const amount =
    s.downMode === "amount"
      ? Math.min(s.downAmount, s.price)
      : downPaymentFromPct(s.price, s.downPct);
  return Math.max(amount, minDownPayment(s.price, d.maxLtvPct));
}

/** The calculator's state as the maths' input. */
export function mortgageInputOf(s: MortgageState, d: MortgageDefaults): MortgageInput {
  return {
    price: s.price,
    downPayment: downPaymentOf(s, d),
    years: s.years,
    ratePct: s.ratePct,
    registrationFeePct: s.registrationFeePct,
    agencyFeePct: s.agencyFeePct,
    arrangementFeePct: s.arrangementFeePct,
  };
}

/** Reads a share link (or a property page link) over the Settings defaults. */
export function parseMortgageParams(
  params: Params,
  d: MortgageDefaults,
  ctx: { decimals: number; typicalPrice: number },
): MortgageState {
  const price = money(params, "price", ctx.decimals, ctx.typicalPrice);
  const minPct = minDownPct(d);
  const amount = num(params, "dp");
  const downMode = amount !== null ? "amount" : "pct";
  const downAmount =
    amount !== null
      ? Math.max(
          minDownPayment(price, d.maxLtvPct),
          Math.min(price, toMinor(clamp(amount, 0, MAX_PRICE_MAJOR), ctx.decimals)),
        )
      : downPaymentFromPct(price, Math.max(minPct, d.downPaymentPct));
  return {
    price,
    downMode,
    downPct: percent(params, "down", minPct, 100, clamp(d.downPaymentPct, minPct, 100)),
    downAmount,
    years: Math.round(clamp(num(params, "years") ?? d.years, 1, Math.max(1, d.maxYears))),
    ratePct: percent(params, "rate", 0, mortgageRanges.ratePct.max, d.interestRatePct),
    registrationFeePct: percent(params, "reg", 0, 20, d.registrationFeePct),
    agencyFeePct: percent(params, "agency", 0, 20, d.agencyFeePct),
    arrangementFeePct: percent(params, "arr", 0, 20, d.arrangementFeePct),
    ref: ref(params),
  };
}

const major = (minor: number, decimals: number) => String(toMajor(minor, decimals));

/** The query string of a share link: every input, so the numbers match whatever the defaults. */
export function mortgageSearch(s: MortgageState, decimals: number): string {
  const q = new URLSearchParams();
  q.set("price", major(s.price, decimals));
  if (s.downMode === "amount") q.set("dp", major(s.downAmount, decimals));
  else q.set("down", String(s.downPct));
  q.set("years", String(s.years));
  q.set("rate", String(s.ratePct));
  q.set("reg", String(s.registrationFeePct));
  q.set("agency", String(s.agencyFeePct));
  q.set("arr", String(s.arrangementFeePct));
  if (s.ref) q.set("ref", s.ref);
  return q.toString();
}

/* Rental returns ----------------------------------------------------------------- */

export type RoiState = {
  price: number;
  purchaseCostsPct: number;
  mode: RentalMode;
  rentYearly: number;
  nightlyHigh: number;
  nightlyLow: number;
  highSeasonMonths: number;
  occupancyPct: number;
  managementFeePct: number;
  /** Minor units per market area unit a year. */
  serviceChargePerArea: number;
  /** Market area units. */
  size: number;
  maintenancePct: number;
  vacancyPct: number;
  mortgageOn: boolean;
  downPct: number;
  ratePct: number;
  years: number;
  rentGrowthPct: number;
  priceGrowthPct: number;
  ref: string | null;
};

/** Slider ranges (11 §2: occupancy 50–90%, management fee 15–25%), widened to fit the defaults. */
export function roiRanges(d: RoiDefaultsSettings) {
  return {
    occupancyPct: { min: Math.min(50, d.occupancyPct), max: Math.max(90, d.occupancyPct) },
    managementFeePct: {
      min: Math.min(15, d.managementFeePct),
      max: Math.max(25, d.managementFeePct),
    },
    growthPct: { min: -20, max: 30 },
  };
}

export type RoiTypical = { price: number; rentYearly: number; size: number };

export function parseRoiParams(
  params: Params,
  d: RoiDefaultsSettings,
  m: MortgageDefaults,
  ctx: { decimals: number; typical: RoiTypical },
): RoiState {
  const ranges = roiRanges(d);
  const minPct = minDownPct(m);
  const size = num(params, "size");
  return {
    price: money(params, "price", ctx.decimals, ctx.typical.price),
    purchaseCostsPct: percent(params, "pc", 0, 20, d.purchaseCostsPct),
    mode: raw(params, "mode") === "short" ? "short" : "long",
    rentYearly: money(params, "rent", ctx.decimals, ctx.typical.rentYearly),
    nightlyHigh: money(params, "high", ctx.decimals, 0),
    nightlyLow: money(params, "low", ctx.decimals, 0),
    highSeasonMonths: Math.round(clamp(num(params, "hs") ?? 6, 0, 12)),
    occupancyPct: percent(
      params,
      "occ",
      ranges.occupancyPct.min,
      ranges.occupancyPct.max,
      d.occupancyPct,
    ),
    managementFeePct: percent(
      params,
      "mgmt",
      ranges.managementFeePct.min,
      ranges.managementFeePct.max,
      d.managementFeePct,
    ),
    serviceChargePerArea: money(params, "sc", ctx.decimals, d.serviceChargePerArea),
    size: size === null ? ctx.typical.size : Math.round(clamp(size, 0, MAX_SIZE) * 100) / 100,
    maintenancePct: percent(params, "maint", 0, 20, d.maintenancePct),
    vacancyPct: percent(params, "vac", 0, 100, d.vacancyPct),
    mortgageOn: raw(params, "mtg") === "1",
    downPct: percent(params, "down", minPct, 100, clamp(m.downPaymentPct, minPct, 100)),
    ratePct: percent(params, "rate", 0, mortgageRanges.ratePct.max, m.interestRatePct),
    years: Math.round(clamp(num(params, "years") ?? m.years, 1, Math.max(1, m.maxYears))),
    rentGrowthPct: percent(params, "rg", -20, 30, d.rentGrowthPct),
    priceGrowthPct: percent(params, "pg", -20, 30, d.priceGrowthPct),
    ref: ref(params),
  };
}

export function roiInputOf(s: RoiState): RoiInput {
  return {
    price: s.price,
    purchaseCostsPct: s.purchaseCostsPct,
    mode: s.mode,
    rentYearly: s.rentYearly,
    nightlyHigh: s.nightlyHigh,
    nightlyLow: s.nightlyLow,
    highSeasonMonths: s.highSeasonMonths,
    occupancyPct: s.occupancyPct,
    managementFeePct: s.managementFeePct,
    serviceChargePerArea: s.serviceChargePerArea,
    size: s.size,
    maintenancePct: s.maintenancePct,
    vacancyPct: s.vacancyPct,
    mortgage: s.mortgageOn
      ? { downPayment: downPaymentFromPct(s.price, s.downPct), ratePct: s.ratePct, years: s.years }
      : null,
    rentGrowthPct: s.rentGrowthPct,
    priceGrowthPct: s.priceGrowthPct,
  };
}

export function roiSearch(s: RoiState, decimals: number): string {
  const q = new URLSearchParams();
  q.set("price", major(s.price, decimals));
  q.set("pc", String(s.purchaseCostsPct));
  q.set("mode", s.mode);
  if (s.mode === "long") {
    q.set("rent", major(s.rentYearly, decimals));
    q.set("vac", String(s.vacancyPct));
  } else {
    q.set("high", major(s.nightlyHigh, decimals));
    q.set("low", major(s.nightlyLow, decimals));
    q.set("hs", String(s.highSeasonMonths));
    q.set("occ", String(s.occupancyPct));
    q.set("mgmt", String(s.managementFeePct));
  }
  q.set("sc", major(s.serviceChargePerArea, decimals));
  q.set("size", String(s.size));
  q.set("maint", String(s.maintenancePct));
  if (s.mortgageOn) {
    q.set("mtg", "1");
    q.set("down", String(s.downPct));
    q.set("rate", String(s.ratePct));
    q.set("years", String(s.years));
  }
  q.set("rg", String(s.rentGrowthPct));
  q.set("pg", String(s.priceGrowthPct));
  if (s.ref) q.set("ref", s.ref);
  return q.toString();
}

/* Property page links -------------------------------------------------------------- */

/** /tools/mortgage for a listing: its price (major units) and reference. */
export function mortgageLinkFor(l: { price: number; reference: string }, decimals: number) {
  const q = new URLSearchParams({ price: major(l.price, decimals), ref: l.reference });
  return `/tools/mortgage?${q.toString()}`;
}

/**
 * /tools/rental-returns for a listing. Money in the base currency's major units, the size and
 * service charge already in the market's area unit.
 */
export function roiLinkFor(
  l: {
    price: number;
    reference: string;
    rentYearly: number | null;
    size: number | null;
    serviceChargePerArea: number | null;
  },
  decimals: number,
) {
  const q = new URLSearchParams({ price: major(l.price, decimals), ref: l.reference });
  if (l.rentYearly != null) q.set("rent", major(l.rentYearly, decimals));
  if (l.size != null) q.set("size", String(Math.round(l.size * 100) / 100));
  if (l.serviceChargePerArea != null)
    q.set("sc", major(Math.round(l.serviceChargePerArea), decimals));
  return `/tools/rental-returns?${q.toString()}`;
}

/* Pre-approval income bands ----------------------------------------------------------- */

/**
 * "Under 15,000", "15,000 to 30,000", "30,000 or more" from Settings -> Market income band
 * limits (minor units of the base currency). The band's index is what the form sends.
 */
export function incomeBandLabels(
  limits: readonly number[],
  formatAmount: (minor: number) => string,
  words: { under: string; between: string; over: string },
): string[] {
  if (limits.length === 0) return [];
  const fill = (t: string, v: Record<string, string>) =>
    t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
  return [
    fill(words.under, { amount: formatAmount(limits[0]!) }),
    ...limits
      .slice(1)
      .map((to, i) =>
        fill(words.between, { from: formatAmount(limits[i]!), to: formatAmount(to) }),
      ),
    fill(words.over, { amount: formatAmount(limits[limits.length - 1]!) }),
  ];
}
