import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { PageView } from "@/components/site/page-view";
import { pageMetadata } from "@/features/cms/page-metadata";
import { findPublicPage, pageRedirect } from "@/features/cms/page-public";

/**
 * Any /[slug] (06 §1): a published page from the page builder, in its template. An old address
 * redirects (slug changes add a 301); anything else is the helpful 404. The page is cached and
 * expires when it is published again.
 */
export const instant = false;

export async function generateMetadata(props: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = await findPublicPage(slug);
  return page ? pageMetadata(page, `/${page.slug}`) : {};
}

export default async function BuilderPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const page = await findPublicPage(slug);
  if (!page) {
    const moved = await pageRedirect(slug);
    if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.to);
    notFound();
  }
  // The home page lives at "/".
  if (page.isHome) permanentRedirect("/");
  return <PageView page={page} />;
}
