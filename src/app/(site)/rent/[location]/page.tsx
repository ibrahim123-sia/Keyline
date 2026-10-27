import { notFound } from "next/navigation";
import { SearchPage } from "@/components/site/search/search-page";
import { searchMetadata } from "@/features/search/metadata";
import { landingFor } from "@/features/search/page-data";
import { redirectIfMoved } from "@/features/seo/serve";

// Unknown areas answer with a real 404, so the slug is checked before streaming.
export const instant = false;

export async function generateMetadata(props: PageProps<"/rent/[location]">) {
  const { location } = await props.params;
  if (!(await landingFor(location, null))) {
    await redirectIfMoved(`/rent/${location}`);
    notFound();
  }
  return searchMetadata({ purpose: "rent", loc: [location] }, props.searchParams);
}

/** SEO landing: homes for rent in one area (06 §1). */
export default async function RentAreaPage(props: PageProps<"/rent/[location]">) {
  const { location } = await props.params;
  const landing = await landingFor(location, null);
  if (!landing) {
    await redirectIfMoved(`/rent/${location}`);
    notFound();
  }
  return (
    <SearchPage
      preset={{ purpose: "rent", loc: [location] }}
      landing={landing}
      searchParams={props.searchParams}
    />
  );
}
