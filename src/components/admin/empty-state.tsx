import type { ReactNode } from "react";
import { InboxIcon } from "lucide-react";

/** Empty state (02 §6): helpful text and one action. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-text-muted">
        {icon ?? <InboxIcon className="size-5" aria-hidden />}
      </div>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-[13px] text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
