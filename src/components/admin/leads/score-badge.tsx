"use client";

import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Hot, warm or cold, by the score's band. */
export function scoreTone(score: number): string {
  if (score >= 70) return "border-accent bg-accent-soft text-ink";
  if (score >= 40) return "border-border bg-muted text-ink";
  return "border-border bg-surface text-text-muted";
}

/**
 * The lead score with its reasons one click away (10 §2: the UI always shows the reasons,
 * never just the number).
 */
export function ScoreBadge({
  score,
  reasons,
  className,
}: {
  score: number | null;
  reasons: string | null;
  className?: string;
}) {
  if (score === null) return <span className="text-[12.5px] text-text-muted">Not scored</span>;
  const lines = (reasons ?? "").split("\n").filter(Boolean);
  return (
    <Popover>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label={`Score ${score}: see why`}
        className={cn(
          "inline-flex h-6 min-w-9 items-center justify-center rounded-full border px-2 text-[12.5px] font-semibold tabular",
          scoreTone(score),
          className,
        )}
      >
        {score}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 text-[13px]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 font-semibold text-ink">Why {score}</p>
        {lines.length ? (
          <ul className="flex flex-col gap-1">
            {lines.map((l) => (
              <li key={l} className="flex gap-2">
                <span
                  className={cn(
                    "w-8 shrink-0 text-end font-semibold tabular",
                    l.startsWith("-") ? "text-danger" : "text-ink",
                  )}
                >
                  {l.split(" ")[0]}
                </span>
                <span className="text-text-muted">{l.split(" ").slice(1).join(" ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-muted">No signals yet: the starting score.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
