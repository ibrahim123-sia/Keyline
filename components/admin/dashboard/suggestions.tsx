import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { cn } from "cn";
import type { DashboardSuggestion } from "@/features/reports/suggestions";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

/**
 * The dashboard's suggestion cards (the slot the AI layer fills through
 * `loadDashboardSuggestions`). Renders nothing when there are none.
 */
export function DashboardSuggestions({ suggestions }: { suggestions: DashboardSuggestion[] }) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="dashboard-suggestions" className="flex flex-col gap-3">
      <h2 id="dashboard-suggestions" className="text-[14px] font-semibold text-ink">
        {t.dashboard.suggestionsHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "rounded-lg border bg-surface px-4 py-3",
              s.tone === "warning" ? "border-danger/40" : "border-border",
            )}
          >
            <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <SparklesIcon className="size-4 text-accent" aria-hidden />
              {s.title}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">{s.body}</p>
            {s.href && s.actionLabel && (
              <Link
                href={s.href}
                className="mt-2 inline-block text-[12.5px] font-semibold text-ink hover:underline"
              >
                {s.actionLabel}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
