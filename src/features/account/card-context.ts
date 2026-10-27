import "server-only";
import type { CardContext } from "@/components/site/listings/listing-card";
import { getSettings } from "@/features/settings/queries";
import { visitorCurrency } from "@/features/site/currency";

/** Listing cards in the customer area: the visitor's currency and the market's units. */
export async function accountCardContext(): Promise<CardContext> {
  const [market, visitor] = [await getSettings("market"), await visitorCurrency()];
  return {
    visitorCurrency: visitor.code,
    rates: visitor.rates,
    areaUnit: market.areaUnit,
    distanceUnit: market.distanceUnit,
  };
}
