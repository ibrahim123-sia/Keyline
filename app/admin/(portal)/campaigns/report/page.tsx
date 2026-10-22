import Link from "next/link";
import { CampaignTabs } from "@/components/admin/campaigns/campaign-tabs";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import {
  campaignReport,
  defaultRange,
  reportDimensions,
  reportParamsSchema,
} from "@/features/utm/report";
import { requireAdminPage } from "@/lib/auth/guards";
import { localDateString } from "@/lib/local-date";

export const metadata = { title: "Campaign report" };
export const instant = false;

const dimensionLabels = {
  source: "Source",
  medium: "Medium",
  campaign: "Campaign",
  channel: "Channel",
} as const;

/** Campaigns -> Report (09 §2): which sources, mediums, campaigns and channels bring business. */
export default async function CampaignReportPage(props: PageProps<"/admin/campaigns/report">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const db = await getDb();
  const general = await loadSettings("general", db);
  const market = await loadSettings("market", db);
  const parsed = reportParamsSchema.parse({
    dimension: sp.dimension,
    touch: sp.touch,
    from: sp.from ?? null,
    to: sp.to ?? null,
  });
  const range = defaultRange(localDateString(new Date(), general.timeZone));
  const params = { ...parsed, from: parsed.from ?? range.from, to: parsed.to ?? range.to };
  const { rows, total, currency } = await campaignReport(db, params);
  const money = (minor: number) =>
    new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      minor / 10 ** market.baseCurrency.decimals,
    );
  const query = new URLSearchParams({
    dimension: params.dimension,
    touch: params.touch,
    from: params.from,
    to: params.to,
  }).toString();
  const control = "h-9 rounded-input border border-input bg-surface px-2.5 text-[13.5px] text-ink";

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Leads, viewings and won deals by where people came from. First touch credits the first visit; last touch the visit before they got in touch."
        breadcrumb={[{ label: "Campaigns", href: "/admin/campaigns" }, { label: "Report" }]}
      />
      <CampaignTabs current="report" />
      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3"
        aria-label="Report filters"
      >
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          By
          <select name="dimension" defaultValue={params.dimension} className={control}>
            {reportDimensions.map((d) => (
              <option key={d} value={d}>
                {dimensionLabels[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          Credit
          <select name="touch" defaultValue={params.touch} className={control}>
            <option value="first">First touch</option>
            <option value="last">Last touch</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          From
          <input type="date" name="from" defaultValue={params.from} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
          To
          <input type="date" name="to" defaultValue={params.to} className={control} />
        </label>
        <button
          type="submit"
          className="h-9 rounded-button bg-ink px-4 text-[13.5px] font-semibold text-surface"
        >
          Show
        </button>
        <Link
          href={`/api/admin/campaigns/report?${query}`}
          className="h-9 rounded-button border border-border px-4 text-[13.5px] leading-9 font-semibold text-ink hover:border-ink/40"
        >
          Export CSV
        </Link>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-[13.5px]">
          <caption className="sr-only">
            {`Leads by ${dimensionLabels[params.dimension].toLowerCase()}, ${params.touch} touch, ${params.from} to ${params.to}`}
          </caption>
          <thead className="bg-muted text-left text-[12px] text-text-muted">
            <tr>
              <th scope="col" className="px-4 py-2">
                {dimensionLabels[params.dimension]}
              </th>
              <th scope="col" className="px-4 py-2 text-right">
                Leads
              </th>
              <th scope="col" className="px-4 py-2 text-right">
                Viewings
              </th>
              <th scope="col" className="px-4 py-2 text-right">
                Won
              </th>
              <th scope="col" className="px-4 py-2 text-right">
                Deal value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                  No leads in these dates.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.value}>
                <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                  {r.value}
                </th>
                <td className="px-4 py-2 text-right tabular-nums">{r.leads}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.viewings}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.won}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(r.dealValue)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <th scope="row" className="px-4 py-2 text-left">
                  Total
                </th>
                <td className="px-4 py-2 text-right tabular-nums">{total.leads}</td>
                <td className="px-4 py-2 text-right tabular-nums">{total.viewings}</td>
                <td className="px-4 py-2 text-right tabular-nums">{total.won}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(total.dealValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
