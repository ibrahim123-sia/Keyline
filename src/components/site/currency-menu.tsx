import { getSettings } from "@/features/settings/queries";
import { visitorCurrency } from "@/features/site/currency";
import { CurrencySwitcher } from "./currency-switcher";

/** Reads the visitor's currency cookie (dynamic: render it inside a Suspense boundary). */
export async function CurrencyMenu({ variant }: { variant?: "menu" | "list" }) {
  const [{ code }, market] = await Promise.all([visitorCurrency(), getSettings("market")]);
  const base = market.baseCurrency;
  const options = [
    { code: base.code, symbol: base.symbol, example: false },
    ...market.visitorCurrencies
      .filter((c) => c.code !== base.code)
      .map((c) => ({ code: c.code, symbol: c.symbol, example: c.isExample })),
  ];
  return <CurrencySwitcher current={code} options={options} variant={variant} />;
}
