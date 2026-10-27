import type { MetadataRoute } from "next";
import { getSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { env } from "@/lib/env";

/**
 * robots.txt from Settings -> SEO (08 §6): "Allow indexing" off, or a staging deployment,
 * blocks everything; otherwise admin, account and API addresses stay out.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSettings("seo");
  if (!seo.allowIndexing || env().PROPEL_ENV === "staging")
    return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // "$" ends a rule, so a page like /admin-fees is not caught by /admin.
      disallow: [
        "/admin$",
        "/admin/",
        "/api/",
        "/account$",
        "/account/",
        "/sign-in",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
