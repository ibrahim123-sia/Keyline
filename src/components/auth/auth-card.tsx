import type { ReactNode } from "react";
import { cn } from "cn";

/** Card used by every sign-in / sign-up screen (site and admin). */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[440px]", className)}>
      <div className="rounded-card border border-border bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-display text-[30px] leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-[15px]">{footer}</div>}
    </div>
  );
}

export function FormAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-input border px-4 py-3 text-[14px] leading-snug",
        tone === "error" && "border-danger/30 bg-danger/5 text-danger",
        tone === "success" && "border-success/30 bg-success-soft text-success",
        tone === "info" && "border-border bg-surface-soft text-ink",
      )}
    >
      {children}
    </div>
  );
}
