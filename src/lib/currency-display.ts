import { formatMoney, type CurrencyFormat } from "./money";

/**
 * Prices in the visitor's currency (06 §2 currency switcher). Listings keep their own
 * currency; conversions use the example or real rates from Settings -> Market and are always
 * marked "≈" with the listed price in the tooltip. Pure: safe on the server and the client.
 */
export type Rates = {
  base: CurrencyFormat;
  /** Units of each currency for 1 unit of the base currency. */
  others: Array<CurrencyFormat & { rate: number }>;
};

const scale = (decimals: number) => 10 ** decimals;

function formatOf(code: string, rates: Rates): (CurrencyFormat & { rate: number }) | null {
  if (code === rates.base.code) return { ...rates.base, rate: 1 };
  return rates.others.find((c) => c.code === code) ?? null;
}

/** Minor units of `from` as minor units of the base currency (null: unknown currency). */
export function toBaseMinor(amount: number, from: string, rates: Rates): number | null {
  const c = formatOf(from, rates);
  if (!c) return null;
  return Math.round((amount / scale(c.decimals) / c.rate) * scale(rates.base.decimals));
}

/** Minor units of the base currency as minor units of `to`. */
export function fromBaseMinor(amount: number, to: string, rates: Rates): number | null {
  const c = formatOf(to, rates);
  if (!c) return null;
  return Math.round((amount / scale(rates.base.decimals)) * c.rate * scale(c.decimals));
}

export type DisplayPrice = {
  /** What to show: "AED 2,450,000" or "≈ $667,000". */
  text: string;
  approximate: boolean;
  /** The listed price, for the tooltip of an approximate one. */
  listed: string;
};

/** A price in the visitor's currency, or as listed when that is the same (or unknown). */
export function displayPrice(
  amount: number,
  listingCurrency: string,
  visitorCurrency: string | null,
  rates: Rates,
): DisplayPrice {
  const listedFormat = formatOf(listingCurrency, rates) ?? {
    code: listingCurrency,
    symbol: listingCurrency,
    symbolPosition: "before" as const,
    decimals: 2,
    rate: 1,
  };
  const listed = formatMoney(amount, listedFormat);
  const target = visitorCurrency ? formatOf(visitorCurrency, rates) : null;
  if (!target || target.code === listingCurrency)
    return { text: listed, approximate: false, listed };
  const base = toBaseMinor(amount, listingCurrency, rates);
  const converted = base == null ? null : fromBaseMinor(base, target.code, rates);
  if (converted == null) return { text: listed, approximate: false, listed };
  // Converted prices are estimates: no false precision.
  const rounded = roundForDisplay(converted, target.decimals);
  return { text: `≈ ${formatMoney(rounded, target)}`, approximate: true, listed };
}

/** Three significant figures, in whole units ($667,000 rather than $667,123.45). */
export function roundForDisplay(minor: number, decimals: number): number {
  const major = minor / scale(decimals);
  if (major < 1000) return Math.round(major) * scale(decimals);
  const digits = Math.floor(Math.log10(major)) + 1;
  const step = 10 ** Math.max(0, digits - 3);
  return Math.round(major / step) * step * scale(decimals);
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });

/** Short map-pin label: "2.45M", "120K". */
export function compactAmount(minor: number, decimals: number): string {
  return compact.format(minor / scale(decimals));
}
