import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PropertyEditor } from "@/components/admin/properties/editor/property-editor";
import { resolveMapStyle } from "@/components/maps/map-style";
import { getDb } from "@/db/client";
import { loadEditorData } from "@/features/properties/editor-data";
import { currencyFormats } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const instant = false;

export async function generateMetadata(props: PageProps<"/admin/properties/[id]">) {
  const { id } = await props.params;
  return { title: `Listing ${id.slice(0, 8)}` };
}

export default async function PropertyEditorPage(props: PageProps<"/admin/properties/[id]">) {
  const { user } = await requireAdminPage();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const data = await loadEditorData(db, id);
  if (!data) notFound();
  const market = await loadSettings("market", db);
  const integrations = await loadSettings("integrations", db);
  const general = await loadSettings("general", db);
  const style = resolveMapStyle(integrations.googleMaps);
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title={data.row.title || "Untitled listing"}
        description={
          data.row.deletedAt
            ? "This listing is archived. Restore it from the Archived view to edit it."
            : undefined
        }
        breadcrumb={[
          { label: "Properties", href: "/admin/properties" },
          { label: data.row.reference },
        ]}
      />
      <PropertyEditor
        id={data.row.id}
        reference={data.row.reference}
        initial={data.input}
        initialUpdatedAt={data.row.updatedAt.toISOString()}
        initialStatus={data.row.status}
        media={data.media}
        options={data.options}
        activity={data.activity}
        nearby={data.nearby}
        serverNow={now}
        readOnly={user.readOnly || data.row.deletedAt !== null}
        market={{
          baseCurrency: market.baseCurrency.code,
          currencies: currencyFormats(market),
          areaUnit: market.areaUnit,
          distanceUnit: market.distanceUnit,
          permit: market.permit,
          rentPaymentOptions: market.rentPaymentOptions,
          furnishingOptions: market.furnishingOptions,
          ownershipTypes: market.ownershipTypes,
          mapCenter: market.mapCenter,
          mapZoom: market.mapZoom,
          styleUrl: style.styleUrl,
          siteName: general.agencyName,
        }}
      />
    </>
  );
}
