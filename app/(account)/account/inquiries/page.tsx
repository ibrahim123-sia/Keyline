import { getDb } from "@/db/client";
import { inquiriesOf } from "@/features/account/queries";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";
import { leads as lt } from "@/lib/i18n/dictionaries/leads";

export const metadata = { title: account.nav.inquiries };
export const instant = false;

const t = account.inquiriesPage;
const date = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Inquiries (12 §2): what they asked us and where it stands. */
export default async function InquiriesPage() {
  const user = await requireCustomerPage();
  const rows = await inquiriesOf(await getDb(), user.id);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t.title}</h1>
      {rows.length === 0 ? (
        <p className="text-text-muted">{t.none}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-[20px] bg-surface p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{lt.sources[r.source]}</p>
                <span className="rounded-full bg-surface-muted px-3 py-1 text-[13px] font-semibold text-ink">
                  {t.status[r.status]}
                </span>
              </div>
              <p className="text-[13.5px] text-text-muted">{date(r.createdAt)}</p>
              {r.homes.length > 0 && (
                <p className="text-[14.5px]">
                  {t.about}{" "}
                  {r.homes.map((h, i) => (
                    <span key={h.slug}>
                      {i > 0 && ", "}
                      <a
                        href={`/property/${h.slug}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {h.reference} · {h.title}
                      </a>
                    </span>
                  ))}
                </p>
              )}
              {r.messages.map((m, i) => (
                <blockquote
                  key={i}
                  className="border-s-2 border-border ps-3 text-[14.5px] text-text"
                >
                  {m.body}
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
