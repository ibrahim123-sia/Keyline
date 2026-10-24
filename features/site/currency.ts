import "server-only";
import { cookies } from "next/headers";
import { getSettings } from "@/features/settings/queries";
import type { Rates } from "@/lib/currency-display";

/** The visitor's display currency (06 §2): a cookie set by the currency switcher. */
export const CURRENCY_COOKIE = "keyline_currency";

/** Rates from Settings -> Market (cached with the settings). */
export async function siteRates(): Promise<Rates> {
  const market = await getSettings("market");
  return {
    base: market.baseCurrency,
    others: market.visitorCurrencies.filter((c) => c.code !== market.baseCurrency.code),
  };
}

/** The chosen currency if the market offers it; otherwise the base currency. */
export async function visitorCurrency(): Promise<{ code: string; rates: Rates }> {
  const rates = await siteRates();
  const chosen = (await cookies()).get(CURRENCY_COOKIE)?.value;
  const known =
    chosen && (chosen === rates.base.code || rates.others.some((c) => c.code === chosen));
  return { code: known ? chosen : rates.base.code, rates };
}
