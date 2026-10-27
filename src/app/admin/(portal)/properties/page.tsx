import { writingHelpersOn } from "@/features/ai/config";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PropertiesManager } from "@/components/admin/properties/properties-manager";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { badges } from "@/db/schema/master-data";
import { currencyFormats } from "@/features/properties/format";
import {
  listProperties,
  propertyFilterOptions,
  propertySortable,
} from "@/features/properties/queries";
import { listSavedViews } from "@/features/saved-views/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Properties" };
export const instant = false;

export default async function PropertiesPage(props: PageProps<"/admin/properties">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: propertySortable,
    defaultSort: { id: "updated", desc: true },
  });
  const db = await getDb();
  const [{ rows, total }, options, market, views, manualBadges] = await Promise.all([
    listProperties(params, db),
    propertyFilterOptions(db),
    loadSettings("market", db),
    listSavedViews("properties", db),
    db
      .select({ id: badges.id, name: badges.name })
      .from(badges)
      .where(and(eq(badges.agencyId, currentAgencyId()), eq(badges.autoRule, "none")))
      .orderBy(asc(badges.sortOrder), asc(badges.name)),
  ]);
  return (
    <>
      <PageHeader
        title="Properties"
        description="Every listing, from drafts to sold. Filters stay in the address, so a view can be shared."
        breadcrumb={[{ label: "Properties" }]}
      />
      <PropertiesManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        types={options.types}
        areas={options.areas}
        agents={options.agents}
        badges={manualBadges}
        currencies={currencyFormats(market)}
        savedViews={views}
        archived={params.get("archived") === "1"}
        readOnly={user.readOnly}
        aiHelpers={!user.readOnly && (await writingHelpersOn(db))}
      />
    </>
  );
}
