import Link from "next/link";
import { CampaignTabs } from "@/components/admin/campaigns/campaign-tabs";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listSubscribers, parseStatus, subscriberStatuses } from "@/features/newsletter/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Newsletter" };
export const instant = false;

const PAGE_SIZE = 50;
const labels = {
  confirmed: "Confirmed",
  pending: "Waiting for confirmation",
  unsubscribed: "Unsubscribed",
};

/** Campaigns -> Newsletter (05 §13): who signed up, from where, and who confirmed. */
export default async function NewsletterPage(props: PageProps<"/admin/campaigns/newsletter">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = parseStatus(sp.status);
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "", 10) || 1);
  const { rows, total, counts } = await listSubscribers(await getDb(), {
    q,
    status,
    page,
    pageSize: PAGE_SIZE,
  });
  const qs = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const all = { q, status, page, ...patch };
    for (const [k, v] of Object.entries(all))
      if (v !== null && v !== "" && v !== 1) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
  const control = "h-9 rounded-input border border-input bg-surface px-2.5 text-[13.5px] text-ink";

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Newsletter subscribers. People are on the list only after they confirm by email; anyone can leave with the link in every email."
        breadcrumb={[{ label: "Campaigns", href: "/admin/campaigns" }, { label: "Newsletter" }]}
      />
      <CampaignTabs current="newsletter" />
      <p className="mb-3 text-[13px] text-text-muted">
        {counts.confirmed} confirmed · {counts.pending} waiting · {counts.unsubscribed} unsubscribed
      </p>
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3"
        aria-label="Find subscribers"
      >
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          Email
          <input type="search" name="q" defaultValue={q} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          Status
          <select name="status" defaultValue={status ?? ""} className={control}>
            <option value="">All</option>
            {subscriberStatuses.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-button bg-ink px-4 text-[13.5px] font-semibold text-surface"
        >
          Find
        </button>
        <Link
          href={`/api/admin/newsletter/export${qs({ page: null })}`}
          className="h-9 rounded-button border border-border px-4 text-[13.5px] leading-9 font-semibold text-ink hover:border-ink/40"
        >
          Export CSV
        </Link>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">Newsletter subscribers</caption>
          <thead className="bg-muted text-left text-[12px] text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-2">
                Email
              </th>
              <th scope="col" className="px-4 py-2">
                Status
              </th>
              <th scope="col" className="px-4 py-2">
                Signed up from
              </th>
              <th scope="col" className="px-4 py-2">
                Signed up
              </th>
              <th scope="col" className="px-4 py-2">
                Confirmed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                  No subscribers yet. Switch on the footer signup in Website -&gt; Menus, or add a
                  newsletter form to a page.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium text-ink">{r.email}</td>
                <td className="px-4 py-2">{labels[r.status]}</td>
                <td className="px-4 py-2 text-text-muted">{r.source ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{date(r.createdAt)}</td>
                <td className="px-4 py-2 tabular-nums">{date(r.confirmedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-[13.5px]">
          {page > 1 && (
            <Link href={`/admin/campaigns/newsletter${qs({ page: page - 1 })}`}>Previous</Link>
          )}
          <span className="text-text-muted">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          {page * PAGE_SIZE < total && (
            <Link href={`/admin/campaigns/newsletter${qs({ page: page + 1 })}`}>Next</Link>
          )}
        </nav>
      )}
    </>
  );
}
