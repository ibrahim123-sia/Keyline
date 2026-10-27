import { notFound } from "next/navigation";
import { SearchPage } from "@/components/site/search/search-page";
import { searchMetadata } from "@/features/search/metadata";
import { landingFor } from "@/features/search/page-data";
import { redirectIfMoved } from "@/features/seo/serve";

// Unknown areas answer with a real 404, so the slug is checked before streaming.
export const instant = false;

export async function generateMetadata(props: PageProps<"/buy/[location]">) {
  const { location } = await props.params;
  if (!(await landingFor(location, null))) {
    await redirectIfMoved(`/buy/${location}`);
    notFound();
  }
  return searchMetadata({ purpose: "sale", loc: [location] }, props.searchParams);
}

/** SEO landing: homes for sale in one area (06 §1). */
export default async function BuyAreaPage(props: PageProps<"/buy/[location]">) {
  const { location } = await props.params;
  const landing = await landingFor(location, null);
  if (!landing) {
    await redirectIfMoved(`/buy/${location}`);
    notFound();
  }
  return (
    <SearchPage
      preset={{ purpose: "sale", loc: [location] }}
      landing={landing}
      searchParams={props.searchParams}
    />
  );
}
