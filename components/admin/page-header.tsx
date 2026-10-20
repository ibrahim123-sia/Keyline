import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";

/** Title row of every admin screen: breadcrumb, title, short description, actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-text-muted">
              {breadcrumb.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {b.href ? (
                    <Link href={b.href} className="hover:text-ink hover:underline">
                      {b.label}
                    </Link>
                  ) : (
                    <span>{b.label}</span>
                  )}
                  {i < breadcrumb.length - 1 && <ChevronRightIcon className="size-3" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13.5px] text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Card section inside admin forms (02 §4: FormSection). */
export function FormSection({
  title,
  description,
  children,
  id,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  actions?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-text-muted">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
    </section>
  );
}
