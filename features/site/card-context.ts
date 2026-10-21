import "server-only";
import type { CardContext } from "@/components/site/listings/listing-card";
import { getSettings } from "@/features/settings/queries";
import { visitorCurrency } from "./currency";

/** What listing cards need to render for this visitor: currency and the market's units. */
export async function cardContext(): Promise<CardContext> {
  const [{ code, rates }, market] = await Promise.all([visitorCurrency(), getSettings("market")]);
  return {
    visitorCurrency: code,
    rates,
    areaUnit: market.areaUnit,
    distanceUnit: market.distanceUnit,
  };
}
