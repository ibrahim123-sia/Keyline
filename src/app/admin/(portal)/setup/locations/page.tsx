import { PageHeader } from "@/components/admin/page-header";
import { LocationsManager } from "@/components/admin/locations/locations-manager";
import { resolveMapStyle } from "@/components/maps/map-style";
import { listLocationNodes } from "@/features/locations/queries";
import { loadSettings } from "@/features/settings/queries";
import { getMasterList } from "@/features/master-data/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { areaUnitLabels } from "@/lib/units";

export const metadata = { title: "Locations" };
export const instant = false;

export default async function LocationsPage() {
  const { user } = await requireAdminPage();
  const [nodes, market, integrations, general, types] = await Promise.all([
    listLocationNodes(),
    loadSettings("market"),
    loadSettings("integrations"),
    loadSettings("general"),
    getMasterList("property-types"),
  ]);
  const style = resolveMapStyle(integrations.googleMaps);
  return (
    <>
      <PageHeader
        title="Locations"
        description="Country, city, area, community and building, with a map point and an optional boundary."
        breadcrumb={[{ label: "Setup" }, { label: "Locations" }]}
      />
      <LocationsManager
        nodes={nodes}
        styleUrl={style.styleUrl}
        mapCenter={market.mapCenter}
        mapZoom={market.mapZoom}
        siteName={general.agencyName}
        readOnly={user.readOnly}
        priceOptions={{
          types: types.map((t) => ({ id: t.id, name: t.name })),
          unitLabel: areaUnitLabels[market.areaUnit],
          currency: market.baseCurrency.code,
          rentPeriod: market.rentPeriod,
        }}
      />
    </>
  );
}
