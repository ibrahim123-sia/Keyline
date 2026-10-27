/**
 * Money is stored as integers in the currency's minor unit (cents, fils): 05 §5. Formatting
 * follows Settings -> Market (symbol, its position, decimals); nothing assumes a currency.
 */
export type CurrencyFormat = {
  code: string;
  symbol: string;
  symbolPosition: "before" | "after";
  decimals: number;
};

export const toMajor = (minor: number, decimals: number): number => minor / 10 ** decimals;

/** Whole minor units; input like 1250000.5 with 2 decimals gives 125000050. */
export const toMinor = (major: number, decimals: number): number =>
  Math.round(major * 10 ** decimals);

const groupers = new Map<string, Intl.NumberFormat>();
function grouper(fractionDigits: number): Intl.NumberFormat {
  const key = String(fractionDigits);
  let f = groupers.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    groupers.set(key, f);
  }
  return f;
}

/** "1,250,000" or "1,250,000.50": decimals only when the amount has a fraction. */
export function formatAmount(minor: number, decimals: number): string {
  const major = toMajor(minor, decimals);
  const whole = Number.isInteger(major) || decimals === 0;
  return grouper(whole ? 0 : decimals).format(major);
}

/** "AED 1,250,000", "$1,250,000", "1,250,000 €". */
export function formatMoney(minor: number, currency: CurrencyFormat): string {
  const amount = formatAmount(minor, currency.decimals);
  const letters = /^[A-Za-z]+$/.test(currency.symbol);
  if (currency.symbolPosition === "after") return `${amount} ${currency.symbol}`;
  return letters ? `${currency.symbol} ${amount}` : `${currency.symbol}${amount}`;
}
