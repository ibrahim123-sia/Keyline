import { formatMoney, type CurrencyFormat } from "@/lib/money";

/** The market's currencies by code: the base one plus the visitor currencies (04 §3). */
export function currencyFormats(market: {
  baseCurrency: CurrencyFormat;
  visitorCurrencies: CurrencyFormat[];
}): Record<string, CurrencyFormat> {
  const all: Record<string, CurrencyFormat> = {};
  for (const c of market.visitorCurrencies) all[c.code] = pick(c);
  all[market.baseCurrency.code] = pick(market.baseCurrency);
  return all;
}

const pick = (c: CurrencyFormat): CurrencyFormat => ({
  code: c.code,
  symbol: c.symbol,
  symbolPosition: c.symbolPosition,
  decimals: c.decimals,
});

export function formatFor(code: string | null, formats: Record<string, CurrencyFormat>) {
  if (code && formats[code]) return formats[code];
  return { code: code ?? "", symbol: code ?? "", symbolPosition: "before", decimals: 2 } as const;
}

/** "AED 2,450,000", "AED 120,000 / year", or "Price on request". */
export function priceLabel(
  p: {
    price: number | null;
    currency: string | null;
    priceOnRequest: boolean;
    pricePeriod: "year" | "month" | null;
    purpose: "sale" | "rent";
  },
  formats: Record<string, CurrencyFormat>,
): string {
  if (p.priceOnRequest || p.price == null) return "Price on request";
  const amount = formatMoney(p.price, formatFor(p.currency, formats));
  return p.purpose === "rent" && p.pricePeriod ? `${amount} / ${p.pricePeriod}` : amount;
}

export const bedsLabel = (beds: number | null): string =>
  beds == null ? "—" : beds === 0 ? "Studio" : String(beds);
