"use client";

import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

/**
 * Label + input + description + error, wired for screen readers (14 §4: errors announced and
 * linked to fields).
 */
export const TextField = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<typeof Input>, "id"> & {
    label: string;
    error?: string;
    description?: ReactNode;
    labelExtra?: ReactNode;
  }
>(function TextField({ label, error, description, labelExtra, size = "lg", ...props }, ref) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold text-ink">
          {label}
        </label>
        {labelExtra}
      </div>
      <Input
        ref={ref}
        id={id}
        size={size}
        aria-invalid={error ? true : undefined}
        aria-describedby={[descId, errId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {description && (
        <div id={descId} className="text-[13px] text-text-muted">
          {description}
        </div>
      )}
      {error && (
        <p id={errId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
