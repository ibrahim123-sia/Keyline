"use client";

import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/**
 * The page frame of the post and area guide editors: section links, the form, the sticky
 * publishing panel and the "leave without saving?" dialog.
 */
export function ContentEditorLayout({
  sections,
  readOnly,
  onSubmit,
  panel,
  guard,
  children,
}: {
  sections: Array<{ id: string; label: string }>;
  readOnly: boolean;
  onSubmit: () => void;
  panel: ReactNode;
  guard: { pending: string | null; cancel: () => void; leave: () => void };
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[10rem_minmax(0,1fr)_18rem]">
      <nav aria-label="Sections" className="sticky top-20 hidden lg:block">
        <ul className="flex flex-col gap-0.5 text-[13px]">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-md px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-ink"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <form
        className="order-2 flex min-w-0 flex-col gap-5 lg:order-none"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {readOnly && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-2 text-[13px] text-text-muted">
            You can look around, but changes are not saved in this account.
          </p>
        )}
        {children}
      </form>

      <div className="order-1 lg:sticky lg:top-20 lg:order-none">{panel}</div>

      <ConfirmDialog
        open={guard.pending !== null}
        onOpenChange={(o) => !o && guard.cancel()}
        title="Leave without saving?"
        description="Your latest changes are not saved yet."
        confirmLabel="Leave"
        destructive
        onConfirm={guard.leave}
      />
    </div>
  );
}
