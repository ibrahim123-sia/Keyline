import { CampaignTabs } from "@/components/admin/campaigns/campaign-tabs";
import { UtmLinksManager } from "@/components/admin/campaigns/utm-links-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { siteOrigin } from "@/features/site/url";
import { listUtmLinks, utmLinkSortable } from "@/features/utm/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Campaigns" };
export const instant = false;

export default async function CampaignsPage(props: PageProps<"/admin/campaigns">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: utmLinkSortable,
    defaultSort: { id: "created", desc: true },
  });
  const { rows, total } = await listUtmLinks(params, await getDb());
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Links with campaign tags for ads, posts, emails and printed QR codes. Each one has a short link, and its clicks and leads are counted here."
        breadcrumb={[{ label: "Campaigns" }]}
      />
      <CampaignTabs current="links" />
      <UtmLinksManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        siteOrigin={siteOrigin()}
        readOnly={user.readOnly}
      />
    </>
  );
}
