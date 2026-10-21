/**
 * Listing money maths shared by the property page and, later, the tools (11-tools.md). Pure:
 * minor units in, minor units out.
 */

/** Monthly repayment of a loan (annuity): P × r / (1 − (1 + r)^−n). */
export function monthlyPayment(loan: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (n <= 0 || loan <= 0) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return Math.round(loan / n);
  return Math.round((loan * r) / (1 - (1 + r) ** -n));
}

export type RoiDefaults = { vacancyPct: number; maintenancePct: number; purchaseCostsPct: number };

/**
 * Gross yield = yearly rent / price. The estimated net yield takes off a vacancy allowance,
 * the yearly service charge and maintenance, and adds purchase costs to the price.
 * Percentages with one decimal.
 */
export function yields(
  input: {
    price: number;
    rentYearly: number;
    /** Minor units per m² per year. */
    serviceChargePerArea: number | null;
    /** m² */
    size: number | null;
  },
  roi: RoiDefaults,
): { gross: number; net: number } {
  const gross = (input.rentYearly / input.price) * 100;
  const service =
    input.serviceChargePerArea && input.size ? input.serviceChargePerArea * input.size : 0;
  const income = input.rentYearly * (1 - roi.vacancyPct / 100);
  const costs = service + input.price * (roi.maintenancePct / 100);
  const net = ((income - costs) / (input.price * (1 + roi.purchaseCostsPct / 100))) * 100;
  return { gross: Math.round(gross * 10) / 10, net: Math.round(net * 10) / 10 };
}
