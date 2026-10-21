import { notFound } from "next/navigation";
import { SearchPage } from "@/components/site/search/search-page";
import { searchMetadata } from "@/features/search/metadata";
import { landingFor } from "@/features/search/page-data";

// Unknown areas or types answer with a real 404, so the slugs are checked before streaming.
export const instant = false;

export async function generateMetadata(props: PageProps<"/buy/[location]/[type]">) {
  const { location, type } = await props.params;
  if (!(await landingFor(location, type))) notFound();
  return searchMetadata({ purpose: "sale", loc: [location], type: [type] }, props.searchParams);
}

/** SEO landing: one property type in one area, e.g. /buy/dubai-marina/apartments (06 §1). */
export default async function BuyAreaTypePage(props: PageProps<"/buy/[location]/[type]">) {
  const { location, type } = await props.params;
  const landing = await landingFor(location, type);
  if (!landing) notFound();
  return (
    <SearchPage
      preset={{ purpose: "sale", loc: [location], type: [type] }}
      landing={landing}
      searchParams={props.searchParams}
    />
  );
}
