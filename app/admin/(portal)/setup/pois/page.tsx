import { and, eq, isNotNull } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { PoisManager } from "@/components/admin/pois/pois-manager";
import { resolveMapStyle } from "@/components/maps/map-style";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { mapsConfigured } from "@/features/integrations/google-maps";
import { listMasterForAdmin } from "@/features/master-data/queries";
import { listPois, poiSortable } from "@/features/pois/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Places (POIs)" };
export const instant = false;

export default async function PoisPage(props: PageProps<"/admin/setup/pois">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: poiSortable,
    defaultSort: { id: "name", desc: false },
  });
  const db = await getDb();
  const [{ rows, total }, types, market, integrations, googleReady, centers] = await Promise.all([
    listPois(params, db),
    listMasterForAdmin("poi-types", db),
    loadSettings("market", db),
    loadSettings("integrations", db),
    mapsConfigured(db),
    db
      .select({ id: locations.id, name: locations.name, center: locations.center })
      .from(locations)
      .where(and(eq(locations.agencyId, currentAgencyId()), isNotNull(locations.center))),
  ]);
  return (
    <>
      <PageHeader
        title="Places (POIs)"
        description="Schools, metro stations, malls and other places measured from each listing."
        breadcrumb={[{ label: "Setup" }, { label: "Places" }]}
      />
      <PoisManager
        rows={JSON.parse(JSON.stringify(rows))}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          icon: t.icon,
          googlePlaceType: t.googlePlaceType,
          defaultSearchRadiusM: t.defaultSearchRadiusM,
        }))}
        centers={centers
          .filter((c) => c.center)
          .map((c) => ({ id: c.id, name: c.name, center: c.center! }))}
        styleUrl={resolveMapStyle(integrations.googleMaps).styleUrl}
        mapCenter={market.mapCenter}
        googleReady={googleReady}
        readOnly={user.readOnly}
      />
    </>
  );
}
