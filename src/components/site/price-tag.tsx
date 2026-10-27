import { cn } from "cn";
import { displayPrice, type Rates } from "@/lib/currency-display";

/**
 * PriceTag (02 §4): the visitor's currency with "≈" when converted (tooltip with the listed
 * price), "Price on request", "from" and "/ year" or "/ month" for rentals.
 */
export function PriceTag({
  price,
  currency,
  visitorCurrency,
  rates,
  period,
  from,
  className,
  onRequestText = "Price on request",
}: {
  price: number | null;
  currency: string;
  visitorCurrency: string;
  rates: Rates;
  period?: "year" | "month" | null;
  from?: boolean;
  className?: string;
  onRequestText?: string;
}) {
  if (price == null)
    return <span className={cn("font-bold text-ink", className)}>{onRequestText}</span>;
  const d = displayPrice(price, currency, visitorCurrency, rates);
  return (
    <span className={cn("font-bold text-ink tabular", className)}>
      {from && <span className="me-1 text-[0.75em] font-medium text-text-muted">from</span>}
      <span title={d.approximate ? `Approximate. Listed price is ${d.listed}.` : undefined}>
        {d.text}
      </span>
      {period && <span className="ms-1 text-[0.7em] font-medium text-text-muted">/ {period}</span>}
    </span>
  );
}
