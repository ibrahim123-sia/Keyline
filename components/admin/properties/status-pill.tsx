import { cn } from "cn";
import type { PropertyStatus } from "@/db/schema/properties";
import { statusLabels } from "@/features/properties/status";

const styles: Record<PropertyStatus, string> = {
  draft: "bg-surface-muted text-text-muted",
  available: "bg-success-soft text-success",
  reserved: "bg-accent-soft text-accent",
  under_offer: "bg-accent-soft text-accent",
  sold: "bg-ink text-surface",
  rented: "bg-ink text-surface",
  off_market: "border border-dashed border-border text-text-muted",
};

export function StatusPill({ status, className }: { status: PropertyStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
