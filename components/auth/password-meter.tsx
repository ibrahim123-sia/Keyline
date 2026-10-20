"use client";

import { cn } from "cn";
import { site } from "@/lib/i18n";
import { passwordStrength } from "@/lib/password-strength";

const labels = [
  site.auth.passwordStrength.weak,
  site.auth.passwordStrength.fair,
  site.auth.passwordStrength.good,
  site.auth.passwordStrength.strong,
];

/** Strength bar for the sign-up and reset forms (12 §1). */
export function PasswordMeter({
  password,
  context = [],
}: {
  password: string;
  context?: string[];
}) {
  if (!password) return null;
  const score = passwordStrength(password, context);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-border transition-colors duration-150",
              i <= score && score === 0 && "bg-danger",
              i <= score && score === 1 && "bg-[#C9A227]",
              i <= score && score >= 2 && "bg-success",
            )}
          />
        ))}
      </div>
      <span className="text-[13px] font-medium text-text-muted">{labels[score]}</span>
    </div>
  );
}
